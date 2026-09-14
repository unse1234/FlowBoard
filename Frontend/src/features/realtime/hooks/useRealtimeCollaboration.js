import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pickCollaboratorColor } from "../../../constants/presence.js";
import { createClientId } from "../../shared/id/createClientId.js";
import {
  getRealtimeUrl,
  rememberDisplayName,
  resolveCollaborationUsername,
  resolveLastDisplayName,
  saveCollaborationUsername,
} from "../config/realtimeConfig.js";
import { OperationDispatcher } from "../dispatch/OperationDispatcher.js";
import { CONNECTION_STATE } from "../manager/ConnectionState.js";
import { RealtimeManager } from "../manager/RealtimeManager.js";
import { OperationApplier } from "../operations/operationApplier.js";
import { SocketService } from "../socket/SocketService.js";

const EMPTY_REMOTE_PRESENCE = Object.freeze({});

/** A cursor that has not moved for this long drops its name label. */
export const CURSOR_IDLE_MS = 3000;

/** Presence not refreshed for this long is treated as gone. */
const PRESENCE_TIMEOUT_MS = 10000;

/**
 * How often a connected client re-announces itself. Well inside the timeout,
 * so someone reading the board without moving stays in the people list.
 */
const PRESENCE_HEARTBEAT_MS = 4000;

/** First announcement after connecting, once the board join has settled. */
const PRESENCE_FIRST_BEAT_MS = 800;

/** How often idle and stale presence is swept. */
const PRESENCE_SWEEP_MS = 1000;

const GUEST_NAME = "Guest";

function readIdentity(roomId) {
  return {
    roomId,
    username: roomId ? resolveCollaborationUsername(roomId) : null,
  };
}

function isSameCursor(a, b) {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y;
}

/** Presence that says "I'm here", repeating the last cursor position if any. */
function announcement(userId, color, cursor) {
  return {
    userId,
    color,
    status: "online",
    ...(cursor ? { cursor } : {}),
  };
}

/** Delay before answering a newcomer, so several arrivals share one reply. */
const NEWCOMER_REPLY_MS = 300;

export function useRealtimeCollaboration({ roomId, setShapes }) {
  const [status, setStatus] = useState(CONNECTION_STATE.IDLE);
  const [remotePresence, setRemotePresence] = useState({});

  // A display name belongs to a room. It is stored alongside the room it was
  // read for and re-read during render when the room changes, so entering a
  // room never shows the previous room's name and needs no effect. Until a
  // name exists the connection is not opened; the UI asks for one instead of
  // blocking the page with a prompt.
  const [identity, setIdentity] = useState(() => readIdentity(roomId));
  if (identity.roomId !== roomId) {
    setIdentity(readIdentity(roomId));
  }
  const username = identity.roomId === roomId ? identity.username : null;

  const [suggestedDisplayName] = useState(() => resolveLastDisplayName() ?? "");

  const userId = useMemo(() => createClientId("user"), []);
  const userColor = useMemo(() => pickCollaboratorColor(userId), [userId]);
  const lastPresenceSentAt = useRef(0);
  const lastCursorRef = useRef(null);
  const knownPeersRef = useRef(new Set());
  const dispatcherRef = useRef(null);

  /** Set this room's display name; a blank name joins as "Guest". */
  const setDisplayName = useCallback(
    (name) => {
      if (!roomId) return;

      const trimmed = String(name ?? "").trim();
      const nextUsername = trimmed || GUEST_NAME;

      saveCollaborationUsername(roomId, nextUsername);
      if (trimmed) rememberDisplayName(trimmed);
      setIdentity({ roomId, username: nextUsername });
    },
    [roomId],
  );

  const { realtimeManager, operationDispatcher } = useMemo(() => {
    if (!roomId || !username) {
      return {
        realtimeManager: null,
        operationDispatcher: null,
      };
    }

    const socketService = new SocketService({
      url: getRealtimeUrl(),
      auth: { userId },
    });

    const manager = new RealtimeManager({
      socketService,
      boardId: roomId,
      user: {
        id: userId,
        username,
        color: userColor,
      },
    });

    const dispatcher = new OperationDispatcher({
      boardId: roomId,
      userId,
      realtimeManager: manager,
      operationApplier: new OperationApplier(),
      setShapes,
    });

    return {
      realtimeManager: manager,
      operationDispatcher: dispatcher,
    };
  }, [roomId, setShapes, userColor, userId, username]);

  useEffect(() => {
    if (!realtimeManager || !operationDispatcher) {
      dispatcherRef.current = null;
      return undefined;
    }

    dispatcherRef.current = operationDispatcher;
    knownPeersRef.current = new Set();

    // When someone new appears, answer with our own presence straight away so
    // they list us immediately instead of at our next heartbeat.
    let replyTimeoutId = null;
    const replyToNewcomer = () => {
      if (replyTimeoutId !== null) return;

      replyTimeoutId = window.setTimeout(() => {
        replyTimeoutId = null;
        realtimeManager.publishPresence(
          announcement(userId, userColor, lastCursorRef.current),
        );
      }, NEWCOMER_REPLY_MS);
    };

    const unsubscribeStatus = realtimeManager.onStatusChange(setStatus);
    const unsubscribeOperations = realtimeManager.onOperation((operation) => {
      operationDispatcher.applyRemoteOperation(operation);
    });
    const unsubscribePresence = realtimeManager.onPresence((event) => {
      if (!event || typeof event !== "object") return;
      if (!event.userId || event.userId === userId) return;

      const knownPeers = knownPeersRef.current;
      if (event.presence?.status === "offline") {
        knownPeers.delete(event.userId);
      } else if (!knownPeers.has(event.userId)) {
        knownPeers.add(event.userId);
        replyToNewcomer();
      }

      setRemotePresence((current) => {
        if (event.presence?.status === "offline") {
          const next = { ...current };
          delete next[event.userId];
          return next;
        }

        const now = Date.now();
        const previous = current[event.userId];
        const cursor = event.presence?.cursor ?? null;

        // Heartbeats repeat the last cursor position; only a real move counts
        // as activity, so a parked cursor's label is not re-shown every beat.
        const moved = !previous || !isSameCursor(previous.presence?.cursor ?? null, cursor);

        return {
          ...current,
          [event.userId]: {
            ...event,
            updatedAt: now,
            movedAt: moved ? now : previous.movedAt,
            idle: moved ? false : Boolean(previous.idle),
          },
        };
      });
    });

    realtimeManager.connect();

    return () => {
      window.clearTimeout(replyTimeoutId);
      dispatcherRef.current = null;
      unsubscribeStatus();
      unsubscribeOperations();
      unsubscribePresence();
      realtimeManager.disconnect();
    };
  }, [operationDispatcher, realtimeManager, userColor, userId]);

  // Announce ourselves while connected, so peers list us even before — and
  // long after — we move the pointer.
  useEffect(() => {
    if (!realtimeManager || status !== CONNECTION_STATE.CONNECTED) return undefined;

    const beat = () => {
      realtimeManager.publishPresence(announcement(userId, userColor, lastCursorRef.current));
    };

    const firstBeatId = window.setTimeout(beat, PRESENCE_FIRST_BEAT_MS);
    const intervalId = window.setInterval(beat, PRESENCE_HEARTBEAT_MS);

    return () => {
      window.clearTimeout(firstBeatId);
      window.clearInterval(intervalId);
    };
  }, [realtimeManager, status, userColor, userId]);

  // Sweep presence: drop people not heard from in a while, and mark cursors
  // idle so their labels fade. Returning the same object when nothing changed
  // means the sweep costs no render.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = Date.now();

      setRemotePresence((current) => {
        let changed = false;
        const next = {};

        for (const [id, event] of Object.entries(current)) {
          if (now - event.updatedAt >= PRESENCE_TIMEOUT_MS) {
            changed = true;
            continue;
          }

          const idle = now - (event.movedAt ?? event.updatedAt) >= CURSOR_IDLE_MS;
          if (idle !== Boolean(event.idle)) {
            changed = true;
            next[id] = { ...event, idle };
          } else {
            next[id] = event;
          }
        }

        return changed ? next : current;
      });
    }, PRESENCE_SWEEP_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  const publishLocalOperation = useCallback((type, payload) => {
    return dispatcherRef.current?.dispatchLocalOperation(type, payload) ?? null;
  }, []);

  const publishPresence = useCallback(
    (presence) => {
      if (!realtimeManager) return;

      if (presence?.cursor) lastCursorRef.current = presence.cursor;

      const now = Date.now();
      if (now - lastPresenceSentAt.current < 50) return;

      lastPresenceSentAt.current = now;
      realtimeManager.publishPresence({
        ...presence,
        userId,
        color: userColor,
      });
    },
    [realtimeManager, userColor, userId],
  );

  return {
    boardId: roomId,
    roomId,
    isEnabled: Boolean(roomId),
    userId,
    username,
    userColor,
    needsDisplayName: Boolean(roomId) && !username,
    suggestedDisplayName,
    setDisplayName,
    status: roomId ? status : CONNECTION_STATE.IDLE,
    remotePresence: roomId ? remotePresence : EMPTY_REMOTE_PRESENCE,
    publishLocalOperation,
    publishPresence,
  };
}
