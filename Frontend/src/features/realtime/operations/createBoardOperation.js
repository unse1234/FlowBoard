// @ts-check

import { createClientId } from "../../shared/id/createClientId.js";
import { SUPPORTED_OPERATION_TYPES } from "./operationTypes.js";

/**
 * @import { BoardOperation, OperationType } from "./operationTypes"
 */

/**
 * @param {Object} input
 * @param {string} input.boardId
 * @param {OperationType} input.type
 * @param {Record<string, unknown>} input.payload
 * @param {string} input.userId
 * @param {number} [input.timestamp]
 * @param {string} [input.operationId]
 * @returns {BoardOperation}
 */
export function createBoardOperation({
  boardId,
  type,
  payload,
  userId,
  timestamp = Date.now(),
  operationId = createClientId("op"),
}) {
  if (!boardId) throw new Error("Board operation requires boardId.");
  if (!userId) throw new Error("Board operation requires userId.");
  if (!SUPPORTED_OPERATION_TYPES.has(type)) {
    throw new Error(`Unsupported board operation type: ${type}`);
  }

  return Object.freeze({
    boardId,
    type,
    payload: payload ?? {},
    timestamp,
    userId,
    operationId,
  });
}
