// @ts-check

import { OPERATION_LIMITS, OPERATION_TYPES } from "./operationTypes.js";
import { validateOperation } from "./operationValidator.js";

/**
 * @import { BoardOperation } from "./operationTypes"
 */

/**
 * The batches whose entries stand alone, so the batch can be sent in pieces
 * with the same result. Pieces are sent in order, which is all
 * REORDER_SHAPES needs: its placements apply one after another anyway.
 *
 * The relative ordering operations (BRING_FORWARD and the rest) are not here:
 * moving two halves of a selection one after the other is not the same as
 * moving it all at once.
 */
const SPLITTABLE_FIELDS = Object.freeze({
  [OPERATION_TYPES.CREATE_SHAPES]: "shapes",
  [OPERATION_TYPES.UPDATE_SHAPES]: "patches",
  [OPERATION_TYPES.DELETE_SHAPES]: "shapeIds",
  [OPERATION_TYPES.GROUP]: "shapeIds",
  [OPERATION_TYPES.UNGROUP]: "shapeIds",
  [OPERATION_TYPES.REORDER_SHAPES]: "placements",
});

/** Room for a piece's own operation id, which may be longer than the original's. */
const ID_ALLOWANCE_BYTES = OPERATION_LIMITS.maxIdLength * 4;

const UTF8 = new TextEncoder();
const bytesOf = (/** @type {unknown} */ value) => UTF8.encode(JSON.stringify(value)).length;

/**
 * Turn one local edit into operations that each fit OPERATION_LIMITS
 * (finding F-27): the server refuses anything larger, and a message past the
 * socket's cap would drop the connection.
 *
 * An edit that already fits comes back as it is. A splittable batch that does
 * not is packed, in order, into as few pieces as fit, each with its own id.
 * What cannot be sent is returned in `refused`, with the validator's reason,
 * rather than being sent to fail: a lone entry too large for any operation
 * (one shape with a big image), a batch that cannot be split, or an edit that
 * is invalid for some other reason.
 *
 * @param {BoardOperation} operation
 * @param {{ createId: () => string }} options
 * @returns {{ operations: BoardOperation[], refused: { operation: BoardOperation, reason: string }[] }}
 */
export function splitOperation(operation, { createId }) {
  const verdict = validateOperation(operation);
  if (verdict.valid) return { operations: [operation], refused: [] };

  const field = SPLITTABLE_FIELDS[operation.type];
  const entries = field ? operation.payload?.[field] : null;
  if (!field || !Array.isArray(entries) || entries.length === 0) {
    return { operations: [], refused: [{ operation, reason: verdict.reason }] };
  }

  const pieceOf = (/** @type {unknown[]} */ list) =>
    /** @type {BoardOperation} */ ({
      ...operation,
      operationId: createId(),
      payload: { ...operation.payload, [field]: list },
    });

  // Every piece costs the operation around an empty list, plus each entry and
  // its comma. Measured once per entry rather than once per attempt.
  const budget = OPERATION_LIMITS.maxOperationBytes - ID_ALLOWANCE_BYTES - bytesOf(pieceOf([]));
  /** @type {unknown[][]} */
  const lists = [];
  /** @type {unknown[]} */
  const alone = [];
  let current = [];
  let used = 0;

  for (const entry of entries) {
    const cost = bytesOf(entry) + 1;
    if (cost > budget) {
      alone.push(entry);
      continue;
    }

    if (current.length === OPERATION_LIMITS.maxBatchEntries || used + cost > budget) {
      lists.push(current);
      current = [];
      used = 0;
    }
    current.push(entry);
    used += cost;
  }
  if (current.length > 0) lists.push(current);

  const operations = [];
  const refused = [];
  for (const piece of [...lists.map(pieceOf), ...alone.map((entry) => pieceOf([entry]))]) {
    const check = validateOperation(piece);
    if (check.valid) operations.push(piece);
    else refused.push({ operation: piece, reason: check.reason });
  }

  return { operations, refused };
}
