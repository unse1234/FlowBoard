import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClientId } from "../../shared/id/createClientId.js";
import {
  getRealtimeUrl,
  resolveCollaborationUsername,
  saveCollaborationUsername,
} from "../config/realtimeConfig.js";
import { OperationDispatcher } from "../dispatch/OperationDispatcher.js";
import { CONNECTION_STATE } from "../manager/ConnectionState.js";
import { RealtimeManager } from "../manager/RealtimeManager.js";
import { OperationApplier } from "../operations/operationApplier.js";
import { SocketService } from "../socket/SocketService.js";

const EMPTY_REMOTE_PRESENCE = Object.freeze({});

export function useRealtimeCollaboration({ roomId, setShapes }) {
  const [status, setStatus] = useState(CONNECTION_STATE.IDLE);
  const [remotePresence, setRemotePresence] = useState({});
  const [username, setUsername] = useState(() =>
    roomId ? resolveCollaborationUsername(roomId) : null,
  );
  const userId = useMemo(() => createClientId("user"), []);
  const userColor = useMemo(() => pickUserColor(userId), [userId]);
  const lastPresenceSentAt = useRef(0);
  const dispatcherRef = useRef(null);

  useEffect(() => {
    if (!roomId) {
      setUsername(null);
      return;
    }

    const storedUsername = resolveCollaborationUsername(roomId);
    if (storedUsername) {
      setUsername(storedUsername);
      return;
    }

    const promptLabel = `Enter your display name for collaboration room '${roomId}'. This name will be saved for this room and reused on reload.`;
    let nextUsername = null;

    while (nextUsername === null) {
      const input = window.prompt(promptLabel, "");
      if (input === null) {
        nextUsername = "Guest";
        break;
      }

      const trimmed = input.trim();
      if (trimmed) {
        nextUsername = trimmed;
      } else {
        const retry = window.confirm(
          "Display name cannot be blank. Do you want to try again?",
        );
        if (!retry) {
          nextUsername = "Guest";
        }
      }
    }

    saveCollaborationUsername(roomId, nextUsername);
    setUsername(nextUsername);
  }, [roomId]);

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

    const unsubscribeStatus = realtimeManager.onStatusChange(setStatus);
    const unsubscribeOperations = realtimeManager.onOperation((operation) => {
      operationDispatcher.applyRemoteOperation(operation);
    });
    const unsubscribePresence = realtimeManager.onPresence((event) => {
      if (!event || typeof event !== "object") return;
      if (!event.userId || event.userId === userId) return;

      setRemotePresence((current) => {
        if (event.presence?.status === "offline") {
          const next = { ...current };
          delete next[event.userId];
          return next;
        }

        return {
          ...current,
          [event.userId]: {
            ...event,
            updatedAt: Date.now(),
          },
        };
      });
    });

    realtimeManager.connect();

    return () => {
      dispatcherRef.current = null;
      unsubscribeStatus();
      unsubscribeOperations();
      unsubscribePresence();
      realtimeManager.disconnect();
    };
  }, [operationDispatcher, realtimeManager, userId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = Date.now();

      setRemotePresence((current) =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([, event]) => now - event.updatedAt < 10000,
          ),
        ),
      );
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, []);

  const publishLocalOperation = useCallback((type, payload) => {
    return dispatcherRef.current?.dispatchLocalOperation(type, payload) ?? null;
  }, []);

  const publishPresence = useCallback(
    (presence) => {
      if (!realtimeManager) return;

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
    status: roomId ? status : CONNECTION_STATE.IDLE,
    remotePresence: roomId ? remotePresence : EMPTY_REMOTE_PRESENCE,
    publishLocalOperation,
    publishPresence,
  };
}

function pickUserColor(userId) {
  const colors = [
    "#2563eb",
    "#dc2626",
    "#16a34a",
    "#9333ea",
    "#ea580c",
    "#0891b2",
  ];
  const hash = String(userId)
    .split("")
    .reduce((total, char) => total + char.charCodeAt(0), 0);

  return colors[hash % colors.length];
}
