// @ts-check

import { createClientId } from "../../shared/id/createClientId.js";
import { createBoardOperation } from "../operations/createBoardOperation.js";
import { splitOperation } from "../operations/splitOperation.js";

/**
 * @typedef {{ operation: import("../operations/operationTypes.js").BoardOperation, reason: string }} RefusedOperation
 */

export class OperationDispatcher {
  #boardId;
  #userId;
  #realtimeManager;
  #operationApplier;
  #setShapes;
  #onRefused;
  #logger;

  /**
   * @param {Object} config
   * @param {string} config.boardId
   * @param {string} config.userId
   * @param {import("../manager/RealtimeManager.js").RealtimeManager} config.realtimeManager
   * @param {import("../operations/operationApplier.js").OperationApplier} config.operationApplier
   * @param {(updater: Function) => void} config.setShapes
   * @param {(refused: RefusedOperation[], sent: { partly: boolean }) => void} [config.onRefused]
   *   told about a local edit, or part of one, that could not be sent at all:
   *   it stays on this board and collaborators never see it. `partly` says
   *   whether the rest of the edit went out
   * @param {Pick<Console, "warn" | "error">} [config.logger]
   */
  constructor({
    boardId,
    userId,
    realtimeManager,
    operationApplier,
    setShapes,
    onRefused = () => {},
    logger = console,
  }) {
    this.#boardId = boardId;
    this.#userId = userId;
    this.#realtimeManager = realtimeManager;
    this.#operationApplier = operationApplier;
    this.#setShapes = setShapes;
    this.#onRefused = onRefused;
    this.#logger = logger;
  }

  /**
   * Publish a local edit, in as many operations as it takes to fit the
   * contract's limits (F-27). Whatever cannot be sent is reported to
   * `onRefused` instead of being queued to fail on every reconnect.
   *
   * @param {import("../operations/operationTypes.js").OperationType} type
   * @param {Record<string, unknown>} payload
   * @returns {import("../operations/operationTypes.js").BoardOperation[]} what was published
   */
  dispatchLocalOperation(type, payload) {
    const operation = createBoardOperation({
      boardId: this.#boardId,
      type,
      payload,
      userId: this.#userId,
    });

    const { operations, refused } = splitOperation(operation, { createId: () => createClientId("op") });

    for (const piece of operations) {
      this.#operationApplier.markProcessed(piece.operationId);
      this.#realtimeManager.publishOperation(piece);
    }

    if (refused.length > 0) {
      this.#logger.warn?.("Local operation too large or invalid to share; kept on this board only.", {
        type,
        reasons: refused.map((entry) => entry.reason),
      });
      this.#onRefused(refused, { partly: operations.length > 0 });
    }

    return operations;
  }

  /**
   * @param {unknown} operation
   */
  applyRemoteOperation(operation) {
    this.#setShapes((currentShapes) => {
      const result = this.#operationApplier.apply(currentShapes, operation);

      if (result.status === "invalid" || result.status === "conflict") {
        this.#logger.warn?.("Remote operation was not applied.", {
          status: result.status,
          reason: result.reason,
          operation,
        });
      }

      return result.shapes;
    });
  }
}
