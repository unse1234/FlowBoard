import assert from "node:assert/strict";
import test from "node:test";
import {
  assignGroupId,
  clearGroupId,
  expandSelectionWithGroups,
  hasGroupedShape,
} from "./shapeGrouping.js";

const board = () => [
  { id: "a" },
  { id: "b" },
  { id: "c" },
];

test("stamps a groupId onto the named shapes only", () => {
  const next = assignGroupId(board(), ["a", "b"], "g1");

  assert.deepEqual(next.map((s) => s.groupId), ["g1", "g1", undefined]);
});

test("assigning is identity-stable when nothing would change", () => {
  const shapes = board();

  assert.equal(assignGroupId(shapes, [], "g1"), shapes);
  assert.equal(assignGroupId(shapes, ["a"], ""), shapes);
  assert.equal(assignGroupId(assignGroupId(shapes, ["a"], "g1"), ["a"], "g1").length, 3);

  const grouped = assignGroupId(shapes, ["a"], "g1");
  assert.equal(assignGroupId(grouped, ["a"], "g1"), grouped, "re-grouping is a no-op");
});

test("clears grouping by group id", () => {
  const grouped = assignGroupId(board(), ["a", "b"], "g1");
  const next = clearGroupId(grouped, { groupId: "g1" });

  assert.equal("groupId" in next[0], false, "the field is removed, not set to undefined");
  assert.equal("groupId" in next[1], false);
});

test("clears grouping by explicit shape list", () => {
  const grouped = assignGroupId(board(), ["a", "b"], "g1");
  const next = clearGroupId(grouped, { ids: ["a"] });

  assert.equal("groupId" in next[0], false);
  assert.equal(next[1].groupId, "g1", "the rest of the group is untouched");
});

test("clearing is identity-stable when there is nothing to clear", () => {
  const shapes = board();

  assert.equal(clearGroupId(shapes, { groupId: "g1" }), shapes);
  assert.equal(clearGroupId(shapes, {}), shapes);
});

test("expands a selection to every member of a touched group", () => {
  const grouped = assignGroupId(board(), ["a", "b"], "g1");

  assert.deepEqual([...expandSelectionWithGroups(grouped, ["a"])], ["a", "b"]);
  assert.deepEqual([...expandSelectionWithGroups(grouped, ["c"])], ["c"]);
});

test("expands across several groups at once", () => {
  let shapes = assignGroupId(board(), ["a", "b"], "g1");
  shapes = [...shapes, { id: "d", groupId: "g2" }, { id: "e", groupId: "g2" }];

  assert.deepEqual([...expandSelectionWithGroups(shapes, ["a", "d"])].sort(), [
    "a",
    "b",
    "d",
    "e",
  ]);
});

test("leaves an ungrouped selection alone", () => {
  assert.deepEqual([...expandSelectionWithGroups(board(), ["a", "c"])], ["a", "c"]);
  assert.deepEqual([...expandSelectionWithGroups(board(), [])], []);
});

test("reports whether a selection contains anything grouped", () => {
  const grouped = assignGroupId(board(), ["a"], "g1");

  assert.equal(hasGroupedShape([grouped[0]]), true);
  assert.equal(hasGroupedShape([grouped[2]]), false);
  assert.equal(hasGroupedShape([]), false);
});
