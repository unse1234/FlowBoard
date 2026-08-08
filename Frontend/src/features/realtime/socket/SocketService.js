// @ts-check

import { io } from "socket.io-client";

const DEFAULT_TIMEOUT_MS = 5000;

export class SocketService {
  #socket;

  /**
   * @param {Object} config
   * @param {string} config.url
   * @param {Record<string, unknown>} [config.auth]
   */
  constructor({ url, auth = {} }) {
    this.#socket = io(url, {
      auth,
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: DEFAULT_TIMEOUT_MS,
      transports: ["websocket", "polling"],
    });
  }

  connect() {
    if (!this.#socket.connected) this.#socket.connect();
  }

  disconnect() {
    this.#socket.disconnect();
  }

  isConnected() {
    return this.#socket.connected;
  }

  /**
   * @param {string} eventName
   * @param {(payload: unknown) => void} handler
   * @returns {() => void}
   */
  on(eventName, handler) {
    this.#socket.on(eventName, handler);

    return () => this.#socket.off(eventName, handler);
  }

  /**
   * @param {string} eventName
   * @param {unknown} payload
   * @param {number} [timeoutMs]
   * @returns {Promise<unknown>}
   */
  emitWithAck(eventName, payload, timeoutMs = DEFAULT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      this.#socket.timeout(timeoutMs).emit(eventName, payload, (error, response) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(response);
      });
    });
  }
}
