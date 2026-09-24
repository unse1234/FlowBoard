import assert from "node:assert/strict";
import test from "node:test";
import { buildBoardMenuItems } from "../layout/boardMenuItems.js";
import { AUTH_STATUS } from "../../features/auth/authSession.js";
import { buildAccountMenuItems } from "./accountMenuItems.js";

const noop = () => {};
const HANDLERS = { onSignIn: noop, onOpenAccount: noop, onSignOut: noop };
const ADA = { id: "u1", displayName: "Ada Lovelace", email: "ada@example.com", emailVerified: false };

const ids = (items) => items.map((item) => item.id ?? item.type);

test("signed out offers Sign in and nothing else", () => {
  const items = buildAccountMenuItems({ status: AUTH_STATUS.SIGNED_OUT, user: null, ...HANDLERS });

  assert.deepEqual(ids(items), ["sign-in"]);
  assert.equal(items[0].label, "Sign in");
});

test("signed in shows the person's name, which opens the account, and Sign out", () => {
  const opened = [];
  const items = buildAccountMenuItems({
    status: AUTH_STATUS.SIGNED_IN,
    user: ADA,
    ...HANDLERS,
    onOpenAccount: () => opened.push("account"),
  });

  assert.deepEqual(ids(items), ["account", "sign-out"]);
  assert.equal(items[0].label, "Ada Lovelace");
  items[0].onSelect();
  assert.deepEqual(opened, ["account"]);
});

test("while a session is being restored the section is empty, not a flicker of Sign in", () => {
  assert.deepEqual(buildAccountMenuItems({ status: AUTH_STATUS.RESTORING, user: null, ...HANDLERS }), []);
});

test("where accounts are switched off the section is empty, never a sign-in that cannot work", () => {
  assert.deepEqual(buildAccountMenuItems({ status: AUTH_STATUS.UNAVAILABLE, user: null, ...HANDLERS }), []);
});

test("the account section leads the board menu, on every layout, separated from the rest", () => {
  const accountItems = buildAccountMenuItems({ status: AUTH_STATUS.SIGNED_OUT, user: null, ...HANDLERS });
  const menu = buildBoardMenuItems({
    hasShapes: false,
    gridEnabled: false,
    isDark: false,
    minimapVisible: false,
    showMinimapToggle: false,
    onExport: noop,
    onToggleGrid: noop,
    onToggleTheme: noop,
    onToggleMinimap: noop,
    onClearBoard: noop,
    accountItems,
  });

  assert.equal(menu[0].id, "sign-in");
  assert.equal(menu[1].type, "separator");
});

test("with no account section the board menu is exactly as before", () => {
  const base = {
    hasShapes: true,
    gridEnabled: true,
    isDark: false,
    minimapVisible: false,
    showMinimapToggle: false,
    onExport: noop,
    onToggleGrid: noop,
    onToggleTheme: noop,
    onToggleMinimap: noop,
    onClearBoard: noop,
  };

  assert.deepEqual(ids(buildBoardMenuItems(base)), ids(buildBoardMenuItems({ ...base, accountItems: [] })));
  assert.equal(buildBoardMenuItems(base)[0].id, "export");
});
