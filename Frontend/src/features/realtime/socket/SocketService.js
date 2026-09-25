// @ts-check

import { io } from "socket.io-client";

const DEFAULT_TIMEOUT_MS = 5000;

export class SocketService {
  #socket;

  /**
   * @param {Object} config
   * @param {string} config.url
   * @param {Record<string, unknown> | ((callback: (auth: Record<string, unknown>) => void) => void)} [config.auth]
   *   an object, or a function asked on every connection attempt, so a
   *   reconnect presents a fresh access token rather than the first one
   * @param {Record<string, unknown>} [config.clientOptions]
   *   extra socket.io-client options, for clients that are not a browser
   *   (a Node script must send the Origin a browser sends by itself)
   */
  constructor({ url, auth = {}, clientOptions = {} }) {
    this.#socket = io(url, {
      auth,
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: DEFAULT_TIMEOUT_MS,
      transports: ["websocket", "polling"],
      ...clientOptions,
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
   * Whether the current connection resumed the previous one (Socket.IO
   * connection-state recovery): same rooms, and the events missed while away
   * already delivered. Otherwise the board must be joined, and synced, again.
   */
  wasRecovered() {
    return this.#socket.recovered === true;
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
