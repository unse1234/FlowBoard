// @ts-check

export class LocalStorageAdapter {
  #storage;

  /**
   * @param {Storage | null | undefined} storage
   */
  constructor(storage = globalThis.localStorage) {
    this.#storage = storage ?? null;
  }

  /**
   * @param {string} key
   * @returns {string | null}
   */
  getItem(key) {
    try {
      return this.#storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * @param {string} key
   * @param {string} value
   */
  setItem(key, value) {
    try {
      this.#storage?.setItem(key, value);
    } catch {
      // Storage can fail in private browsing or under quota pressure.
    }
  }

  /**
   * @param {string} key
   */
  removeItem(key) {
    try {
      this.#storage?.removeItem(key);
    } catch {
      // Best-effort cleanup only.
    }
  }
}
