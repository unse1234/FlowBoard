// @ts-check

import { io } from "socket.io-client";

const SIGNALING_EVENTS = Object.freeze({
  VOICE_JOIN: "voice:join",
  VOICE_LEAVE: "voice:leave",
  VOICE_OFFER: "voice:offer",
  VOICE_ANSWER: "voice:answer",
  VOICE_ICE: "voice:ice",
});

const DEFAULT_TIMEOUT_MS = 5000;

export class SignalingService {
  #socket = null;
  #url;
  #auth;
  #eventHandlers = new Map();

  constructor({ url, auth = {} } = {}) {
    this.#url = url;
    this.#auth = auth;
  }

  async connect(timeoutMs = DEFAULT_TIMEOUT_MS) {
    if (this.#socket?.connected) {
      return;
    }

    if (!this.#socket) {
      this.#socket = io(this.#url, {
        auth: this.#auth,
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 500,
        reconnectionDelayMax: 5000,
        timeout: DEFAULT_TIMEOUT_MS,
        transports: ["websocket", "polling"],
      });

      this.#socket.on("connect", () => this.#invokeHandlers("connect", null));
      this.#socket.on("disconnect", (reason) =>
        this.#invokeHandlers("disconnect", reason),
      );
      this.#socket.on("connect_error", (error) =>
        this.#invokeHandlers("connect_error", error),
      );
      this.#socket.on("reconnect", () =>
        this.#invokeHandlers("reconnect", null),
      );

      for (const event of Object.values(SIGNALING_EVENTS)) {
        this.#socket.on(event, (payload) =>
          this.#invokeHandlers(event, payload),
        );
      }
    }

    if (this.#socket.connected) {
      return;
    }

    return new Promise((resolve, reject) => {
      const onConnect = () => {
        cleanup();
        resolve();
      };

      const onError = (error) => {
        cleanup();
        reject(error);
      };

      const onTimeout = () => {
        cleanup();
        reject(new Error("Socket connection timed out."));
      };

      const cleanup = () => {
        if (!this.#socket) return;
        this.#socket.off("connect", onConnect);
        this.#socket.off("connect_error", onError);
        clearTimeout(timeoutId);
      };

      const timeoutId = setTimeout(onTimeout, timeoutMs);
      this.#socket.once("connect", onConnect);
      this.#socket.once("connect_error", onError);
      this.#socket.connect();
    });
  }

  disconnect() {
    if (!this.#socket) return;
    this.#socket.disconnect();
    this.#socket = null;
    this.#eventHandlers.clear();
  }

  isConnected() {
    return this.#socket?.connected ?? false;
  }

  on(eventName, handler) {
    if (!this.#eventHandlers.has(eventName)) {
      this.#eventHandlers.set(eventName, new Set());
    }

    this.#eventHandlers.get(eventName).add(handler);

    return () => {
      this.#eventHandlers.get(eventName)?.delete(handler);
    };
  }

  async emit(eventName, payload, timeoutMs = DEFAULT_TIMEOUT_MS) {
    if (!this.#socket) {
      throw new Error("Signaling socket is not connected.");
    }

    return new Promise((resolve, reject) => {
      this.#socket
        .timeout(timeoutMs)
        .emit(eventName, payload, (error, response) => {
          if (error) return reject(error);
          resolve(response);
        });
    });
  }

  joinVoiceRoom({ roomId, userId, username }) {
    return this.emit(SIGNALING_EVENTS.VOICE_JOIN, { roomId, userId, username });
  }

  leaveVoiceRoom({ roomId, userId }) {
    return this.emit(SIGNALING_EVENTS.VOICE_LEAVE, { roomId, userId });
  }

  sendOffer({ roomId, userId, targetId, offer }) {
    return this.emit(SIGNALING_EVENTS.VOICE_OFFER, {
      roomId,
      userId,
      targetId,
      offer,
    });
  }

  sendAnswer({ roomId, userId, targetId, answer }) {
    return this.emit(SIGNALING_EVENTS.VOICE_ANSWER, {
      roomId,
      userId,
      targetId,
      answer,
    });
  }

  sendIceCandidate({ roomId, userId, targetId, candidate }) {
    return this.emit(SIGNALING_EVENTS.VOICE_ICE, {
      roomId,
      userId,
      targetId,
      candidate,
    });
  }

  #invokeHandlers(eventName, payload) {
    const handlers = this.#eventHandlers.get(eventName);
    if (!handlers) return;

    for (const handler of Array.from(handlers)) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`Signaling handler failed for ${eventName}:`, error);
      }
    }
  }
}

export const VOICE_SIGNALING_EVENTS = SIGNALING_EVENTS;
