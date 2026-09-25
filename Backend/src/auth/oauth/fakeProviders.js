const { createHash, createSign, generateKeyPairSync, randomBytes } = require("node:crypto");
const { MICROSOFT_CONSUMER_TENANT } = require("./providers");

/**
 * Google, GitHub and Microsoft, faked at the HTTP level for tests: a `fetch`
 * that answers their token, key and profile endpoints. The real provider code
 * (`providers.js`) runs unchanged against it.
 *
 * Not a `.test.js` file, so the runner does not execute it.
 *
 * The fakes are strict where the real providers are: a code works once, only
 * with the PKCE verifier matching its challenge, and only for the redirect
 * address it was issued for. ID tokens are real RS256 tokens, signed with a
 * key generated here and published at the provider's key-set address, and
 * carry the nonce from the authorisation request.
 */

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const JWKS = { keys: [{ ...publicKey.export({ format: "jwk" }), kid: "fake-1", use: "sig", alg: "RS256" }] };

const CLIENTS = Object.freeze({
  google: { clientId: "google-client", clientSecret: "google-secret" },
  github: { clientId: "github-client", clientSecret: "github-secret" },
  microsoft: { clientId: "microsoft-client", clientSecret: "microsoft-secret", tenant: "common" },
});

function signIdToken(claims) {
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${b64({ alg: "RS256", kid: "fake-1", typ: "JWT" })}.${b64(claims)}`;
  return `${body}.${createSign("RSA-SHA256").update(body).sign(privateKey).toString("base64url")}`;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function createFakeProviders() {
  const grants = new Map();
  const githubTokens = new Map();
  const calls = [];

  /**
   * The provider has authenticated someone for the sign-in that produced
   * `authorizationUrl`: returns the code it would send back.
   *
   * @param {string} authorizationUrl  from FlowBoard's start/connect response
   * @param {Object} person  google/microsoft: ID token claims to add (sub, email, ...);
   *   github: { id, login, name, emails: [{ email, primary, verified }] }
   */
  function authenticate(authorizationUrl, person) {
    const url = new URL(authorizationUrl);
    const code = randomBytes(16).toString("hex");
    grants.set(code, {
      clientId: url.searchParams.get("client_id"),
      redirectUri: url.searchParams.get("redirect_uri"),
      challenge: url.searchParams.get("code_challenge"),
      nonce: url.searchParams.get("nonce"),
      person,
      host: url.host,
    });
    return code;
  }

  function redeem(form) {
    const grant = grants.get(form.get("code"));
    grants.delete(form.get("code"));
    if (!grant) return { error: "invalid_grant" };
    if (form.get("redirect_uri") !== grant.redirectUri) return { error: "redirect_uri_mismatch" };
    const verifier = form.get("code_verifier") ?? "";
    if (createHash("sha256").update(verifier).digest("base64url") !== grant.challenge) return { error: "invalid_grant" };
    return { grant };
  }

  async function fetchImpl(input, init = {}) {
    const url = new URL(typeof input === "string" ? input : input.url);
    calls.push(`${init.method ?? "GET"} ${url.origin}${url.pathname}`);
    const form = typeof init.body === "string" ? new URLSearchParams(init.body) : null;
    const seconds = Math.floor(Date.now() / 1000);

    if (url.href === "https://www.googleapis.com/oauth2/v3/certs") return json(JWKS);
    if (url.href === "https://login.microsoftonline.com/common/discovery/v2.0/keys") return json(JWKS);

    if (url.href === "https://oauth2.googleapis.com/token") {
      const { grant, error } = redeem(form);
      if (error) return json({ error }, 400);
      return json({
        access_token: "ya29.fake-google-access-token",
        id_token: signIdToken({
          iss: "https://accounts.google.com",
          aud: grant.clientId,
          exp: seconds + 300,
          iat: seconds,
          nonce: grant.nonce,
          ...grant.person,
        }),
      });
    }

    if (url.href === "https://login.microsoftonline.com/common/oauth2/v2.0/token") {
      const { grant, error } = redeem(form);
      if (error) return json({ error }, 400);
      const tid = grant.person.tid ?? MICROSOFT_CONSUMER_TENANT;
      return json({
        access_token: "eyJ.fake-microsoft-access-token",
        id_token: signIdToken({
          iss: grant.person.iss ?? `https://login.microsoftonline.com/${tid}/v2.0`,
          aud: grant.clientId,
          exp: seconds + 300,
          iat: seconds,
          nonce: grant.nonce,
          tid,
          ...grant.person,
        }),
      });
    }

    if (url.href === "https://github.com/login/oauth/access_token") {
      const { grant, error } = redeem(form);
      if (error) return json({ error }, 200); // GitHub reports errors with a 200
      const token = `gho_${randomBytes(12).toString("hex")}`;
      githubTokens.set(token, grant.person);
      return json({ access_token: token, token_type: "bearer", scope: "read:user,user:email" });
    }

    if (url.origin === "https://api.github.com") {
      const person = githubTokens.get((init.headers?.authorization ?? "").replace(/^Bearer /, ""));
      if (!person) return json({ message: "Bad credentials" }, 401);
      if (url.pathname === "/user") return json({ id: person.id, login: person.login, name: person.name ?? null });
      if (url.pathname === "/user/emails") return json(person.emails ?? []);
    }

    throw new Error(`unexpected request to ${url.href}`);
  }

  return { fetchImpl, authenticate, calls, githubTokens };
}

module.exports = {
  CLIENTS,
  createFakeProviders,
};
