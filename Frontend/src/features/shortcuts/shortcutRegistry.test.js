import assert from "node:assert/strict";
import test from "node:test";
import {
  findShortcut,
  isEditableTarget,
  matchesShortcut,
} from "./shortcutRegistry.js";

const noop = () => {};
const press = (key, mods = {}) => ({ key, ...mods });

test("matches a bare key only when no modifiers are held", () => {
  const binding = { key: "v", handler: noop };

  assert.equal(matchesShortcut(binding, press("v")), true);
  assert.equal(matchesShortcut(binding, press("V")), true, "case-insensitive");
  assert.equal(matchesShortcut(binding, press("v", { ctrlKey: true })), false);
  assert.equal(matchesShortcut(binding, press("v", { shiftKey: true })), false);
  assert.equal(matchesShortcut(binding, press("v", { altKey: true })), false);
});

test("treats Ctrl and Cmd as the same intent", () => {
  const binding = { key: "z", ctrl: true, handler: noop };

  assert.equal(matchesShortcut(binding, press("z", { ctrlKey: true })), true);
  assert.equal(matchesShortcut(binding, press("z", { metaKey: true })), true);
  assert.equal(matchesShortcut(binding, press("z")), false);
});

test("keeps Ctrl+Z and Ctrl+Shift+Z distinct", () => {
  const undo = { key: "z", ctrl: true, handler: noop };
  const redo = { key: "z", ctrl: true, shift: true, handler: noop };

  assert.equal(matchesShortcut(undo, press("z", { ctrlKey: true, shiftKey: true })), false);
  assert.equal(matchesShortcut(redo, press("z", { ctrlKey: true, shiftKey: true })), true);
  assert.equal(matchesShortcut(redo, press("z", { ctrlKey: true })), false);
});

test("returns the first matching binding in registration order", () => {
  const first = { key: "d", ctrl: true, handler: noop, description: "first" };
  const second = { key: "d", ctrl: true, handler: noop, description: "second" };

  const found = findShortcut([first, second], press("d", { ctrlKey: true }));

  assert.equal(found.description, "first");
});

test("suppresses shortcuts while typing unless explicitly allowed", () => {
  const toolKey = { key: "r", handler: noop };
  const escape = { key: "Escape", allowInEditable: true, handler: noop };
  const bindings = [toolKey, escape];

  assert.equal(findShortcut(bindings, press("r"), { editable: true }), null);
  assert.equal(findShortcut(bindings, press("r"), { editable: false }), toolKey);
  assert.equal(findShortcut(bindings, press("Escape"), { editable: true }), escape);
});

test("returns null when nothing matches", () => {
  assert.equal(findShortcut([{ key: "a", handler: noop }], press("b")), null);
  assert.equal(findShortcut([], press("a")), null);
});

test("detects editable targets including contentEditable", () => {
  assert.equal(isEditableTarget({ tagName: "INPUT" }), true);
  assert.equal(isEditableTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(isEditableTarget({ tagName: "SELECT" }), true);
  assert.equal(isEditableTarget({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isEditableTarget({ tagName: "DIV" }), false);
  assert.equal(isEditableTarget(null), false);
});
