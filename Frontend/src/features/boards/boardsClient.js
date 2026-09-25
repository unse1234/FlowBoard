import { getRealtimeUrl } from "../realtime/config/realtimeConfig.js";

/**
 * FlowBoard's board and invitation API (Backend/src/boards/boardRouter.js),
 * as the browser calls it.
 *
 * Bearer tokens only: no cookie is ever sent, so these go straight to the API
 * server, like the AI endpoint and the realtime socket, rather than through
 * the same-origin route auth needs. Every call takes an access token from the
 * session controller (`getAccessToken`), fresh or refreshed.
 *
 * The same contract as `features/auth/authClient.js`: one typed error with a
 * code and a message safe to show, network failures named, and a response
 * that does not look right treated as a failure.
 */

const REQUEST_TIMEOUT_MS = 15_000;

export const BOARD_CLIENT_MESSAGES = Object.freeze({
  NETWORK: "Can't reach FlowBoard. Check your connection and try again.",
  TIMEOUT: "FlowBoard took too long to respond. Try again.",
  BAD_RESPONSE: "The server sent an unexpected response. Try again.",
});

export class BoardRequestError extends Error {
  /**
   * @param {string} code  the server's code, or NETWORK, TIMEOUT, BAD_RESPONSE
   * @param {string} message  safe to show a person
   * @param {number | null} [status]
   */
  constructor(code, message, status = null) {
    super(message);
    this.name = "BoardRequestError";
    this.code = code;
    this.status = status;
  }
}

/**
 * @typedef {{ id: string, title: string, role: "owner" | "editor" | "viewer", ownerName: string,
 *   memberCount: number, createdAt: string, updatedAt: string }} BoardSummary
 * @typedef {{ id: string, displayName: string, email?: string, role?: string, joinedAt?: string }} BoardPerson
 * @typedef {BoardSummary & { owner: BoardPerson, members: BoardPerson[] }} BoardDetail
 * @typedef {{ id: string, role: string, expiresAt: string, maxUses: number, useCount: number, createdAt: string }} BoardInvite
 * @typedef {{ accessToken: string, fetchImpl?: typeof fetch, baseUrl?: string, timeoutMs?: number }} BoardRequestOptions
 */

/** @param {BoardRequestOptions} request @returns {Promise<BoardSummary[]>} */
export async function listBoards(request) {
  const body = await send("GET", "/api/boards", request);
  if (!Array.isArray(body.boards)) throw badResponse();
  return body.boards;
}

/** @param {{ title?: string } & BoardRequestOptions} request @returns {Promise<BoardSummary>} */
export async function createBoard({ title, ...request }) {
  const body = await send("POST", "/api/boards", request, title === undefined ? {} : { title });
  return readBoard(body.board);
}

/** @param {{ boardId: string } & BoardRequestOptions} request @returns {Promise<BoardDetail>} */
export async function getBoard({ boardId, ...request }) {
  const body = await send("GET", `/api/boards/${encodeURIComponent(boardId)}`, request);
  const board = readBoard(body.board);
  if (!body.board.owner || !Array.isArray(body.board.members)) throw badResponse();
  return { ...board, owner: body.board.owner, members: body.board.members };
}

/** @param {{ boardId: string, title: string } & BoardRequestOptions} request */
export async function renameBoard({ boardId, title, ...request }) {
  const body = await send("PATCH", `/api/boards/${encodeURIComponent(boardId)}`, request, { title });
  return body.board;
}

/** @param {{ boardId: string } & BoardRequestOptions} request */
export async function deleteBoard({ boardId, ...request }) {
  await send("DELETE", `/api/boards/${encodeURIComponent(boardId)}`, request);
}

/** @param {{ boardId: string, userId: string, role: "editor" | "viewer" } & BoardRequestOptions} request */
export async function setMemberRole({ boardId, userId, role, ...request }) {
  await send("PATCH", `/api/boards/${encodeURIComponent(boardId)}/members/${encodeURIComponent(userId)}`, request, { role });
}

/** Remove someone, or leave (your own id). @param {{ boardId: string, userId: string } & BoardRequestOptions} request */
export async function removeMember({ boardId, userId, ...request }) {
  await send("DELETE", `/api/boards/${encodeURIComponent(boardId)}/members/${encodeURIComponent(userId)}`, request);
}

/** @param {{ boardId: string, userId: string } & BoardRequestOptions} request */
export async function transferBoard({ boardId, userId, ...request }) {
  await send("POST", `/api/boards/${encodeURIComponent(boardId)}/transfer`, request, { userId });
}

/** @param {{ boardId: string } & BoardRequestOptions} request @returns {Promise<BoardInvite[]>} */
export async function listInvites({ boardId, ...request }) {
  const body = await send("GET", `/api/boards/${encodeURIComponent(boardId)}/invites`, request);
  if (!Array.isArray(body.invites)) throw badResponse();
  return body.invites;
}

/**
 * Make an invitation. The token comes back once and is kept nowhere else,
 * so the link is built here, on this page's own origin.
 *
 * @param {{ boardId: string, role?: "editor" | "viewer", expiresInDays?: number, maxUses?: number,
 *   origin?: string } & BoardRequestOptions} request
 * @returns {Promise<{ invite: BoardInvite, link: string }>}
 */
export async function createInvite({ boardId, role, expiresInDays, maxUses, origin = globalThis.location?.origin, ...request }) {
  const options = {};
  if (role !== undefined) options.role = role;
  if (expiresInDays !== undefined) options.expiresInDays = expiresInDays;
  if (maxUses !== undefined) options.maxUses = maxUses;

  const body = await send("POST", `/api/boards/${encodeURIComponent(boardId)}/invites`, request, options);
  if (typeof body.token !== "string" || !body.invite) throw badResponse();
  return { invite: body.invite, link: `${origin ?? ""}/invite/${body.token}` };
}

/** @param {{ boardId: string, inviteId: string } & BoardRequestOptions} request */
export async function revokeInvite({ boardId, inviteId, ...request }) {
  await send("DELETE", `/api/boards/${encodeURIComponent(boardId)}/invites/${encodeURIComponent(inviteId)}`, request);
}

/**
 * What an invitation is for, before accepting it.
 *
 * @param {{ token: string } & BoardRequestOptions} request
 * @returns {Promise<{ boardTitle: string, invitedBy: string, role: string, expiresAt: string,
 *   boardId: string | null, currentRole: string | null }>}
 */
export async function previewInvite({ token, ...request }) {
  const body = await send("POST", "/api/invites/preview", request, { token });
  if (!body.invite || typeof body.invite.boardTitle !== "string") throw badResponse();
  return body.invite;
}

/**
 * @param {{ token: string } & BoardRequestOptions} request
 * @returns {Promise<{ board: { id: string, title: string }, role: string, joined: boolean }>}
 */
export async function acceptInvite({ token, ...request }) {
  const body = await send("POST", "/api/invites/accept", request, { token });
  if (typeof body.board?.id !== "string") throw badResponse();
  return { board: body.board, role: body.role, joined: body.joined === true };
}

async function send(
  method,
  path,
  { accessToken, fetchImpl = globalThis.fetch, baseUrl = getRealtimeUrl(), timeoutMs = REQUEST_TIMEOUT_MS },
  body,
) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  try {
    let response;
    try {
      response = await fetchImpl(`${String(baseUrl).replace(/\/+$/, "")}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        // Never a cookie: bearer tokens only, so nothing here is a CSRF target.
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
      });
    } catch {
      throw timedOut
        ? new BoardRequestError("TIMEOUT", BOARD_CLIENT_MESSAGES.TIMEOUT)
        : new BoardRequestError("NETWORK", BOARD_CLIENT_MESSAGES.NETWORK);
    }

    const payload = await response.json().catch(() => null);
    if (response.ok && payload?.ok === true) return payload;

    throw new BoardRequestError(
      typeof payload?.code === "string" ? payload.code : `HTTP_${response.status}`,
      typeof payload?.error === "string" && payload.error ? payload.error : BOARD_CLIENT_MESSAGES.BAD_RESPONSE,
      response.status,
    );
  } finally {
    clearTimeout(timer);
  }
}

function readBoard(board) {
  if (!board || typeof board.id !== "string" || typeof board.title !== "string" || typeof board.role !== "string") {
    throw badResponse();
  }
  return board;
}

function badResponse() {
  return new BoardRequestError("BAD_RESPONSE", BOARD_CLIENT_MESSAGES.BAD_RESPONSE);
}
