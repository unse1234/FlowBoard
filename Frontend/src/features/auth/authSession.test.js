import assert from "node:assert/strict";
import test from "node:test";
import { AuthRequestError } from "./authClient.js";
import { AUTH_STATUS, SIGN_UP_THEN_SIGN_IN_FAILED, createAuthSession } from "./authSession.js";

const ADA = Object.freeze({ id: "u-ada", email: "ada@example.com", displayName: "Ada", emailVerified: false });
const GRACE = Object.freeze({ id: "u-grace", email: "grace@example.com", displayName: "Grace", emailVerified: true });
const MINUTE = 60_000;

/** Let every pending promise callback run: a macrotask runs only after them all. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** A clock and timers the test moves by hand. */
function createClock(start = Date.UTC(2026, 8, 24, 12)) {
  let current = start;
  let nextId = 1;
  const timers = new Map();

  return {
    now: () => current,
    setTimer(callback, ms) {
      const id = nextId++;
      timers.set(id, { at: current + ms, callback });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    /** Move time without firing anything: a tab the browser put to sleep. */
    skip(ms) {
      current += ms;
    },
    /** Delays of pending timers, from now. */
    pending: () => [...timers.values()].map((timer) => timer.at - current).sort((a, b) => a - b),
    async advance(ms) {
      current += ms;
      for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at <= current && timers.has(id)) {
          timers.delete(id);
          timer.callback();
          await settle();
        }
      }
      await settle();
    },
  };
}

const sessionFor = (clock, user = ADA, lifetimeMs = 15 * MINUTE) => ({
  user,
  accessToken: `token-${user.id}-${clock.now()}`,
  accessTokenExpiresAt: new Date(clock.now() + lifetimeMs),
});

const ended = (code = "SESSION_INVALID") => new AuthRequestError(code, "Your session has ended.", 401);
const offline = () => new AuthRequestError("NETWORK", "Can't reach FlowBoard.");

/**
 * A client whose answers the test scripts. Each method takes answers from its
 * own queue: a value resolves, an Error rejects, a deferred stays pending.
 */
function createClient() {
  const queues = { signIn: [], signUp: [], refreshSession: [], signOut: [] };
  const calls = { signIn: 0, signUp: 0, refreshSession: 0, signOut: 0 };

  const answer = (method) => async (...args) => {
    calls[method] += 1;
    const next = queues[method].shift();
    if (next === undefined) throw new Error(`unexpected ${method}(${JSON.stringify(args)})`);
    if (typeof next === "function") return next(...args);
    if (next?.promise) return next.promise;
    if (next instanceof Error) throw next;
    return next;
  };

  return {
    calls,
    queue: (method, ...answers) => queues[method].push(...answers),
    client: {
      signIn: answer("signIn"),
      signUp: answer("signUp"),
      refreshSession: answer("refreshSession"),
      signOut: answer("signOut"),
    },
  };
}

/** BroadcastChannel stand-ins that deliver to every other endpoint, never to the sender. */
function createBus() {
  const endpoints = new Set();
  const sent = [];
  return {
    sent,
    endpoint() {
      const listeners = new Set();
      const endpoint = {
        postMessage(data) {
          sent.push(data);
          for (const other of endpoints) {
            if (other !== endpoint) queueMicrotask(() => other.listeners.forEach((listener) => listener({ data })));
          }
        },
        addEventListener: (_type, listener) => listeners.add(listener),
        removeEventListener: (_type, listener) => listeners.delete(listener),
        close: () => endpoints.delete(endpoint),
        listeners,
      };
      endpoints.add(endpoint);
      return endpoint;
    },
  };
}

/** Web Locks stand-in: a real mutex, recording how many held it at once. */
function createLocks() {
  let tail = Promise.resolve();
  let active = 0;
  const stats = { maxActive: 0, requests: 0 };
  return {
    stats,
    request(_name, task) {
      stats.requests += 1;
      const run = tail.then(async () => {
        active += 1;
        stats.maxActive = Math.max(stats.maxActive, active);
        try {
          return await task();
        } finally {
          active -= 1;
        }
      });
      tail = run.catch(() => {});
      return run;
    },
  };
}

function createTab({ clock, client, channel = null, locks = null }) {
  const session = createAuthSession({
    client,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    channel,
    locks,
  });
  return session;
}

test("starting restores the session a cookie holds, and plans the next refresh", async () => {
  const clock = createClock();
  const { client, queue } = createClient();
  queue("refreshSession", sessionFor(clock));
  const auth = createTab({ clock, client });

  assert.equal(auth.getSnapshot().status, AUTH_STATUS.RESTORING);
  auth.start();
  await settle();

  assert.deepEqual(auth.getSnapshot(), { status: AUTH_STATUS.SIGNED_IN, user: ADA });
  // Fifteen-minute token, refreshed a minute early.
  assert.deepEqual(clock.pending(), [14 * MINUTE]);
});

test("starting with no session shows signed out and plans nothing", async () => {
  const clock = createClock();
  const { client, queue } = createClient();
  queue("refreshSession", ended());
  const auth = createTab({ clock, client });

  auth.start();
  await settle();

  assert.deepEqual(auth.getSnapshot(), { status: AUTH_STATUS.SIGNED_OUT, user: null });
  assert.deepEqual(clock.pending(), []);
});

test("starting while the server is unreachable retries, and restores once it answers", async () => {
  const clock = createClock();
  const { client, queue } = createClient();
  queue("refreshSession", offline(), sessionFor(clock));
  const auth = createTab({ clock, client });

  auth.start();
  await settle();
  assert.equal(auth.getSnapshot().status, AUTH_STATUS.SIGNED_OUT);
  assert.deepEqual(clock.pending(), [30_000]);

  await clock.advance(30_000);
  assert.equal(auth.getSnapshot().status, AUTH_STATUS.SIGNED_IN);
});

test("a server with accounts switched off gets no sign-in and no retries", async () => {
  const clock = createClock();
  const { client, queue, calls } = createClient();
  queue("refreshSession", new AuthRequestError("AUTH_UNAVAILABLE", "Accounts aren't available on this server.", 404));
  const auth = createTab({ clock, client });

  auth.start();
  await settle();
  await clock.advance(10 * MINUTE);

  assert.deepEqual(auth.getSnapshot(), { status: AUTH_STATUS.UNAVAILABLE, user: null });
  // Not retried every 30 seconds for as long as the tab is open.
  assert.equal(calls.refreshSession, 1);
  assert.deepEqual(clock.pending(), []);
  assert.equal(await auth.getAccessToken(), null);
});

test("a rate-limited refresh is a pause, not a sign-out", async () => {
  const clock = createClock();
  const { client, queue } = createClient();
  queue(
    "refreshSession",
    sessionFor(clock),
    new AuthRequestError("TOO_MANY_ATTEMPTS", "Too many attempts. Wait a moment and try again.", 429),
    () => sessionFor(clock),
  );
  const auth = createTab({ clock, client });
  auth.start();
  await settle();

  await clock.advance(14 * MINUTE);
  assert.equal(auth.getSnapshot().status, AUTH_STATUS.SIGNED_IN);

  await clock.advance(30_000);
  assert.equal(auth.getSnapshot().status, AUTH_STATUS.SIGNED_IN);
  assert.deepEqual(clock.pending(), [14 * MINUTE]);
});

test("start runs once however often it is called", async () => {
  const clock = createClock();
  const { client, queue, calls } = createClient();
  queue("refreshSession", sessionFor(clock));
  const auth = createTab({ clock, client });

  auth.start();
  auth.start();
  await settle();
  auth.start();

  assert.equal(calls.refreshSession, 1);
});

test("signing in publishes the account once, and tells other tabs", async () => {
  const clock = createClock();
  const bus = createBus();
  const { client, queue } = createClient();
  queue("refreshSession", ended());
  queue("signIn", sessionFor(clock));
  const auth = createTab({ clock, client, channel: bus.endpoint() });
  auth.start();
  await settle();

  let notified = 0;
  auth.subscribe(() => (notified += 1));
  const user = await auth.signIn({ email: "ada@example.com", password: "pw" });

  assert.deepEqual(user, ADA);
  assert.deepEqual(auth.getSnapshot(), { status: AUTH_STATUS.SIGNED_IN, user: ADA });
  assert.equal(notified, 1);
  // Which, and nothing else: no token, no account.
  assert.deepEqual(bus.sent, [{ type: "signed_in" }]);
});

test("a failed sign-in changes nothing and passes the server's error on", async () => {
  const clock = createClock();
  const { client, queue } = createClient();
  queue("refreshSession", ended());
  queue("signIn", new AuthRequestError("INVALID_CREDENTIALS", "That email address and password don't match.", 401));
  const auth = createTab({ clock, client });
  auth.start();
  await settle();
  const before = auth.getSnapshot();

  await assert.rejects(auth.signIn({ email: "a", password: "b" }), { code: "INVALID_CREDENTIALS" });
  assert.equal(auth.getSnapshot(), before);
});

test("signing up creates the account and then signs straight in", async () => {
  const clock = createClock();
  const { client, queue, calls } = createClient();
  const signInArgs = [];
  queue("refreshSession", ended());
  queue("signUp", () => undefined);
  queue("signIn", (credentials) => {
    signInArgs.push(credentials);
    return sessionFor(clock);
  });
  const auth = createTab({ clock, client });
  auth.start();
  await settle();

  await auth.signUp({ email: "ada@example.com", password: "a-long-passphrase", displayName: "Ada" });

  assert.equal(calls.signUp, 1);
  assert.deepEqual(signInArgs, [{ email: "ada@example.com", password: "a-long-passphrase" }]);
  assert.equal(auth.getSnapshot().status, AUTH_STATUS.SIGNED_IN);
});

test("a sign-up whose sign-in is refused says so without claiming the account exists", async () => {
  const clock = createClock();
  const { client, queue } = createClient();
  queue("refreshSession", ended());
  queue("signUp", () => undefined);
  queue("signIn", new AuthRequestError("INVALID_CREDENTIALS", "That email address and password don't match.", 401));
  const auth = createTab({ clock, client });
  auth.start();
  await settle();

  await assert.rejects(auth.signUp({ email: "a@b.co", password: "p", displayName: "A" }), (error) => {
    assert.equal(error.code, "SIGN_UP_THEN_SIGN_IN_FAILED");
    assert.equal(error.message, SIGN_UP_THEN_SIGN_IN_FAILED);
    // Conditional, because a sign-up response cannot tell (E-12).
    assert.match(error.message, /\bIf you already have an account\b/);
    return true;
  });
  assert.equal(auth.getSnapshot().status, AUTH_STATUS.SIGNED_OUT);
});

test("a rejected sign-up never attempts the sign-in", async () => {
  const clock = createClock();
  const { client, queue, calls } = createClient();
  queue("refreshSession", ended());
  queue("signUp", new AuthRequestError("PASSWORD_TOO_SHORT", "Use at least 12 characters.", 400));
  const auth = createTab({ clock, client });
  auth.start();
  await settle();

  await assert.rejects(auth.signUp({ email: "a@b.co", password: "p", displayName: "A" }), {
    code: "PASSWORD_TOO_SHORT",
  });
  assert.equal(calls.signIn, 0);
});

test("the planned refresh rotates the token and plans the next one", async () => {
  const clock = createClock();
  const { client, queue, calls } = createClient();
  queue("refreshSession", sessionFor(clock));
  const auth = createTab({ clock, client });
  auth.start();
  await settle();
  const first = await auth.getAccessToken();

  queue("refreshSession", () => sessionFor(clock));
  await clock.advance(14 * MINUTE);

  assert.equal(calls.refreshSession, 2);
  assert.notEqual(await auth.getAccessToken(), first);
  assert.deepEqual(clock.pending(), [14 * MINUTE]);
});

test("a refresh that keeps the same account does not re-render anyone", async () => {
  const clock = createClock();
  const { client, queue } = createClient();
  queue("refreshSession", sessionFor(clock), () => sessionFor(clock));
  const auth = createTab({ clock, client });
  auth.start();
  await settle();

  const before = auth.getSnapshot();
  let notified = 0;
  auth.subscribe(() => (notified += 1));
  await clock.advance(14 * MINUTE);

  assert.equal(auth.getSnapshot(), before);
  assert.equal(notified, 0);
});

test("a planned refresh that finds the session ended signs this tab out", async () => {
  const clock = createClock();
  const { client, queue } = createClient();
  queue("refreshSession", sessionFor(clock), ended());
  const auth = createTab({ clock, client });
  auth.start();
  await settle();

  // Revoked from elsewhere: another device, or reuse detection.
  await clock.advance(14 * MINUTE);

  assert.deepEqual(auth.getSnapshot(), { status: AUTH_STATUS.SIGNED_OUT, user: null });
  assert.equal(await auth.getAccessToken(), null);
  assert.deepEqual(clock.pending(), []);
});

test("a planned refresh that cannot reach the server stays signed in and retries", async () => {
  const clock = createClock();
  const { client, queue } = createClient();
  queue("refreshSession", sessionFor(clock), offline(), () => sessionFor(clock));
  const auth = createTab({ clock, client });
  auth.start();
  await settle();

  await clock.advance(14 * MINUTE);
  assert.equal(auth.getSnapshot().status, AUTH_STATUS.SIGNED_IN);
  assert.deepEqual(clock.pending(), [30_000]);

  await clock.advance(30_000);
  assert.equal(auth.getSnapshot().status, AUTH_STATUS.SIGNED_IN);
  assert.deepEqual(clock.pending(), [14 * MINUTE]);
});

test("an account the server now refuses signs out", async () => {
  const clock = createClock();
  const { client, queue } = createClient();
  queue("refreshSession", ended("ACCOUNT_UNAVAILABLE"));
  const auth = createTab({ clock, client });

  auth.start();
  await settle();

  assert.equal(auth.getSnapshot().status, AUTH_STATUS.SIGNED_OUT);
});

test("signing out waits for the server, then clears and tells other tabs", async () => {
  const clock = createClock();
  const bus = createBus();
  const { client, queue } = createClient();
  queue("refreshSession", sessionFor(clock));
  const logout = deferred();
  queue("signOut", logout);
  const auth = createTab({ clock, client, channel: bus.endpoint() });
  auth.start();
  await settle();

  const pending = auth.signOut();
  await settle();
  // Not yet: only the server can clear the HttpOnly cookie.
  assert.equal(auth.getSnapshot().status, AUTH_STATUS.SIGNED_IN);

  logout.resolve();
  await pending;

  assert.equal(auth.getSnapshot().status, AUTH_STATUS.SIGNED_OUT);
  assert.deepEqual(clock.pending(), []);
  assert.deepEqual(bus.sent, [{ type: "signed_out" }]);
});

test("a sign-out the server never received leaves the person signed in, and says so", async () => {
  const clock = createClock();
  const { client, queue } = createClient();
  queue("refreshSession", sessionFor(clock));
  queue("signOut", offline());
  const auth = createTab({ clock, client });
  auth.start();
  await settle();

  // A silent local-only sign-out would be undone by the next reload.
  await assert.rejects(auth.signOut(), { code: "NETWORK" });
  assert.equal(auth.getSnapshot().status, AUTH_STATUS.SIGNED_IN);
});

test("a refresh that lands after a sign-out cannot bring the session back", async () => {
  const clock = createClock();
  const { client, queue } = createClient();
  queue("refreshSession", sessionFor(clock));
  const slowRefresh = deferred();
  queue("refreshSession", slowRefresh);
  queue("signOut", () => undefined);
  const auth = createTab({ clock, client });
  auth.start();
  await settle();

  await clock.advance(14 * MINUTE);
  await auth.signOut();
  slowRefresh.resolve(sessionFor(clock));
  await settle();

  assert.equal(auth.getSnapshot().status, AUTH_STATUS.SIGNED_OUT);
  assert.equal(await auth.getAccessToken(), null);
  assert.deepEqual(clock.pending(), []);
});

test("getAccessToken hands out a fresh token as is, with no request", async () => {
  const clock = createClock();
  const { client, queue, calls } = createClient();
  queue("refreshSession", sessionFor(clock));
  const auth = createTab({ clock, client });
  auth.start();
  await settle();

  const first = await auth.getAccessToken();
  clock.skip(10 * MINUTE);
  const second = await auth.getAccessToken();

  assert.ok(first);
  assert.equal(second, first);
  assert.equal(calls.refreshSession, 1);
});

test("a tab that slept past its planned refresh refreshes before handing a token out", async () => {
  const clock = createClock();
  const { client, queue, calls } = createClient();
  queue("refreshSession", sessionFor(clock));
  const auth = createTab({ clock, client });
  auth.start();
  await settle();
  const stale = await auth.getAccessToken();

  // Timers do not fire while a tab sleeps, so the planned refresh never ran.
  // 24 seconds are left, inside the 30-second margin.
  clock.skip(15 * MINUTE - 24_000);
  queue("refreshSession", () => sessionFor(clock));
  const fresh = await auth.getAccessToken();

  assert.equal(calls.refreshSession, 2);
  assert.notEqual(fresh, stale);
});

test("concurrent callers share one refresh", async () => {
  const clock = createClock();
  const { client, queue, calls } = createClient();
  const restore = deferred();
  queue("refreshSession", restore);
  const auth = createTab({ clock, client });
  auth.start();

  const tokens = Promise.all([auth.getAccessToken(), auth.getAccessToken(), auth.getAccessToken()]);
  restore.resolve(sessionFor(clock));
  const [a, b, c] = await tokens;

  assert.equal(calls.refreshSession, 1);
  assert.ok(a);
  assert.equal(a, b);
  assert.equal(b, c);
});

test("tabs refresh one at a time through the lock", async () => {
  const clock = createClock();
  const locks = createLocks();
  const { client, queue } = createClient();
  const first = deferred();
  const second = deferred();
  queue("refreshSession", first, second);

  const tabA = createTab({ clock, client, locks });
  const tabB = createTab({ clock, client, locks });
  tabA.start();
  tabB.start();
  await settle();

  first.resolve(sessionFor(clock));
  await settle();
  second.resolve(sessionFor(clock));
  await settle();

  // Each tab refreshed, but never both at once: the second presented the
  // cookie the first had already rotated.
  assert.equal(locks.stats.requests, 2);
  assert.equal(locks.stats.maxActive, 1);
  assert.equal(tabA.getSnapshot().status, AUTH_STATUS.SIGNED_IN);
  assert.equal(tabB.getSnapshot().status, AUTH_STATUS.SIGNED_IN);
});

test("signing out in one tab signs out every tab, without asking the server again", async () => {
  const clock = createClock();
  const bus = createBus();
  const { client, queue, calls } = createClient();
  queue("refreshSession", sessionFor(clock), sessionFor(clock));
  queue("signOut", () => undefined);
  const tabA = createTab({ clock, client, channel: bus.endpoint() });
  const tabB = createTab({ clock, client, channel: bus.endpoint() });
  tabA.start();
  tabB.start();
  await settle();

  await tabA.signOut();
  await settle();

  assert.equal(tabB.getSnapshot().status, AUTH_STATUS.SIGNED_OUT);
  assert.equal(calls.signOut, 1);
  assert.equal(await tabB.getAccessToken(), null);
});

test("signing in in one tab signs in the others, from the shared cookie", async () => {
  const clock = createClock();
  const bus = createBus();
  const { client, queue } = createClient();
  queue("refreshSession", ended(), ended());
  const tabA = createTab({ clock, client, channel: bus.endpoint() });
  const tabB = createTab({ clock, client, channel: bus.endpoint() });
  tabA.start();
  tabB.start();
  await settle();

  queue("signIn", sessionFor(clock));
  queue("refreshSession", () => sessionFor(clock));
  await tabA.signIn({ email: "ada@example.com", password: "pw" });
  await settle();

  assert.deepEqual(tabB.getSnapshot(), { status: AUTH_STATUS.SIGNED_IN, user: ADA });
});

test("a sign-in elsewhere during this tab's refresh is still adopted", async () => {
  const clock = createClock();
  const bus = createBus();
  const { client, queue, calls } = createClient();
  // Tab B's restore is slow and went out with the old cookie: Ada's.
  const staleRestore = deferred();
  queue("refreshSession", ended(), staleRestore);
  const tabA = createTab({ clock, client, channel: bus.endpoint() });
  const tabB = createTab({ clock, client, channel: bus.endpoint() });
  tabA.start();
  await settle();
  tabB.start();
  await settle();

  queue("signIn", sessionFor(clock, GRACE));
  queue("refreshSession", () => sessionFor(clock, GRACE));
  await tabA.signIn({ email: "grace@example.com", password: "pw" });
  await settle();
  staleRestore.resolve(sessionFor(clock, ADA));
  await settle();
  await settle();

  // The stale answer is dropped and a fresh refresh adopts Grace.
  assert.equal(calls.refreshSession, 3);
  assert.deepEqual(tabB.getSnapshot(), { status: AUTH_STATUS.SIGNED_IN, user: GRACE });
});

test("works where Web Locks and BroadcastChannel do not exist", async () => {
  const clock = createClock();
  const { client, queue } = createClient();
  queue("refreshSession", sessionFor(clock));
  queue("signOut", () => undefined);
  const auth = createTab({ clock, client, channel: null, locks: null });

  auth.start();
  await settle();
  assert.equal(auth.getSnapshot().status, AUTH_STATUS.SIGNED_IN);
  await auth.signOut();
  assert.equal(auth.getSnapshot().status, AUTH_STATUS.SIGNED_OUT);
});

test("once disposed it stops refreshing and ignores other tabs", async () => {
  const clock = createClock();
  const bus = createBus();
  const { client, queue, calls } = createClient();
  queue("refreshSession", sessionFor(clock));
  const other = bus.endpoint();
  const auth = createTab({ clock, client, channel: bus.endpoint() });
  auth.start();
  await settle();

  auth.dispose();
  // Nothing left waiting to fire: a disposed controller holds no timers.
  assert.deepEqual(clock.pending(), []);

  other.postMessage({ type: "signed_out" });
  await clock.advance(20 * MINUTE);

  assert.equal(calls.refreshSession, 1);
  assert.deepEqual(clock.pending(), []);
});
