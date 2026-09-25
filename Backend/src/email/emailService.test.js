const assert = require("node:assert/strict");
const test = require("node:test");
const { createEmailService } = require("./emailService");
const { createMemoryTransport } = require("./memoryTransport");
const { escapeHtml } = require("./templates/layout");

const APP_URL = "https://app.flowboard.test";
const FROM = "FlowBoard <no-reply@flowboard.test>";
const USER = Object.freeze({ id: "user-1", email: "ada@example.com", displayName: "Ada Lovelace" });
const TOKEN = "Zm9vYmFyYmF6cXV4LXRva2VuLXZhbHVlLTEyMzQ1Njc4OTA";

function recordingLogger() {
  const lines = [];
  const record = (level) => (...args) => lines.push({ level, text: JSON.stringify(args) });
  return { logger: { info: record("info"), warn: record("warn"), error: record("error") }, lines };
}

function serviceWith(overrides = {}) {
  const transport = createMemoryTransport();
  const { logger, lines } = recordingLogger();
  const service = createEmailService({ transport, from: FROM, appUrl: APP_URL, logger, ...overrides });
  return { service, transport, lines };
}

test("the verification email links to the web app with the token", async () => {
  const { service, transport } = serviceWith();

  const result = await service.sendVerificationEmail({ user: USER, token: TOKEN, expiresInHours: 24 });

  assert.equal(result.sent, true);
  const [message] = transport.sent;
  assert.equal(message.to, USER.email);
  assert.equal(message.from, FROM);
  assert.equal(message.subject, "Confirm your email address for FlowBoard");
  const url = `${APP_URL}/verify-email?token=${TOKEN}`;
  assert.ok(message.text.includes(url));
  assert.ok(message.html.includes(`href="${url}"`));
  assert.match(message.text, /expires in 24 hours/);
  assert.equal(transport.tokenFrom(message), TOKEN);
});

test("the reset email links to the reset page and says when it expires", async () => {
  const { service, transport } = serviceWith();

  await service.sendPasswordResetEmail({ user: USER, token: TOKEN, expiresInMinutes: 30 });

  const [message] = transport.sent;
  assert.equal(message.subject, "Reset your FlowBoard password");
  assert.ok(message.text.includes(`${APP_URL}/reset-password?token=${TOKEN}`));
  assert.match(message.text, /expires in 30 minutes/);
});

test("a token's email is keyed on the token, and the key is not the token", async () => {
  const { service, transport } = serviceWith();

  await service.sendVerificationEmail({ user: USER, token: TOKEN, expiresInHours: 24 });
  await service.sendVerificationEmail({ user: USER, token: TOKEN, expiresInHours: 24 });
  await service.sendVerificationEmail({ user: USER, token: `${TOKEN}x`, expiresInHours: 24 });

  // The same token twice is one email; a new token is a new one.
  assert.equal(transport.sent.length, 2);
  for (const message of transport.sent) assert.ok(!message.idempotencyKey.includes(TOKEN));
  assert.notEqual(transport.sent[0].idempotencyKey, transport.sent[1].idempotencyKey);
});

test("a repeated security event is one email", async () => {
  const { service, transport } = serviceWith();

  await service.sendPasswordChangedNotification({ user: USER, reset: false, tokenVersion: 3 });
  await service.sendPasswordChangedNotification({ user: USER, reset: false, tokenVersion: 3 });
  await service.sendAccountDeletedNotification({ user: USER });
  await service.sendAccountDeletedNotification({ user: USER });
  await service.sendPasswordChangedNotification({ user: USER, reset: true, tokenVersion: 4 });

  assert.deepEqual(
    transport.sent.map((message) => message.subject),
    [
      "Your FlowBoard password was changed",
      "Your FlowBoard account was deleted",
      "Your FlowBoard password was changed",
    ],
  );
});

test("a notice carries no token and no link that acts", async () => {
  const { service, transport } = serviceWith();

  await service.sendPasswordChangedNotification({ user: USER, reset: true, tokenVersion: 1 });
  await service.sendPasswordSetNotification({ user: USER, tokenVersion: 2 });
  await service.sendAccountDeletedNotification({ user: USER });
  await service.sendAccountExistsNotice({ user: USER });
  await service.sendIdentityLinkedNotification({ user: USER, provider: "Google", identityId: "i-1" });
  await service.sendIdentityUnlinkedNotification({ user: USER, provider: "Google", identityId: "i-1" });

  assert.equal(transport.sent.length, 6);
  for (const message of transport.sent) {
    assert.ok(!/token=/i.test(message.text), message.subject);
    assert.ok(!/token=/i.test(message.html), message.subject);
  }
  // The account-exists notice points at sign-in, not at a reset.
  const notice = transport.sent.find((message) => message.subject === "You already have a FlowBoard account");
  assert.ok(notice.text.includes(`${APP_URL}/?auth=sign-in`));
});

test("a display name is escaped in HTML and kept as typed in text", async () => {
  const { service, transport } = serviceWith();
  const hostile = { ...USER, displayName: `Eve <a href="https://evil.test">click</a> & "co"` };

  await service.sendVerificationEmail({ user: hostile, token: TOKEN, expiresInHours: 24 });

  const [message] = transport.sent;
  assert.ok(!message.html.includes("<a href=\"https://evil.test\">"));
  assert.ok(message.html.includes(escapeHtml(hostile.displayName)));
  assert.ok(message.text.includes(hostile.displayName));
});

test("nothing identifying or secret reaches the log", async () => {
  const { service, lines } = serviceWith();

  await service.sendVerificationEmail({ user: USER, token: TOKEN, expiresInHours: 24 });
  await service.sendPasswordResetEmail({ user: USER, token: TOKEN, expiresInMinutes: 30 });

  const logged = lines.map((line) => line.text).join("\n");
  assert.ok(logged.length > 0);
  assert.ok(!logged.includes(TOKEN), "a token");
  assert.ok(!logged.includes(USER.email), "a recipient");
  assert.ok(!logged.includes("Reset your"), "a subject");
});

test("without a transport nothing is sent, and the warning names only the kind", async () => {
  const { logger, lines } = recordingLogger();
  const service = createEmailService({ transport: null, from: null, appUrl: null, logger });

  assert.equal(service.enabled, false);
  assert.deepEqual(await service.sendVerificationEmail({ user: USER, token: TOKEN, expiresInHours: 24 }), {
    sent: false,
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].level, "warn");
  assert.ok(lines[0].text.includes("verify-email"));
  assert.ok(!lines[0].text.includes(USER.email));
  assert.ok(!lines[0].text.includes(TOKEN));
});

test("a background send never throws into its caller, and drain waits for it", async () => {
  const { service, transport, lines } = serviceWith();
  transport.failNext(Object.assign(new Error("Resend answered 503"), { status: 503, type: "service_unavailable" }));

  service.inBackground("verify-email", () =>
    service.sendVerificationEmail({ user: USER, token: TOKEN, expiresInHours: 24 }),
  );
  service.inBackground("reset-password", () =>
    service.sendPasswordResetEmail({ user: USER, token: `${TOKEN}r`, expiresInMinutes: 30 }),
  );
  await service.drain();

  assert.equal(transport.sent.length, 1);
  const failure = lines.find((line) => line.level === "error");
  assert.ok(failure.text.includes("verify-email"));
  assert.ok(failure.text.includes("503"));
  assert.ok(!failure.text.includes(TOKEN));
});
