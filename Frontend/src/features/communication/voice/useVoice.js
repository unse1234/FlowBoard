// @ts-check

import { useCallback, useEffect, useRef, useState } from "react";
import { getRealtimeUrl } from "../../realtime/config/realtimeConfig.js";
import { VoiceManager } from "./VoiceManager.js";

export function useVoice({ roomId, userId, username, signalingUrl } = {}) {
  const managerRef = useRef(null);
  const [participants, setParticipants] = useState([]);
  const [connectionState, setConnectionState] = useState("disconnected");
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [hasMicrophone, setHasMicrophone] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [error, setError] = useState(null);

  const resolvedSignalingUrl = signalingUrl ?? getRealtimeUrl();

  useEffect(() => {
    if (!roomId || !userId) {
      return undefined;
    }

    const manager = new VoiceManager({
      roomId,
      userId,
      username,
      signalingUrl: resolvedSignalingUrl,
      auth: { userId },
    });

    managerRef.current = manager;

    const unsubscribers = [
      manager.on("participantsChanged", (nextParticipants) => {
        setParticipants(
          Array.isArray(nextParticipants) ? nextParticipants : [],
        );
      }),
      manager.on("participantUpdated", () => {
        setParticipants(Array.from(manager.participants));
      }),
      manager.on("connectionStateChanged", setConnectionState),
      manager.on("localSpeakingChanged", setLocalSpeaking),
      manager.on("error", (nextError) => {
        setError(nextError);
      }),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe?.());
      manager.destroy();
      managerRef.current = null;
    };
  }, [roomId, userId, username, resolvedSignalingUrl]);

  const requestMicrophone = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager) {
      throw new Error("Voice manager is not initialized.");
    }

    try {
      await manager.requestMicrophone();
      setIsMuted(manager.isMuted);
      setHasMicrophone(manager.hasMicrophone());
    } catch (nextError) {
      setError(nextError);
      throw nextError;
    }
  }, []);

  const connect = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager) {
      throw new Error("Voice manager is not initialized.");
    }

    try {
      await manager.connect();
    } catch (nextError) {
      setError(nextError);
      throw nextError;
    }
  }, []);

  const joinVoice = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager) {
      throw new Error("Voice manager is not initialized.");
    }

    try {
      await manager.joinVoiceRoom();
      setIsJoined(true);
      setHasMicrophone(manager.hasMicrophone());
      setIsMuted(manager.isMuted);
      setParticipants(Array.from(manager.participants));
    } catch (nextError) {
      setError(nextError);
      throw nextError;
    }
  }, []);

  const leaveVoice = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager) return;

    try {
      await manager.leaveVoiceRoom();
      setIsJoined(false);
      setHasMicrophone(manager.hasMicrophone());
      setIsMuted(manager.isMuted);
      setParticipants(Array.from(manager.participants));
    } catch (nextError) {
      setError(nextError);
      throw nextError;
    }
  }, []);

  const mute = useCallback(() => {
    const manager = managerRef.current;
    if (!manager) return false;

    const result = manager.mute();
    setIsMuted(manager.isMuted);
    return result;
  }, []);

  const unmute = useCallback(() => {
    const manager = managerRef.current;
    if (!manager) return false;

    const result = manager.unmute();
    setIsMuted(manager.isMuted);
    return result;
  }, []);

  const stopVoice = useCallback(() => {
    const manager = managerRef.current;
    if (!manager) return;

    manager.destroy();
    setIsJoined(false);
    setHasMicrophone(false);
    setParticipants([]);
    setConnectionState("disconnected");
    setLocalSpeaking(false);
    setIsMuted(true);
  }, []);

  return {
    participants,
    connectionState,
    localSpeaking,
    isMuted,
    hasMicrophone,
    isJoined,
    error,
    requestMicrophone,
    connect,
    joinVoice,
    leaveVoice,
    mute,
    unmute,
    stopVoice,
  };
}
