// @ts-check

const DEFAULT_ICE_SERVERS = [{ urls: ["stun:stun.l.google.com:19302"] }];

export class PeerManager {
  #peerConnection = null;
  #localStream = null;
  #iceServers;
  #trackHandlers = new Set();
  #iceCandidateHandlers = new Set();
  #connectionStateHandlers = new Set();
  #signalingStateHandlers = new Set();
  #iceConnectionStateHandlers = new Set();
  #pendingIceCandidates = [];
  #remoteDescriptionApplied = false;

  constructor({ iceServers = DEFAULT_ICE_SERVERS } = {}) {
    this.#iceServers = iceServers;
    this.#createPeerConnection();
  }

  get connectionState() {
    return this.#peerConnection?.connectionState ?? "closed";
  }

  get signalingState() {
    return this.#peerConnection?.signalingState ?? "closed";
  }

  get iceConnectionState() {
    return this.#peerConnection?.iceConnectionState ?? "closed";
  }

  addTrack(track, stream) {
    if (!this.#peerConnection) {
      throw new Error("Peer connection is not initialized.");
    }

    return this.#peerConnection.addTrack(track, stream);
  }

  addLocalStream(stream) {
    if (!stream) {
      throw new Error("Local stream is required to add tracks.");
    }

    this.#localStream = stream;
    this.#resetLocalTracks();
  }

  removeLocalStream() {
    if (!this.#peerConnection) {
      this.#localStream = null;
      return;
    }

    this.#peerConnection.getSenders().forEach((sender) => {
      if (sender.track) {
        this.#peerConnection.removeTrack(sender);
      }
    });

    this.#localStream = null;
  }

  async createOffer({ offerToReceiveAudio = true } = {}) {
    const pc = this.#requireConnection();
    const offer = await pc.createOffer({ offerToReceiveAudio });
    await pc.setLocalDescription(offer);
    return offer;
  }

  async createAnswer() {
    const pc = this.#requireConnection();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return answer;
  }

  async setRemoteDescription(description) {
    const pc = this.#requireConnection();
    await pc.setRemoteDescription(description);

    this.#remoteDescriptionApplied = true;
    if (this.#pendingIceCandidates.length) {
      const pending = [...this.#pendingIceCandidates];
      this.#pendingIceCandidates.length = 0;
      await Promise.all(
        pending.map((candidate) => pc.addIceCandidate(candidate)),
      );
    }
  }

  async addIceCandidate(candidate) {
    if (!candidate) return;
    const pc = this.#requireConnection();

    if (!this.#remoteDescriptionApplied) {
      this.#pendingIceCandidates.push(candidate);
      return;
    }

    await pc.addIceCandidate(candidate);
  }

  onTrack(handler) {
    this.#trackHandlers.add(handler);
    return () => this.#trackHandlers.delete(handler);
  }

  onIceCandidate(handler) {
    this.#iceCandidateHandlers.add(handler);
    return () => this.#iceCandidateHandlers.delete(handler);
  }

  onConnectionStateChange(handler) {
    this.#connectionStateHandlers.add(handler);
    return () => this.#connectionStateHandlers.delete(handler);
  }

  onSignalingStateChange(handler) {
    this.#signalingStateHandlers.add(handler);
    return () => this.#signalingStateHandlers.delete(handler);
  }

  onIceConnectionStateChange(handler) {
    this.#iceConnectionStateHandlers.add(handler);
    return () => this.#iceConnectionStateHandlers.delete(handler);
  }

  async recreatePeerConnection() {
    const localStream = this.#localStream;
    this.close();
    this.#createPeerConnection();
    if (localStream) {
      this.addLocalStream(localStream);
    }
  }

  close() {
    if (!this.#peerConnection) return;
    try {
      this.#peerConnection.close();
    } finally {
      this.#peerConnection = null;
      this.#pendingIceCandidates = [];
      this.#remoteDescriptionApplied = false;
    }
  }

  #requireConnection() {
    if (!this.#peerConnection) {
      throw new Error("RTCPeerConnection has not been created.");
    }

    return this.#peerConnection;
  }

  #createPeerConnection() {
    if (typeof globalThis.RTCPeerConnection !== "function") {
      throw new Error("Browser does not support WebRTC RTCPeerConnection.");
    }

    this.#peerConnection = new RTCPeerConnection({
      iceServers: this.#iceServers,
    });
    this.#peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.#iceCandidateHandlers.forEach((handler) =>
          handler(event.candidate),
        );
      }
    };

    this.#peerConnection.ontrack = (event) => {
      const stream =
        event.streams && event.streams.length > 0
          ? event.streams[0]
          : new MediaStream([event.track]);
      this.#trackHandlers.forEach((handler) => handler(stream, event));
    };

    this.#peerConnection.onconnectionstatechange = () => {
      this.#connectionStateHandlers.forEach((handler) =>
        handler(this.connectionState),
      );
    };

    this.#peerConnection.onsignalingstatechange = () => {
      this.#signalingStateHandlers.forEach((handler) =>
        handler(this.signalingState),
      );
    };

    this.#peerConnection.oniceconnectionstatechange = () => {
      this.#iceConnectionStateHandlers.forEach((handler) =>
        handler(this.iceConnectionState),
      );
    };

    if (this.#localStream) {
      this.#resetLocalTracks();
    }
  }

  #resetLocalTracks() {
    if (!this.#peerConnection || !this.#localStream) return;

    this.#peerConnection.getSenders().forEach((sender) => {
      if (sender.track) {
        this.#peerConnection.removeTrack(sender);
      }
    });

    this.#localStream.getTracks().forEach((track) => {
      if (track.kind === "audio") {
        this.#peerConnection.addTrack(track, this.#localStream);
      }
    });
  }
}
