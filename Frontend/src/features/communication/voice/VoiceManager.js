// @ts-check

import { MediaManager } from "./MediaManager.js";
import { PeerManager } from "./PeerManager.js";
import {
  SignalingService,
  VOICE_SIGNALING_EVENTS,
} from "./SignalingService.js";

const SPEAKING_THRESHOLD = 0.03;
const SPEAKING_SAMPLES = 128;

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BACKOFF_MS = [1000, 3000, 6000];
const DISCONNECTED_GRACE_MS = 8000;
const MAX_BUFFERED_ICE_CANDIDATES = 32;

const VOICE_EVENTS = Object.freeze({
  PARTICIPANTS_CHANGED: "participantsChanged",
  PARTICIPANT_UPDATED: "participantUpdated",
  LOCAL_SPEAKING_CHANGED: "localSpeakingChanged",
  CONNECTION_STATE_CHANGED: "connectionStateChanged",
  ERROR: "error",
});

export class VoiceManager {
  #roomId;
  #userId;
  #username;
  #mediaManager;
  #signalingService;
  #participants = new Map();
  #peerManagers = new Map();
  #eventHandlers = new Map();
  #audioContext = null;
  #analyser = null;
  #speakingMonitorId = null;
  #audioElements = new Map();
  #remoteSpeakingMonitors = new Map();
  #localParticipant = null;
  #isJoined = false;
  #iceServers;
  #reconnectAttempts = new Map();
  #reconnectTimers = new Map();
  #disconnectGraceTimers = new Map();
  #pendingRemoteIceCandidates = new Map();

  constructor({
    roomId,
    userId,
    username,
    signalingUrl,
    auth = {},
    iceServers,
  } = {}) {
    if (!roomId) {
      throw new Error("VoiceManager requires a roomId.");
    }

    if (!userId) {
      throw new Error("VoiceManager requires a userId.");
    }

    this.#roomId = roomId;
    this.#userId = userId;
    this.#username = username || "Guest";
    this.#iceServers = iceServers;
    this.#mediaManager = new MediaManager();
    this.#signalingService = new SignalingService({ url: signalingUrl, auth });
    this.#setupSignalingHandlers();
    this.#localParticipant = this.#createParticipant(
      userId,
      this.#username,
      true,
    );
    this.#participants.set(userId, this.#localParticipant);
  }

  get participants() {
    return Array.from(this.#participants.values());
  }

  get localParticipant() {
    return this.#localParticipant;
  }

  get isMuted() {
    return this.#mediaManager.isMuted();
  }

  get connectionState() {
    return this.#signalingService.isConnected() ? "connected" : "disconnected";
  }

  hasMicrophone() {
    return this.#mediaManager.hasStream();
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

  async connect() {
    try {
      await this.#signalingService.connect();
      this.#emit(VOICE_EVENTS.CONNECTION_STATE_CHANGED, this.connectionState);
    } catch (error) {
      this.#emit(VOICE_EVENTS.ERROR, error);
      throw error;
    }
  }

  async joinVoiceRoom() {
    if (!this.#mediaManager.hasStream()) {
      await this.requestMicrophone();
    }

    if (!this.#signalingService.isConnected()) {
      await this.connect();
    }

    await this.#signalingService.joinVoiceRoom({
      roomId: this.#roomId,
      userId: this.#userId,
      username: this.#username,
    });

    this.#isJoined = true;
    this.#emit(VOICE_EVENTS.PARTICIPANTS_CHANGED, this.participants);
  }

  async leaveVoiceRoom() {
    if (!this.#isJoined) {
      return;
    }

    this.#isJoined = false;

    if (this.#signalingService.isConnected()) {
      try {
        await this.#signalingService.leaveVoiceRoom({
          roomId: this.#roomId,
          userId: this.#userId,
        });
      } catch (error) {
        this.#emit(VOICE_EVENTS.ERROR, error);
      }
    }

    this.#cleanupLocalVoiceState();
  }

  async requestMicrophone() {
    const stream = await this.#mediaManager.requestMicrophone();
    this.#attachLocalStream(stream);
    this.#startVoiceActivityMonitor(stream);
    return stream;
  }

  mute() {
    const success = this.#mediaManager.mute();
    if (success) {
      this.#localParticipant.isSpeaking = false;
      this.#emit(VOICE_EVENTS.LOCAL_SPEAKING_CHANGED, false);
      this.#emit(VOICE_EVENTS.PARTICIPANT_UPDATED, this.#localParticipant);
    }
    return success;
  }

  unmute() {
    const success = this.#mediaManager.unmute();
    if (success) {
      this.#emit(VOICE_EVENTS.PARTICIPANT_UPDATED, this.#localParticipant);
    }
    return success;
  }

  async destroy() {
    await this.leaveVoiceRoom().catch(() => {});
    this.#signalingService.disconnect();
    this.#mediaManager.destroy();
    this.#stopVoiceActivityMonitor();
  }

  #setupSignalingHandlers() {
    this.#signalingService.on("connect", () => {
      this.#emit(VOICE_EVENTS.CONNECTION_STATE_CHANGED, this.connectionState);
    });

    this.#signalingService.on("disconnect", () => {
      this.#handleSignalingDisconnect();
    });

    this.#signalingService.on("connect_error", (error) => {
      this.#emit(VOICE_EVENTS.ERROR, error);
    });

    this.#signalingService.on("reconnect", () => {
      this.#handleSignalingReconnect();
    });

    this.#signalingService.on(VOICE_SIGNALING_EVENTS.VOICE_JOIN, (payload) => {
      this.#handleRemoteJoin(payload);
    });

    this.#signalingService.on(VOICE_SIGNALING_EVENTS.VOICE_LEAVE, (payload) => {
      this.#handleRemoteLeave(payload);
    });

    this.#signalingService.on(VOICE_SIGNALING_EVENTS.VOICE_OFFER, (payload) => {
      this.#handleRemoteOffer(payload);
    });

    this.#signalingService.on(
      VOICE_SIGNALING_EVENTS.VOICE_ANSWER,
      (payload) => {
        this.#handleRemoteAnswer(payload);
      },
    );

    this.#signalingService.on(VOICE_SIGNALING_EVENTS.VOICE_ICE, (payload) => {
      this.#handleRemoteIce(payload);
    });
  }

  #createParticipant(userId, username, isLocal = false) {
    return {
      userId,
      username,
      isLocal,
      isSpeaking: false,
      connectionState: "new",
      mediaStream: null,
    };
  }

  #emit(eventName, payload) {
    const handlers = this.#eventHandlers.get(eventName);
    if (!handlers) return;

    for (const handler of Array.from(handlers)) {
      try {
        handler(payload);
      } catch (error) {
        console.error(
          `VoiceManager event handler failed for ${eventName}:`,
          error,
        );
      }
    }
  }

  #ensureParticipant(payload) {
    const remoteId = payload?.userId;
    if (!remoteId || remoteId === this.#userId) return null;

    const username = payload.username || "Guest";
    const participant =
      this.#participants.get(remoteId) ??
      this.#createParticipant(remoteId, username);
    participant.username = username;
    this.#participants.set(remoteId, participant);
    return participant;
  }

  #cleanupLocalVoiceState() {
    this.#closeAllPeers();
    this.#stopVoiceActivityMonitor();
    this.#participants.clear();
    this.#localParticipant = this.#createParticipant(
      this.#userId,
      this.#username,
      true,
    );
    this.#participants.set(this.#userId, this.#localParticipant);
    this.#mediaManager.destroy();
    this.#emit(VOICE_EVENTS.PARTICIPANTS_CHANGED, this.participants);
  }

  #resetRemoteVoiceState() {
    this.#closeAllPeers();
    this.#participants.clear();
    this.#localParticipant = this.#createParticipant(
      this.#userId,
      this.#username,
      true,
    );
    this.#participants.set(this.#userId, this.#localParticipant);
    this.#emit(VOICE_EVENTS.PARTICIPANTS_CHANGED, this.participants);
  }

  #handleSignalingDisconnect() {
    for (const participant of this.#participants.values()) {
      if (!participant.isLocal) {
        participant.connectionState = "disconnected";
      }
    }
    this.#emit(VOICE_EVENTS.CONNECTION_STATE_CHANGED, this.connectionState);
    this.#emit(VOICE_EVENTS.PARTICIPANTS_CHANGED, this.participants);
  }

  async #handleSignalingReconnect() {
    this.#emit(VOICE_EVENTS.CONNECTION_STATE_CHANGED, this.connectionState);

    if (!this.#isJoined) {
      return;
    }

    this.#resetRemoteVoiceState();

    try {
      await this.joinVoiceRoom();
    } catch (error) {
      this.#emit(VOICE_EVENTS.ERROR, error);
    }
  }

  #handleRemoteJoin(payload) {
    const participant = this.#ensureParticipant(payload);
    if (!participant) return;

    participant.connectionState = "connecting";
    this.#emit(VOICE_EVENTS.PARTICIPANTS_CHANGED, this.participants);

    if (!this.#mediaManager.hasStream()) {
      return;
    }

    if (this.#shouldInitiateOffer(remoteIdToString(payload.userId))) {
      this.#createPeerAndOffer(payload.userId);
    }
  }

  #handleRemoteLeave(payload) {
    const remoteId = payload?.userId;
    if (!remoteId || remoteId === this.#userId) return;

    this.#closePeer(remoteId);
    this.#pendingRemoteIceCandidates.delete(remoteId);
    this.#participants.delete(remoteId);
    this.#emit(VOICE_EVENTS.PARTICIPANTS_CHANGED, this.participants);
  }

  #handleRemoteOffer(payload) {
    const remoteId = payload?.userId;
    if (!remoteId || remoteId === this.#userId) return;
    if (payload?.targetId !== this.#userId) return;

    const participant = this.#ensureParticipant(payload);
    if (!participant) return;

    const peerManager = this.#createPeerManager(remoteId);
    peerManager
      .setRemoteDescription(payload.offer)
      .then(async () => {
        const answer = await peerManager.createAnswer();
        await this.#signalingService.sendAnswer({
          roomId: this.#roomId,
          userId: this.#userId,
          targetId: remoteId,
          answer,
        });
      })
      .catch((error) => this.#emit(VOICE_EVENTS.ERROR, error));
  }

  #handleRemoteAnswer(payload) {
    const remoteId = payload?.userId;
    if (!remoteId || remoteId === this.#userId) return;
    if (payload?.targetId !== this.#userId) return;

    const peerManager = this.#peerManagers.get(remoteId);
    if (!peerManager) return;

    peerManager
      .setRemoteDescription(payload.answer)
      .catch((error) => this.#emit(VOICE_EVENTS.ERROR, error));
  }

  #handleRemoteIce(payload) {
    const remoteId = payload?.userId;
    if (!remoteId || remoteId === this.#userId) return;
    if (payload?.targetId !== this.#userId) return;

    const peerManager = this.#peerManagers.get(remoteId);
    if (!peerManager) {
      // The peer manager for this remote user hasn't been created yet
      // (e.g. the candidate arrived before the offer/answer that would
      // trigger its creation). Buffer it instead of dropping it silently
      // so it can be applied once the peer manager exists.
      this.#bufferPendingIceCandidate(remoteId, payload.candidate);
      return;
    }

    peerManager
      .addIceCandidate(payload.candidate)
      .catch((error) => this.#emit(VOICE_EVENTS.ERROR, error));
  }

  #bufferPendingIceCandidate(remoteId, candidate) {
    if (!candidate) return;

    const queue = this.#pendingRemoteIceCandidates.get(remoteId) ?? [];
    queue.push(candidate);
    if (queue.length > MAX_BUFFERED_ICE_CANDIDATES) {
      queue.shift();
    }
    this.#pendingRemoteIceCandidates.set(remoteId, queue);
  }

  #createPeerAndOffer(remoteId) {
    const peerManager = this.#createPeerManager(remoteId);
    peerManager
      .createOffer()
      .then((offer) => {
        return this.#signalingService.sendOffer({
          roomId: this.#roomId,
          userId: this.#userId,
          targetId: remoteId,
          offer,
        });
      })
      .catch((error) => this.#emit(VOICE_EVENTS.ERROR, error));
  }

  #createPeerManager(remoteId) {
    const existing = this.#peerManagers.get(remoteId);
    if (existing) return existing;

    const peerManager = new PeerManager(
      this.#iceServers ? { iceServers: this.#iceServers } : undefined,
    );
    this.#peerManagers.set(remoteId, peerManager);

    if (this.#mediaManager.hasStream()) {
      peerManager.addLocalStream(this.#mediaManager.getStream());
    }

    peerManager.onIceCandidate((candidate) => {
      this.#signalingService
        .sendIceCandidate({
          roomId: this.#roomId,
          userId: this.#userId,
          targetId: remoteId,
          candidate,
        })
        .catch((error) => this.#emit(VOICE_EVENTS.ERROR, error));
    });

    peerManager.onTrack((stream) => {
      const participant = this.#participants.get(remoteId);
      if (!participant) return;
      participant.mediaStream = stream;
      participant.connectionState = "connected";
      this.#attachRemoteAudio(remoteId, stream);
      this.#startRemoteSpeakingMonitor(remoteId, stream);
      this.#emit(VOICE_EVENTS.PARTICIPANT_UPDATED, participant);
      this.#emit(VOICE_EVENTS.PARTICIPANTS_CHANGED, this.participants);
    });

    peerManager.onConnectionStateChange((state) => {
      const participant = this.#participants.get(remoteId);
      if (participant) {
        participant.connectionState = state;
        this.#emit(VOICE_EVENTS.PARTICIPANT_UPDATED, participant);
      }

      if (state === "connected") {
        this.#reconnectAttempts.delete(remoteId);
        this.#clearDisconnectGraceTimer(remoteId);
        // A previously scheduled recovery attempt is now moot if the
        // connection recovered on its own before the backoff timer fired.
        this.#clearReconnectTimer(remoteId);
        return;
      }

      if (state === "failed") {
        // "failed" is the spec-defined terminal ICE state and never fires
        // as a side effect of our own close() calls, so it's safe to
        // unconditionally treat as a signal to recover.
        this.#clearDisconnectGraceTimer(remoteId);
        this.#attemptPeerRecovery(remoteId);
        return;
      }

      if (state === "disconnected") {
        // Often transient (the ICE agent may recover on its own), but some
        // browsers/platforms can get stuck here indefinitely without ever
        // reporting "failed". Give it a grace period before treating it as
        // failed too.
        this.#startDisconnectGraceTimer(remoteId);
        return;
      }

      // "closed" only ever happens as a result of code we already ran
      // (our own close(), recreatePeerConnection(), or exhausted retries),
      // so no recovery action is taken here to avoid a self-triggered loop.
    });

    if (this.#pendingRemoteIceCandidates.has(remoteId)) {
      const pendingCandidates = this.#pendingRemoteIceCandidates.get(remoteId);
      this.#pendingRemoteIceCandidates.delete(remoteId);
      for (const candidate of pendingCandidates) {
        peerManager
          .addIceCandidate(candidate)
          .catch((error) => this.#emit(VOICE_EVENTS.ERROR, error));
      }
    }

    return peerManager;
  }

  #closePeer(remoteId) {
    this.#reconnectAttempts.delete(remoteId);
    this.#clearReconnectTimer(remoteId);
    this.#clearDisconnectGraceTimer(remoteId);
    this.#pendingRemoteIceCandidates.delete(remoteId);

    const peerManager = this.#peerManagers.get(remoteId);
    if (!peerManager) return;

    peerManager.close();
    this.#peerManagers.delete(remoteId);
    this.#detachRemoteAudio(remoteId);
    this.#stopRemoteSpeakingMonitor(remoteId);
  }

  #attemptPeerRecovery(remoteId) {
    const peerManager = this.#peerManagers.get(remoteId);
    if (!peerManager || !this.#isJoined) return;

    const attempts = this.#reconnectAttempts.get(remoteId) ?? 0;
    if (attempts >= MAX_RECONNECT_ATTEMPTS) {
      this.#closePeer(remoteId);
      return;
    }

    this.#reconnectAttempts.set(remoteId, attempts + 1);
    this.#detachRemoteAudio(remoteId);
    this.#stopRemoteSpeakingMonitor(remoteId);
    // A candidate buffered against the old (now-failed) ICE session would
    // corrupt the freshly recreated connection if replayed into it.
    this.#pendingRemoteIceCandidates.delete(remoteId);
    // Ensure only one backoff timer is ever pending per peer: if recovery
    // is re-triggered (e.g. "failed" fires again, or the disconnect-grace
    // timer fires close to a "failed" event) before the previous backoff
    // elapsed, replace it rather than letting both run.
    this.#clearReconnectTimer(remoteId);

    const delay =
      RECONNECT_BACKOFF_MS[Math.min(attempts, RECONNECT_BACKOFF_MS.length - 1)];

    const timerId = setTimeout(async () => {
      this.#reconnectTimers.delete(remoteId);

      const currentPeerManager = this.#peerManagers.get(remoteId);
      if (!currentPeerManager || !this.#isJoined) return;

      try {
        await currentPeerManager.recreatePeerConnection();
        if (this.#shouldInitiateOffer(remoteId)) {
          this.#createPeerAndOffer(remoteId);
        }
      } catch (error) {
        this.#emit(VOICE_EVENTS.ERROR, error);
      }
    }, delay);

    this.#reconnectTimers.set(remoteId, timerId);
  }

  #clearReconnectTimer(remoteId) {
    const timerId = this.#reconnectTimers.get(remoteId);
    if (timerId) {
      clearTimeout(timerId);
      this.#reconnectTimers.delete(remoteId);
    }
  }

  #startDisconnectGraceTimer(remoteId) {
    if (this.#disconnectGraceTimers.has(remoteId)) return;

    const timerId = setTimeout(() => {
      this.#disconnectGraceTimers.delete(remoteId);

      const peerManager = this.#peerManagers.get(remoteId);
      if (peerManager?.connectionState === "disconnected") {
        this.#attemptPeerRecovery(remoteId);
      }
    }, DISCONNECTED_GRACE_MS);

    this.#disconnectGraceTimers.set(remoteId, timerId);
  }

  #clearDisconnectGraceTimer(remoteId) {
    const timerId = this.#disconnectGraceTimers.get(remoteId);
    if (timerId) {
      clearTimeout(timerId);
      this.#disconnectGraceTimers.delete(remoteId);
    }
  }

  #closeAllPeers() {
    for (const remoteId of Array.from(this.#peerManagers.keys())) {
      this.#closePeer(remoteId);
    }
  }

  #attachLocalStream(stream) {
    for (const peerManager of this.#peerManagers.values()) {
      peerManager.addLocalStream(stream);
    }

    if (this.#participants.has(this.#userId)) {
      this.#emit(VOICE_EVENTS.PARTICIPANT_UPDATED, this.#localParticipant);
    }

    for (const remoteId of this.#participants.keys()) {
      if (remoteId === this.#userId) continue;
      if (this.#shouldInitiateOffer(remoteId)) {
        this.#createPeerAndOffer(remoteId);
      }
    }
  }

  #shouldInitiateOffer(remoteId) {
    if (!remoteId || !this.#userId) return false;
    return String(this.#userId) < String(remoteId);
  }

  #startVoiceActivityMonitor(stream) {
    if (!stream || !stream.getAudioTracks().length) return;
    if (this.#audioContext) {
      return;
    }

    this.#audioContext = new AudioContext();
    const source = this.#audioContext.createMediaStreamSource(stream);
    this.#analyser = this.#audioContext.createAnalyser();
    this.#analyser.fftSize = SPEAKING_SAMPLES * 2;
    source.connect(this.#analyser);

    const data = new Uint8Array(this.#analyser.frequencyBinCount);
    const tick = () => {
      if (!this.#analyser) return;
      this.#analyser.getByteFrequencyData(data);
      const max = Math.max(...data) / 255;
      const speaking = max > SPEAKING_THRESHOLD && !this.isMuted;

      if (this.#localParticipant.isSpeaking !== speaking) {
        this.#localParticipant.isSpeaking = speaking;
        this.#emit(VOICE_EVENTS.LOCAL_SPEAKING_CHANGED, speaking);
        this.#emit(VOICE_EVENTS.PARTICIPANT_UPDATED, this.#localParticipant);
      }

      this.#speakingMonitorId = requestAnimationFrame(tick);
    };

    tick();
  }

  #stopVoiceActivityMonitor() {
    if (this.#speakingMonitorId) {
      cancelAnimationFrame(this.#speakingMonitorId);
      this.#speakingMonitorId = null;
    }

    if (this.#audioContext) {
      this.#audioContext.close().catch(() => {});
      this.#audioContext = null;
    }

    this.#analyser = null;
  }

  #startRemoteSpeakingMonitor(remoteId, stream) {
    if (!stream?.getAudioTracks().length) return;
    if (this.#remoteSpeakingMonitors.has(remoteId)) return;

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = SPEAKING_SAMPLES * 2;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const monitor = { audioContext, frameId: null, speaking: false };

    const tick = () => {
      const participant = this.#participants.get(remoteId);
      if (!participant || !this.#remoteSpeakingMonitors.has(remoteId)) return;

      analyser.getByteFrequencyData(data);
      const max = Math.max(...data) / 255;
      const speaking = max > SPEAKING_THRESHOLD;

      if (monitor.speaking !== speaking) {
        monitor.speaking = speaking;
        participant.isSpeaking = speaking;
        this.#emit(VOICE_EVENTS.PARTICIPANT_UPDATED, participant);
      }

      monitor.frameId = requestAnimationFrame(tick);
    };

    monitor.frameId = requestAnimationFrame(tick);
    this.#remoteSpeakingMonitors.set(remoteId, monitor);
  }

  #stopRemoteSpeakingMonitor(remoteId) {
    const monitor = this.#remoteSpeakingMonitors.get(remoteId);
    if (!monitor) return;

    if (monitor.frameId) {
      cancelAnimationFrame(monitor.frameId);
    }
    monitor.audioContext.close().catch(() => {});
    this.#remoteSpeakingMonitors.delete(remoteId);
  }

  #attachRemoteAudio(remoteId, stream) {
    this.#detachRemoteAudio(remoteId);

    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.playsInline = true;
    audio.muted = false;
    audio.srcObject = stream;
    audio.style.display = "none";
    audio.volume = 1.0;

    document.body.appendChild(audio);
    this.#audioElements.set(remoteId, audio);

    const playPromise = audio.play();
    if (playPromise?.catch) {
      playPromise.catch((error) => {
        console.warn("Unable to autoplay remote voice stream:", error);
      });
    }
  }

  #detachRemoteAudio(remoteId) {
    const audio = this.#audioElements.get(remoteId);
    if (!audio) return;

    try {
      if (audio.srcObject) {
        audio.srcObject = null;
      }
      audio.pause();
      audio.remove();
    } catch {
      // ignore cleanup errors
    }

    this.#audioElements.delete(remoteId);
  }
}

function remoteIdToString(id) {
  return id == null ? "" : String(id);
}
