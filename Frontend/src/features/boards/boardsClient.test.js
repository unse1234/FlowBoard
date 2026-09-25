import assert from "node:assert/strict";
import test from "node:test";
import {
  BoardRequestError,
  acceptInvite,
  createBoard,
  createInvite,
  getBoard,
  listBoards,
  previewInvite,
  removeMember,
  revokeInvite,
  setMemberRole,
  transferBoard,
} from "./boardsClient.js";

const BASE = { baseUrl: "https://api.example/", accessToken: "access" };
const BOARD = Object.freeze({
  id: "b-1",
  title: "Roadmap",
  role: "owner",
  ownerName: "Ada",
  memberCount: 0,
  createdAt: "2026-09-25T12:00:00.000Z",
  updatedAt: "2026-09-25T12:00:00.000Z",
});

function recordingFetch(status, body) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { calls, fetchImpl };
}

test("every call carries the bearer token and never a cookie", async () => {
  const { calls, fetchImpl } = recordingFetch(200, { ok: true, boards: [BOARD] });

  const boards = await listBoards({ ...BASE, fetchImpl });

  assert.deepEqual(boards, [BOARD]);
  assert.equal(calls[0].url, "https://api.example/api/boards");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, "Bearer access");
  assert.equal(calls[0].init.credentials, "omit");
});

test("each action goes to its route with its body", async () => {
  const { calls, fetchImpl } = recordingFetch(200, { ok: true, board: BOARD });

  await createBoard({ ...BASE, fetchImpl, title: "Roadmap" });
  await setMemberRole({ ...BASE, fetchImpl, boardId: "b-1", userId: "u-2", role: "viewer" });
  await removeMember({ ...BASE, fetchImpl, boardId: "b-1", userId: "u-2" });
  await transferBoard({ ...BASE, fetchImpl, boardId: "b-1", userId: "u-2" });
  await revokeInvite({ ...BASE, fetchImpl, boardId: "b-1", inviteId: "i-1" });

  assert.deepEqual(
    calls.map((call) => [call.init.method, call.url.replace("https://api.example", ""), call.body]),
    [
      ["POST", "/api/boards", { title: "Roadmap" }],
      ["PATCH", "/api/boards/b-1/members/u-2", { role: "viewer" }],
      ["DELETE", "/api/boards/b-1/members/u-2", undefined],
      ["POST", "/api/boards/b-1/transfer", { userId: "u-2" }],
      ["DELETE", "/api/boards/b-1/invites/i-1", undefined],
    ],
  );
});

test("an invitation link is built on this page's origin from the one-time token", async () => {
  const invite = { id: "i-1", role: "editor", expiresAt: "x", maxUses: 1, useCount: 0, createdAt: "x" };
  const { calls, fetchImpl } = recordingFetch(201, { ok: true, invite, token: "T".repeat(43), url: null });

  const result = await createInvite({ ...BASE, fetchImpl, boardId: "b-1", role: "viewer", origin: "https://app.test" });

  assert.deepEqual(calls[0].body, { role: "viewer" });
  assert.equal(result.link, `https://app.test/invite/${"T".repeat(43)}`);
  assert.deepEqual(result.invite, invite);
});

test("invitation tokens travel in the body, never the URL", async () => {
  const { calls, fetchImpl } = recordingFetch(200, {
    ok: true,
    invite: { boardTitle: "Roadmap", invitedBy: "Ada", role: "editor", expiresAt: "x", boardId: null, currentRole: null },
    board: { id: "b-1", title: "Roadmap" },
    role: "editor",
    joined: true,
  });
  const token = "S".repeat(43);

  await previewInvite({ ...BASE, fetchImpl, token });
  const accepted = await acceptInvite({ ...BASE, fetchImpl, token });

  for (const call of calls) {
    assert.ok(!call.url.includes(token));
    assert.equal(call.body.token, token);
  }
  assert.deepEqual(accepted, { board: { id: "b-1", title: "Roadmap" }, role: "editor", joined: true });
});

test("a refusal surfaces the server's code and message", async () => {
  const { fetchImpl } = recordingFetch(410, { ok: false, code: "INVITE_INVALID", error: "This invitation has expired." });

  await assert.rejects(acceptInvite({ ...BASE, fetchImpl, token: "x" }), (error) => {
    assert.ok(error instanceof BoardRequestError);
    assert.equal(error.code, "INVITE_INVALID");
    assert.equal(error.status, 410);
    assert.equal(error.message, "This invitation has expired.");
    return true;
  });
});

test("an unreachable server is NETWORK, and a malformed answer BAD_RESPONSE", async () => {
  const offline = async () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(listBoards({ ...BASE, fetchImpl: offline }), { code: "NETWORK" });

  const { fetchImpl } = recordingFetch(200, { ok: true, board: { id: "b-1" } });
  await assert.rejects(getBoard({ ...BASE, fetchImpl, boardId: "b-1" }), { code: "BAD_RESPONSE" });
});
