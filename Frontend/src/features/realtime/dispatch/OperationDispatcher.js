// @ts-check

import { createBoardOperation } from "../operations/createBoardOperation.js";

export class OperationDispatcher {
  #boardId;
  #userId;
  #realtimeManager;
  #operationApplier;
  #setShapes;
  #logger;

  /**
   * @param {Object} config
   * @param {string} config.boardId
   * @param {string} config.userId
   * @param {import("../manager/RealtimeManager.js").RealtimeManager} config.realtimeManager
   * @param {import("../operations/operationApplier.js").OperationApplier} config.operationApplier
   * @param {(updater: Function) => void} config.setShapes
   * @param {Pick<Console, "warn" | "error">} [config.logger]
   */
  constructor({
    boardId,
    userId,
    realtimeManager,
    operationApplier,
    setShapes,
    logger = console,
  }) {
    this.#boardId = boardId;
    this.#userId = userId;
    this.#realtimeManager = realtimeManager;
    this.#operationApplier = operationApplier;
    this.#setShapes = setShapes;
    this.#logger = logger;
  }

  /**
   * @param {import("../operations/operationTypes.js").OperationType} type
   * @param {Record<string, unknown>} payload
   */
  dispatchLocalOperation(type, payload) {
    const operation = createBoardOperation({
      boardId: this.#boardId,
      type,
      payload,
      userId: this.#userId,
    });

    this.#operationApplier.markProcessed(operation.operationId);
    this.#realtimeManager.publishOperation(operation);

    return operation;
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
