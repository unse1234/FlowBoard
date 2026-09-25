const assert = require("node:assert/strict");
const test = require("node:test");
const { BASE_CONFIG, SKIP, TRUSTED_ORIGIN, VALID_SIGNUP, readSetCookie, startAuthServer } = require("../testServer");
const { CLIENTS, createFakeProviders } = require("./fakeProviders");
const { MICROSOFT_CONSUMER_TENANT } = require("./providers");

/**
 * Sign-in with Google, GitHub and Microsoft (spec Phase E, E-23) against a
 * real PostgreSQL and the real provider code, with the providers themselves
 * faked at the HTTP level (fakeProviders.js).
 */

const COOKIE = BASE_CONFIG.auth.cookie.name;
const BINDING = BASE_CONFIG.auth.cookie.secure ? "__Secure-flowboard_oauth" : "flowboard_oauth";
const WORK_TENANT = "72f988bf-86f1-41af-91ab-2d7cd011db47";

const GOOGLE_ADA = Object.freeze({ sub: "google-ada-1", email: "ada@gmail.com", email_verified: true, name: "Ada Lovelace" });

async function serverWithProviders(t) {
  const fake = createFakeProviders();
  const server = await startAuthServer(t, { oauth: CLIENTS, fetchImpl: fake.fetchImpl });
  return { server, fake };
}

/** Press "Continue with …" (or "Connect", with an access token). */
async function begin(server, provider, { accessToken, intent } = {}) {
  const path = accessToken ? `/api/auth/oauth/${provider}/connect` : `/api/auth/oauth/${provider}/start`;
  const response = await fetch(`${server.baseUrl}${path}`, {
    method: "POST",
    headers: {
      origin: TRUSTED_ORIGIN,
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(intent ? { intent } : {}),
  });
  const body = await response.json();
  assert.equal(response.status, 200, `begin: ${JSON.stringify(body)}`);
  const url = new URL(body.authorizationUrl);
  return { url: body.authorizationUrl, state: url.searchParams.get("state"), binding: readSetCookie(response, BINDING)?.value };
}

/** The provider sends the browser back. */
async function callback(server, provider, { code, state, binding, error }) {
  const query = new URLSearchParams({ ...(code ? { code } : {}), ...(state ? { state } : {}), ...(error ? { error } : {}) });
  const response = await fetch(`${server.baseUrl}/api/auth/oauth/${provider}/callback?${query}`, {
    redirect: "manual",
    headers: binding ? { cookie: `${BINDING}=${binding}` } : {},
  });
  const location = response.headers.get("location") ?? "";
  const params = new URL(location, "http://app.test").searchParams;
  return {
    status: response.status,
    outcome: params.get("oauth"),
    error: params.get("oauth_error"),
    refresh: readSetCookie(response, COOKIE)?.value ?? null,
  };
}

/** Begin, authenticate at the provider as `person`, and come back. */
async function signInWith(server, fake, provider, person, options) {
  const started = await begin(server, provider, options);
  const code = fake.authenticate(started.url, person);
  return callback(server, provider, { code, state: started.state, binding: started.binding });
}

async function accountFor(server, refresh) {
  const response = await server.refresh(refresh);
  const body = await response.json();
  return body;
}

async function passwordAccount(server, { verified = true } = {}) {
  await server.signup(VALID_SIGNUP);
  if (verified) await server.database.query("UPDATE users SET email_verified_at = now()");
  const response = await server.login({ email: VALID_SIGNUP.email, password: VALID_SIGNUP.password });
  const body = await response.json();
  return { id: body.user.id, accessToken: body.accessToken };
}

// --- Signing in ------------------------------------------------------------------

test("the configured providers are listed", { skip: SKIP }, async (t) => {
  const { server } = await serverWithProviders(t);

  const body = await (await fetch(`${server.baseUrl}/api/auth/providers`)).json();

  assert.deepEqual(body.providers, [
    { id: "google", label: "Google" },
    { id: "github", label: "GitHub" },
    { id: "microsoft", label: "Microsoft" },
  ]);
});

test("a new Google identity with a verified email creates an account, signed in", { skip: SKIP }, async (t) => {
  const { server, fake } = await serverWithProviders(t);

  const result = await signInWith(server, fake, "google", GOOGLE_ADA);

  assert.equal(result.status, 303);
  assert.equal(result.outcome, "signed-up");
  const session = await accountFor(server, result.refresh);
  assert.equal(session.user.email, "ada@gmail.com");
  assert.equal(session.user.displayName, "Ada Lovelace");
  assert.equal(session.user.emailVerified, true);
  assert.equal(session.user.hasPassword, false);

  // Keyed on Google's sub, not the address; and no provider token kept anywhere.
  const { rows } = await server.database.query("SELECT * FROM auth_identities");
  assert.equal(rows[0].provider_user_id, "google-ada-1");
  assert.equal(rows[0].provider, "google");
  assert.ok(!JSON.stringify(rows).includes("ya29"));
});

test("the same identity signs in to the same account, whatever its email says now", { skip: SKIP }, async (t) => {
  const { server, fake } = await serverWithProviders(t);
  const first = await signInWith(server, fake, "google", GOOGLE_ADA);
  const firstId = (await accountFor(server, first.refresh)).user.id;

  const again = await signInWith(server, fake, "google", { ...GOOGLE_ADA, email: "ada.new@gmail.com" });

  assert.equal(again.outcome, "signed-in");
  assert.equal((await accountFor(server, again.refresh)).user.id, firstId);
});

test("an existing password account is never joined by email", { skip: SKIP }, async (t) => {
  const { server, fake } = await serverWithProviders(t);
  await passwordAccount(server);

  const result = await signInWith(server, fake, "google", { ...GOOGLE_ADA, email: VALID_SIGNUP.email.toLowerCase() });

  assert.equal(result.error, "account_exists");
  assert.equal(result.refresh, null);
  assert.equal((await server.database.query("SELECT count(*)::int AS n FROM auth_identities")).rows[0].n, 0);
  assert.equal(await server.countUsers(), 1);
});

test("an unverified provider email creates nothing", { skip: SKIP }, async (t) => {
  const { server, fake } = await serverWithProviders(t);

  const result = await signInWith(server, fake, "google", { ...GOOGLE_ADA, email_verified: false });

  assert.equal(result.error, "email_unverified");
  assert.equal(await server.countUsers(), 0);
});

// --- The sign-in itself is protected ---------------------------------------------

test("a state works once", { skip: SKIP }, async (t) => {
  const { server, fake } = await serverWithProviders(t);
  const started = await begin(server, "google");
  const code = fake.authenticate(started.url, GOOGLE_ADA);

  assert.equal((await callback(server, "google", { code, state: started.state, binding: started.binding })).outcome, "signed-up");
  const replay = await callback(server, "google", { code, state: started.state, binding: started.binding });
  assert.equal(replay.error, "state_invalid");
});

test("a callback without this browser's binding cookie is refused: no login CSRF", { skip: SKIP }, async (t) => {
  const { server, fake } = await serverWithProviders(t);
  const attacker = await begin(server, "google");
  const victim = await begin(server, "google");
  const code = fake.authenticate(attacker.url, GOOGLE_ADA);

  const noCookie = await callback(server, "google", { code, state: attacker.state });
  assert.equal(noCookie.error, "state_invalid");
  const otherBrowser = await callback(server, "google", { code, state: attacker.state, binding: victim.binding });
  assert.equal(otherBrowser.error, "state_invalid");
  assert.equal(await server.countUsers(), 0);
});

test("an expired sign-in, a cancelled one and a made-up state are refused", { skip: SKIP }, async (t) => {
  const { server, fake } = await serverWithProviders(t);

  const expired = await begin(server, "google");
  await server.database.query("UPDATE oauth_states SET created_at = now() - interval '1 hour', expires_at = now() - interval '1 second'");
  assert.equal(
    (await callback(server, "google", { code: fake.authenticate(expired.url, GOOGLE_ADA), state: expired.state, binding: expired.binding })).error,
    "state_invalid",
  );

  const cancelled = await begin(server, "google");
  assert.equal((await callback(server, "google", { error: "access_denied", state: cancelled.state, binding: cancelled.binding })).error, "cancelled");

  assert.equal((await callback(server, "google", { code: "x", state: "A".repeat(43), binding: "B".repeat(43) })).error, "state_invalid");
});

test("an ID token for another sign-in (wrong nonce) is refused", { skip: SKIP }, async (t) => {
  const { server, fake } = await serverWithProviders(t);
  const started = await begin(server, "google");
  const code = fake.authenticate(started.url, { ...GOOGLE_ADA, nonce: "someone-elses-nonce" });

  const result = await callback(server, "google", { code, state: started.state, binding: started.binding });

  assert.equal(result.error, "provider_failed");
  assert.equal(await server.countUsers(), 0);
});

// --- Connecting from settings --------------------------------------------------

test("a signed-in account connects a provider, and can then sign in with it", { skip: SKIP }, async (t) => {
  const { server, fake } = await serverWithProviders(t);
  const ada = await passwordAccount(server);

  const linked = await signInWith(server, fake, "google", GOOGLE_ADA, { accessToken: ada.accessToken, intent: "link" });
  assert.equal(linked.outcome, "linked");

  const listed = await (await server.authed("GET", "/api/auth/identities", ada.accessToken)).json();
  assert.deepEqual(listed.identities.map((identity) => [identity.provider, identity.email]), [["google", "ada@gmail.com"]]);

  const signedIn = await signInWith(server, fake, "google", GOOGLE_ADA);
  assert.equal(signedIn.outcome, "signed-in");
  assert.equal((await accountFor(server, signedIn.refresh)).user.id, ada.id);

  await server.drainEmail();
  assert.equal(server.mailbox.sent.at(-1).subject, "Google was connected to your FlowBoard account");
});

test("an identity linked to one account cannot be linked to another", { skip: SKIP }, async (t) => {
  const { server, fake } = await serverWithProviders(t);
  await signInWith(server, fake, "google", GOOGLE_ADA); // Google-only account
  const ada = await passwordAccount(server);

  const result = await signInWith(server, fake, "google", GOOGLE_ADA, { accessToken: ada.accessToken, intent: "link" });

  assert.equal(result.error, "identity_in_use");
});

test("one identity per provider per account", { skip: SKIP }, async (t) => {
  const { server, fake } = await serverWithProviders(t);
  const ada = await passwordAccount(server);
  await signInWith(server, fake, "google", GOOGLE_ADA, { accessToken: ada.accessToken, intent: "link" });

  const second = await signInWith(server, fake, "google", { ...GOOGLE_ADA, sub: "google-ada-2" }, { accessToken: ada.accessToken, intent: "link" });

  assert.equal(second.error, "provider_already_linked");
});

test("connecting needs a live session, and the session must still be live when it returns", { skip: SKIP }, async (t) => {
  const { server, fake } = await serverWithProviders(t);
  const ada = await passwordAccount(server);

  const refused = await fetch(`${server.baseUrl}/api/auth/oauth/google/connect`, {
    method: "POST",
    headers: { origin: TRUSTED_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({ intent: "link" }),
  });
  assert.equal(refused.status, 401);

  const started = await begin(server, "google", { accessToken: ada.accessToken, intent: "link" });
  await server.database.query("UPDATE auth_sessions SET revoked_at = now(), revoked_reason = 'logout'");
  const result = await callback(server, "google", { code: fake.authenticate(started.url, GOOGLE_ADA), state: started.state, binding: started.binding });

  assert.equal(result.error, "session_ended");
  assert.equal((await server.database.query("SELECT count(*)::int AS n FROM auth_identities")).rows[0].n, 0);
});

// --- Disconnecting ------------------------------------------------------------------

test("a provider can be disconnected only while another way in remains", { skip: SKIP }, async (t) => {
  const { server, fake } = await serverWithProviders(t);
  const googleOnly = await signInWith(server, fake, "google", GOOGLE_ADA);
  const { accessToken } = await accountFor(server, googleOnly.refresh);
  const identities = async () => (await (await server.authed("GET", "/api/auth/identities", accessToken)).json()).identities;
  const [google] = await identities();

  const last = await server.authed("DELETE", `/api/auth/identities/${google.id}`, accessToken);
  assert.equal(last.status, 409);
  assert.equal((await last.json()).code, "LAST_SIGN_IN_METHOD");

  // With GitHub connected too, Google may go.
  await signInWith(
    server,
    fake,
    "github",
    { id: 4242, login: "ada", emails: [{ email: "ada@gmail.com", primary: true, verified: true }] },
    { accessToken, intent: "link" },
  );
  assert.equal((await server.authed("DELETE", `/api/auth/identities/${google.id}`, accessToken)).status, 200);
  assert.deepEqual((await identities()).map((identity) => identity.provider), ["github"]);
});

test("a password account may disconnect its only provider", { skip: SKIP }, async (t) => {
  const { server, fake } = await serverWithProviders(t);
  const ada = await passwordAccount(server);
  await signInWith(server, fake, "google", GOOGLE_ADA, { accessToken: ada.accessToken, intent: "link" });
  const [google] = (await (await server.authed("GET", "/api/auth/identities", ada.accessToken)).json()).identities;

  assert.equal((await server.authed("DELETE", `/api/auth/identities/${google.id}`, ada.accessToken)).status, 200);
  await server.drainEmail();
  assert.equal(server.mailbox.sent.at(-1).subject, "Google was disconnected from your FlowBoard account");
});

// --- Proving identity again ------------------------------------------------------

test("a provider sign-in lets an account without a password set one", { skip: SKIP }, async (t) => {
  const { server, fake } = await serverWithProviders(t);
  const signedUp = await signInWith(server, fake, "google", GOOGLE_ADA);
  const { accessToken } = await accountFor(server, signedUp.refresh);
  const setPassword = () => server.authed("POST", "/api/auth/password", accessToken, { newPassword: "a-brand-new-passphrase" });

  assert.equal((await (await setPassword()).json()).code, "REAUTHENTICATION_REQUIRED");

  const proved = await signInWith(server, fake, "google", GOOGLE_ADA, { accessToken, intent: "reauthenticate" });
  assert.equal(proved.outcome, "reauthenticated");
  assert.equal((await setPassword()).status, 200);
});

test("proving identity with someone else's provider account is refused", { skip: SKIP }, async (t) => {
  const { server, fake } = await serverWithProviders(t);
  const signedUp = await signInWith(server, fake, "google", GOOGLE_ADA);
  const { accessToken } = await accountFor(server, signedUp.refresh);

  const result = await signInWith(server, fake, "google", { ...GOOGLE_ADA, sub: "google-mallory" }, { accessToken, intent: "reauthenticate" });

  assert.equal(result.error, "wrong_account");
});

// --- GitHub and Microsoft specifics ---------------------------------------------------

test("GitHub is keyed on the numeric id, and needs a verified primary email", { skip: SKIP }, async (t) => {
  const { server, fake } = await serverWithProviders(t);

  const unverified = await signInWith(server, fake, "github", {
    id: 7,
    login: "grace",
    emails: [
      { email: "grace@example.com", primary: true, verified: false },
      { email: "grace@other.test", primary: false, verified: true },
    ],
  });
  assert.equal(unverified.error, "email_unverified");

  const signedUp = await signInWith(server, fake, "github", {
    id: 7,
    login: "grace",
    name: "Grace Hopper",
    emails: [{ email: "grace@example.com", primary: true, verified: true }],
  });
  assert.equal(signedUp.outcome, "signed-up");

  // A renamed GitHub account is the same person.
  const renamed = await signInWith(server, fake, "github", { id: 7, login: "admiral", emails: [] });
  assert.equal(renamed.outcome, "signed-in");
  const { rows } = await server.database.query("SELECT provider_user_id FROM auth_identities");
  assert.deepEqual(rows, [{ provider_user_id: "7" }]);
  // GitHub's access tokens are used and dropped.
  const stored = JSON.stringify((await server.database.query("SELECT * FROM auth_identities")).rows);
  for (const token of fake.githubTokens.keys()) assert.ok(!stored.includes(token));
});

test("Microsoft is keyed on tenant and oid, and trusts an email only when verified", { skip: SKIP }, async (t) => {
  const { server, fake } = await serverWithProviders(t);
  const work = { sub: "pairwise-1", oid: "oid-linus", tid: WORK_TENANT, email: "linus@contoso.test", name: "Linus" };

  assert.equal((await signInWith(server, fake, "microsoft", work)).error, "email_unverified");

  const verified = await signInWith(server, fake, "microsoft", { ...work, xms_edov: true });
  assert.equal(verified.outcome, "signed-up");
  const { rows } = await server.database.query("SELECT provider_tenant_id, provider_user_id FROM auth_identities");
  assert.deepEqual(rows, [{ provider_tenant_id: WORK_TENANT, provider_user_id: "oid-linus" }]);

  // A personal Microsoft account's address is verified by Microsoft.
  const personal = await signInWith(server, fake, "microsoft", {
    sub: "pairwise-2",
    oid: "oid-margaret",
    tid: MICROSOFT_CONSUMER_TENANT,
    email: "margaret@outlook.test",
  });
  assert.equal(personal.outcome, "signed-up");
});

test("a Microsoft token whose issuer does not match its tenant is refused", { skip: SKIP }, async (t) => {
  const { server, fake } = await serverWithProviders(t);

  const result = await signInWith(server, fake, "microsoft", {
    sub: "x",
    oid: "oid-x",
    tid: WORK_TENANT,
    iss: `https://login.microsoftonline.com/${MICROSOFT_CONSUMER_TENANT}/v2.0`,
    email: "x@contoso.test",
    xms_edov: true,
  });

  assert.equal(result.error, "provider_failed");
});

test("an unconfigured provider cannot be started", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);

  const response = await server.post("/api/auth/oauth/google/start", {});

  assert.equal(response.status, 404);
  assert.equal((await response.json()).code, "PROVIDER_UNAVAILABLE");
});

test("proving identity with an identity linked to another account is refused", { skip: SKIP }, async (t) => {
  const { server, fake } = await serverWithProviders(t);
  const mallory = { sub: "google-mallory", email: "mallory@gmail.com", email_verified: true, name: "Mallory" };
  await signInWith(server, fake, "google", mallory); // Mallory's Google is a real, linked identity
  const ada = await signInWith(server, fake, "google", GOOGLE_ADA);
  const { accessToken } = await accountFor(server, ada.refresh);

  const result = await signInWith(server, fake, "google", mallory, { accessToken, intent: "reauthenticate" });

  assert.equal(result.error, "wrong_account");
  const { rows } = await server.database.query("SELECT count(*)::int AS n FROM auth_sessions WHERE reauthenticated_at IS NOT NULL");
  assert.equal(rows[0].n, 0);
});

test("a state started with one provider is refused at another's callback", { skip: SKIP }, async (t) => {
  const { server, fake } = await serverWithProviders(t);
  const started = await begin(server, "google");
  const code = fake.authenticate(started.url, GOOGLE_ADA);

  const result = await callback(server, "github", { code, state: started.state, binding: started.binding });

  assert.equal(result.error, "state_invalid");
});
