// @ts-check

const DEFAULT_AUDIO_CONSTRAINTS = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
};

export class MediaPermissionDeniedError extends Error {
  constructor(message = "Microphone permission denied.", innerError = null) {
    super(message);
    this.name = "MediaPermissionDeniedError";
    this.innerError = innerError;
  }
}

export class MediaDeviceUnavailableError extends Error {
  constructor(message = "No microphone device available.", innerError = null) {
    super(message);
    this.name = "MediaDeviceUnavailableError";
    this.innerError = innerError;
  }
}

export class MediaManager {
  #stream = null;
  #isMuted = true;
  #constraints;

  constructor({ constraints = DEFAULT_AUDIO_CONSTRAINTS } = {}) {
    this.#constraints = constraints;
  }

  async requestMicrophone() {
    if (!globalThis.navigator?.mediaDevices?.getUserMedia) {
      throw new Error("Browser does not support microphone access.");
    }

    try {
      const stream = await globalThis.navigator.mediaDevices.getUserMedia(
        this.#constraints,
      );
      this.#stream = stream;
      this.#isMuted = false;
      return stream;
    } catch (error) {
      if (
        error?.name === "NotAllowedError" ||
        error?.name === "SecurityError"
      ) {
        throw new MediaPermissionDeniedError(
          "Microphone permission denied.",
          error,
        );
      }

      if (
        error?.name === "NotFoundError" ||
        error?.name === "DevicesNotFoundError" ||
        error?.name === "NotReadableError" ||
        error?.name === "OverconstrainedError"
      ) {
        throw new MediaDeviceUnavailableError(
          "No microphone device is available.",
          error,
        );
      }

      throw error;
    }
  }

  getStream() {
    return this.#stream;
  }

  getAudioTracks() {
    return this.#stream?.getAudioTracks() ?? [];
  }

  isMuted() {
    return this.#isMuted;
  }

  hasStream() {
    return Boolean(this.#stream);
  }

  mute() {
    return this.#setTrackEnabled(false);
  }

  unmute() {
    return this.#setTrackEnabled(true);
  }

  stop() {
    if (!this.#stream) {
      return;
    }

    this.#stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // Stop may fail on some browsers if already ended.
      }
    });

    this.#stream = null;
    this.#isMuted = true;
  }

  destroy() {
    this.stop();
  }

  #setTrackEnabled(enabled) {
    if (!this.#stream) {
      return false;
    }

    const tracks = this.getAudioTracks();
    if (!tracks.length) {
      return false;
    }

    tracks.forEach((track) => {
      track.enabled = enabled;
    });

    this.#isMuted = !enabled;
    return true;
  }
}
