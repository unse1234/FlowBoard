// @ts-check

import { createClientId } from "../../shared/id/createClientId.js";

const DEFAULT_BOARD_ID = "default-board";
const DEFAULT_REALTIME_URL = "http://localhost:3001";
const LOCAL_BOARD_ID_KEY = "flowboard:local-board-id";
const COLLABORATION_ROOM_PARAM = "roomId";

/**
 * @param {Location} [location]
 * @returns {string}
 */
export function resolveBoardId(location = globalThis.location) {
  const params = new URLSearchParams(location?.search ?? "");
  const queryBoardId = params.get("boardId");

  if (queryBoardId) return sanitizeBoardId(queryBoardId);

  const pathBoardId = location?.pathname?.match(/\/boards?\/([^/]+)/)?.[1];
  if (pathBoardId) return sanitizeBoardId(pathBoardId);

  return DEFAULT_BOARD_ID;
}

/**
 * @param {Location} [location]
 * @param {Storage | null | undefined} [storage]
 * @returns {string}
 */
export function resolveLocalBoardId(
  location = globalThis.location,
  storage = globalThis.localStorage,
) {
  const params = new URLSearchParams(location?.search ?? "");
  const queryBoardId = params.get("boardId");

  if (queryBoardId) return sanitizeBoardId(queryBoardId);

  try {
    const storedBoardId = storage?.getItem(LOCAL_BOARD_ID_KEY);
    if (storedBoardId) return sanitizeBoardId(storedBoardId);

    const nextBoardId = createClientId("board");
    storage?.setItem(LOCAL_BOARD_ID_KEY, nextBoardId);
    return nextBoardId;
  } catch {
    return DEFAULT_BOARD_ID;
  }
}

/**
 * @param {Location} [location]
 * @returns {string | null}
 */
export function resolveCollaborationRoomId(location = globalThis.location) {
  const params = new URLSearchParams(location?.search ?? "");
  const roomId = params.get(COLLABORATION_ROOM_PARAM);

  return roomId ? sanitizeBoardId(roomId) : null;
}

const LOCAL_COLLABORATION_USERNAME_KEY_PREFIX = "flowboard:collab-user:";

function getCollaborationUsernameKey(roomId) {
  return `${LOCAL_COLLABORATION_USERNAME_KEY_PREFIX}${sanitizeBoardId(roomId)}`;
}

/**
 * @param {string} roomId
 * @param {Storage | null | undefined} [storage]
 * @returns {string | null}
 */
export function resolveCollaborationUsername(
  roomId,
  storage = globalThis.sessionStorage,
) {
  if (!roomId) return null;

  try {
    const stored = storage?.getItem(getCollaborationUsernameKey(roomId));
    return stored?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * @param {string} roomId
 * @param {string} username
 * @param {Storage | null | undefined} [storage]
 */
export function saveCollaborationUsername(
  roomId,
  username,
  storage = globalThis.sessionStorage,
) {
  if (!roomId || !username) return;

  try {
    storage?.setItem(getCollaborationUsernameKey(roomId), username.trim());
  } catch {
    // Ignore storage failures.
  }
}

const LAST_DISPLAY_NAME_KEY = "flowboard:display-name";

/**
 * The name used most recently in any room, offered as the default next time.
 *
 * @param {Storage | null | undefined} [storage]
 * @returns {string | null}
 */
export function resolveLastDisplayName(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(LAST_DISPLAY_NAME_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * @param {string} username
 * @param {Storage | null | undefined} [storage]
 */
export function rememberDisplayName(username, storage = globalThis.localStorage) {
  if (!username?.trim()) return;

  try {
    storage?.setItem(LAST_DISPLAY_NAME_KEY, username.trim());
  } catch {
    // A remembered name is a convenience; storage failures are not worth surfacing.
  }
}

export function createCollaborationRoomId() {
  return createClientId("room");
}

/**
 * @param {string} roomId
 * @param {Location} [location]
 * @returns {string}
 */
export function buildCollaborationLink(roomId, location = globalThis.location) {
  const url = new URL(location?.href ?? "http://localhost:5173/");
  url.searchParams.delete("boardId");
  url.searchParams.set(COLLABORATION_ROOM_PARAM, sanitizeBoardId(roomId));

  return url.toString();
}

export function getRealtimeUrl() {
  return (
    import.meta.env?.VITE_API_URL ??
    import.meta.env?.VITE_REALTIME_URL ??
    DEFAULT_REALTIME_URL
  );
}

/**
 * @param {string} boardId
 * @returns {string}
 */
function sanitizeBoardId(boardId) {
  return boardId.trim().replace(/[^a-zA-Z0-9_-]/g, "-") || DEFAULT_BOARD_ID;
}
