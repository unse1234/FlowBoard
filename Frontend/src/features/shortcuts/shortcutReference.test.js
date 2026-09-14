import assert from "node:assert/strict";
import test from "node:test";
import { TOOL_LABELS, TOOL_SHORTCUTS } from "../../constants/toolMeta.js";
import { BOARD_SHORTCUTS } from "./boardShortcuts.js";
import { SHORTCUT_SECTIONS } from "./shortcutReference.js";

const rows = SHORTCUT_SECTIONS.flatMap((section) => section.rows);

test("documents every board binding", () => {
  const documented = new Set(rows.flatMap((row) => row.actions ?? []));

  for (const binding of BOARD_SHORTCUTS) {
    assert.ok(documented.has(binding.action), `"${binding.action}" is missing from the reference`);
  }
});

test("lists every tool with its real key", () => {
  const tools = SHORTCUT_SECTIONS.find((section) => section.title === "Tools");

  for (const [tool, key] of Object.entries(TOOL_SHORTCUTS)) {
    const row = tools.rows.find((entry) => entry.label === TOOL_LABELS[tool]);
    assert.ok(row, `${tool} is missing from the reference`);
    assert.deepEqual(row.combos, [key]);
  }
});

test("gives every row at least one key", () => {
  for (const row of rows) {
    assert.ok(row.combos.length > 0, `"${row.label}" has no keys`);
  }
});

test("resolves both delete keys", () => {
  const row = rows.find((entry) => entry.label === "Delete selection");
  assert.deepEqual(row.combos, ["Delete", "Backspace"]);
});
