import assert from "node:assert/strict";
import test from "node:test";
import { formatShortcut, toAriaKeyShortcuts } from "./formatShortcut.js";

test("formats a bare key as one uppercase keycap", () => {
  assert.deepEqual(formatShortcut("r", { apple: false }), ["R"]);
});

test("uses Ctrl off Apple platforms and symbols on them", () => {
  assert.deepEqual(formatShortcut("mod+shift+z", { apple: false }), ["Ctrl", "Shift", "Z"]);
  assert.deepEqual(formatShortcut("mod+shift+z", { apple: true }), ["⌘", "⇧", "Z"]);
});

test("keeps punctuation keys, including a trailing plus", () => {
  assert.deepEqual(formatShortcut("mod+]", { apple: false }), ["Ctrl", "]"]);
  assert.deepEqual(formatShortcut("mod++", { apple: false }), ["Ctrl", "+"]);
});

test("names special keys", () => {
  assert.deepEqual(formatShortcut("Escape", { apple: false }), ["Esc"]);
  assert.deepEqual(formatShortcut("shift+ArrowUp", { apple: false }), ["Shift", "↑"]);
});

test("produces aria-keyshortcuts values", () => {
  assert.equal(toAriaKeyShortcuts("mod+shift+z", { apple: false }), "Control+Shift+Z");
  assert.equal(toAriaKeyShortcuts("mod+z", { apple: true }), "Meta+Z");
  assert.equal(toAriaKeyShortcuts("v", { apple: false }), "V");
});
