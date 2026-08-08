// @ts-check

const STORAGE_VERSION = 1;
const KEY_PREFIX = "flowboard:board";

export class PersistenceManager {
  #storage;
  #logger;

  /**
   * @param {Object} config
   * @param {{ getItem(key: string): string | null, setItem(key: string, value: string): void, removeItem(key: string): void }} config.storage
   * @param {Pick<Console, "warn">} [config.logger]
   */
  constructor({ storage, logger = console }) {
    this.#storage = storage;
    this.#logger = logger;
  }

  /**
   * @param {string} boardId
   * @returns {{ shapes: unknown[], updatedAt: number } | null}
   */
  loadBoard(boardId) {
    const key = getBoardKey(boardId);
    const raw = this.#storage.getItem(key);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      const migrated = migrateBoardRecord(parsed);

      if (!validateBoardRecord(migrated)) {
        this.#storage.removeItem(key);
        return null;
      }

      return {
        shapes: migrated.shapes,
        updatedAt: migrated.updatedAt,
      };
    } catch (error) {
      this.#logger.warn?.("Recovered from corrupt local board data.", error);
      this.#storage.removeItem(key);
      return null;
    }
  }

  /**
   * @param {Object} input
   * @param {string} input.boardId
   * @param {unknown[]} input.shapes
     * @param {number} [input.updatedAt]
   */
  saveBoard({ boardId, shapes, updatedAt = Date.now() }) {
    const record = {
      version: STORAGE_VERSION,
      boardId,
      shapes,
      updatedAt,
    };

    if (!validateBoardRecord(record)) return;

    this.#storage.setItem(getBoardKey(boardId), JSON.stringify(record));
  }

  /**
   * @param {string} boardId
   */
  clearBoard(boardId) {
    this.#storage.removeItem(getBoardKey(boardId));
  }
}

/**
 * @param {string} boardId
 * @returns {string}
 */
function getBoardKey(boardId) {
  return `${KEY_PREFIX}:${boardId}`;
}

/**
 * @param {unknown} record
 * @returns {unknown}
 */
function migrateBoardRecord(record) {
  if (!record || typeof record !== "object") return record;
  if (record.version === STORAGE_VERSION) return record;

  return {
    ...record,
    version: STORAGE_VERSION,
  };
}

/**
 * @param {unknown} record
 * @returns {record is { version: number, boardId: string, shapes: unknown[], updatedAt: number }}
 */
function validateBoardRecord(record) {
  return Boolean(
    record &&
      typeof record === "object" &&
      record.version === STORAGE_VERSION &&
      typeof record.boardId === "string" &&
      Array.isArray(record.shapes) &&
      Number.isFinite(record.updatedAt),
  );
}
