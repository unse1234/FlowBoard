// @ts-check

import { CONNECTION_STATE } from "./ConnectionState.js";
import { SOCKET_EVENTS } from "../socket/socketEvents.js";

const DEFAULT_ACK_TIMEOUT_MS = 5000;

export class RealtimeManager {
  #socketService;
  #boardId;
  #user;
  #logger;
  #joined = false;
  #role = null;
  #pendingOperations = new Map();
  #accessHandlers = new Set();
  #operationHandlers = new Set();
  #presenceHandlers = new Set();
  #statusHandlers = new Set();
  #unsubscribers = [];

  /**
   * @param {Object} config
   * @param {import("../socket/SocketService.js").SocketService} config.socketService
   * @param {string} config.boardId
   * @param {{ id: string, username?: string, color?: string }} config.user
   * @param {Pick<Console, "info" | "warn" | "error">} [config.logger]
   */
  constructor({ socketService, boardId, user, logger = console }) {
    this.#socketService = socketService;
    this.#boardId = boardId;
    this.#user = user;
    this.#logger = logger;
  }

  connect() {
    this.#setStatus(CONNECTION_STATE.CONNECTING);
    this.#registerSocketHandlers();
    this.#socketService.connect();
  }

  async disconnect() {
    if (this.#joined) await this.#leaveBoard();

    this.#unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.#unsubscribers = [];
    this.#socketService.disconnect();
    this.#joined = false;
    this.#setStatus(CONNECTION_STATE.DISCONNECTED);
  }

  /**
   * @param {(operation: unknown) => void} handler
   * @returns {() => void}
   */
  onOperation(handler) {
    this.#operationHandlers.add(handler);

    return () => this.#operationHandlers.delete(handler);
  }

  /**
   * @param {(status: string) => void} handler
   * @returns {() => void}
   */
  onStatusChange(handler) {
    this.#statusHandlers.add(handler);

    return () => this.#statusHandlers.delete(handler);
  }

  /**
   * Things the server decided about this client's access (a server with
   * accounts only):
   * - `{ type: "role", role }`: joined, or the role changed while joined
   * - `{ type: "denied", code }`: the board refused the join
   * - `{ type: "revoked", code }`: access was withdrawn while on the board
   * - `{ type: "session-ended" }`: the server closed the connection because
   *   the session behind it ended
   * - `{ type: "refused", code }`: the handshake was refused (no or stale
   *   token, session ended, too many attempts)
   *
   * @param {(event: { type: string, code?: string, role?: string }) => void} handler
   * @returns {() => void}
   */
  onAccess(handler) {
    this.#accessHandlers.add(handler);

    return () => this.#accessHandlers.delete(handler);
  }

  /** The role the server granted on this board, or null before joining. */
  getRole() {
    return this.#role;
  }

  /** Connect again after the caller has dealt with a refusal, such as by refreshing the session. */
  reconnect() {
    this.#setStatus(CONNECTION_STATE.CONNECTING);
    this.#socketService.connect();
  }

  /**
   * @param {(presence: unknown) => void} handler
   * @returns {() => void}
   */
  onPresence(handler) {
    this.#presenceHandlers.add(handler);

    return () => this.#presenceHandlers.delete(handler);
  }

  /**
   * @param {import("../operations/operationTypes.js").BoardOperation} operation
   */
  publishOperation(operation) {
    this.#pendingOperations.set(operation.operationId, operation);
    this.#flushPendingOperations();
  }

  /**
   * @param {Record<string, unknown>} presence
   */
  publishPresence(presence) {
    if (!this.#joined || !this.#socketService.isConnected()) return;

    this.#socketService
      .emitWithAck(
        SOCKET_EVENTS.PRESENCE_UPDATE,
        {
          boardId: this.#boardId,
          user: this.#user,
          presence,
        },
        DEFAULT_ACK_TIMEOUT_MS,
      )
      .catch((error) => {
        this.#logger.warn?.("Presence update failed.", error);
      });
  }

  #registerSocketHandlers() {
    if (this.#unsubscribers.length) return;

    this.#unsubscribers.push(
      this.#socketService.on(SOCKET_EVENTS.CONNECT, () => {
        this.#setStatus(CONNECTION_STATE.CONNECTED);
        // A resumed connection is still in the board's room, and the server
        // re-checked its access; it received what it missed. Only a new one
        // joins, which also replays the board's history: a full re-sync.
        if (this.#socketService.wasRecovered?.() && this.#role) {
          this.#joined = true;
          this.#flushPendingOperations();
          return;
        }
        this.#joinBoard().catch((error) => this.#handleError(error));
      }),
    );

    this.#unsubscribers.push(
      this.#socketService.on(SOCKET_EVENTS.DISCONNECT, () => {
        this.#joined = false;
        this.#setStatus(CONNECTION_STATE.RECONNECTING);
      }),
    );

    this.#unsubscribers.push(
      this.#socketService.on(SOCKET_EVENTS.CONNECT_ERROR, (error) => {
        const code = error?.data?.code;
        if (typeof code === "string") this.#notifyAccess({ type: "refused", code });
        this.#handleError(error);
      }),
    );

    this.#unsubscribers.push(
      this.#socketService.on(SOCKET_EVENTS.SESSION_ENDED, () => {
        this.#joined = false;
        this.#notifyAccess({ type: "session-ended" });
      }),
    );

    this.#unsubscribers.push(
      this.#socketService.on(SOCKET_EVENTS.BOARD_ACCESS_REVOKED, (event) => {
        if (event?.boardId !== this.#boardId) return;
        this.#joined = false;
        this.#role = null;
        this.#notifyAccess({ type: "revoked", code: typeof event.code === "string" ? event.code : "BOARD_NOT_FOUND" });
      }),
    );

    this.#unsubscribers.push(
      this.#socketService.on(SOCKET_EVENTS.BOARD_ROLE_CHANGED, (event) => {
        if (event?.boardId !== this.#boardId || typeof event.role !== "string") return;
        this.#role = event.role;
        this.#notifyAccess({ type: "role", role: event.role });
      }),
    );

    this.#unsubscribers.push(
      this.#socketService.on(SOCKET_EVENTS.BOARD_EVENT, (event) => {
        const operation = extractOperation(event);
        if (!operation) return;

        this.#operationHandlers.forEach((handler) => handler(operation));
      }),
    );

    this.#unsubscribers.push(
      this.#socketService.on(SOCKET_EVENTS.PRESENCE_UPDATE, (event) => {
        this.#presenceHandlers.forEach((handler) => handler(event));
      }),
    );
  }

  async #joinBoard() {
    const response = await this.#socketService.emitWithAck(
      SOCKET_EVENTS.BOARD_JOIN,
      {
        boardId: this.#boardId,
        user: this.#user,
      },
      DEFAULT_ACK_TIMEOUT_MS,
    );

    if (!isOkResponse(response)) {
      const code = response && typeof response === "object" && typeof response.code === "string" ? response.code : null;
      if (code) this.#notifyAccess({ type: "denied", code });
      throw new Error(getResponseError(response, "Unable to join board."));
    }

    this.#joined = true;
    // A server with accounts says which role it granted; one without does not.
    if (typeof response.role === "string") {
      this.#role = response.role;
      this.#notifyAccess({ type: "role", role: response.role });
    }
    this.#logger.info?.(`Joined realtime board ${this.#boardId}.`);
    this.#flushPendingOperations();
  }

  async #leaveBoard() {
    try {
      await this.#socketService.emitWithAck(
        SOCKET_EVENTS.BOARD_LEAVE,
        { boardId: this.#boardId },
        DEFAULT_ACK_TIMEOUT_MS,
      );
    } catch (error) {
      this.#logger.warn?.("Failed to leave realtime board cleanly.", error);
    }
  }

  #flushPendingOperations() {
    if (!this.#joined || !this.#socketService.isConnected()) return;

    for (const operation of this.#pendingOperations.values()) {
      this.#sendOperation(operation).catch((error) => {
        this.#logger.warn?.("Realtime operation send failed; it remains queued.", error);
      });
    }
  }

  /**
   * @param {import("../operations/operationTypes.js").BoardOperation} operation
   */
  async #sendOperation(operation) {
    const response = await this.#socketService.emitWithAck(
      SOCKET_EVENTS.BOARD_EVENT,
      { operation },
      DEFAULT_ACK_TIMEOUT_MS,
    );

    if (!isOkResponse(response)) {
      throw new Error(getResponseError(response, "Server rejected realtime operation."));
    }

    this.#pendingOperations.delete(operation.operationId);
  }

  #handleError(error) {
    this.#logger.error?.("Realtime connection error.", error);
    this.#setStatus(CONNECTION_STATE.ERROR);
  }

  #setStatus(status) {
    this.#statusHandlers.forEach((handler) => handler(status));
  }

  #notifyAccess(event) {
    this.#accessHandlers.forEach((handler) => handler(event));
  }
}

/**
 * @param {unknown} event
 * @returns {unknown | null}
 */
function extractOperation(event) {
  if (!event || typeof event !== "object") return null;
  if ("operation" in event) return event.operation;

  return event;
}

/**
 * @param {unknown} response
 * @returns {boolean}
 */
function isOkResponse(response) {
  return Boolean(response && typeof response === "object" && response.ok === true);
}

/**
 * @param {unknown} response
 * @param {string} fallback
 * @returns {string}
 */
function getResponseError(response, fallback) {
  if (response && typeof response === "object" && "error" in response) {
    return String(response.error);
  }

  return fallback;
}
