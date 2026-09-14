import assert from "node:assert/strict";
import test from "node:test";
import { COLLABORATOR_COLORS, pickCollaboratorColor } from "./presence.js";

test("picks the same colour for the same seed", () => {
  assert.equal(pickCollaboratorColor("user_abc"), pickCollaboratorColor("user_abc"));
});

test("always returns a palette colour, including for empty seeds", () => {
  for (const seed of ["", null, undefined, "user_1", "a much longer user id 123"]) {
    assert.ok(COLLABORATOR_COLORS.includes(pickCollaboratorColor(seed)));
  }
});

test("spreads distinct seeds across more than one colour", () => {
  const colours = new Set(
    Array.from({ length: 40 }, (_, index) => pickCollaboratorColor(`user_${index}`)),
  );
  assert.ok(colours.size > 1);
});
