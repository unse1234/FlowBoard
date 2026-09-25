const { createKeySet, verifyIdToken } = require("./idToken");

/**
 * Google, GitHub and Microsoft, each reduced to the same two steps (spec
 * Phase E, E-23, ADR 0009):
 *
 * 1. `authorizationUrl` sends the browser to the provider with FlowBoard's
 *    state, PKCE challenge and (OIDC) nonce.
 * 2. `exchange` turns the code the provider sent back into an identity:
 *    `{ subject, tenantId, email, emailVerified, name }`.
 *
 * `subject` (with `tenantId`) is the provider's stable id and the only thing
 * an identity is ever matched on. `email` and `emailVerified` decide only
 * whether a *new* account may be created from it.
 *
 * Provider access tokens are used within `exchange` (GitHub needs one to read
 * the profile) and then dropped: nothing here stores them.
 */

class OAuthFailure extends Error {
  /** @param {string} code  what the page is told, e.g. "email_unverified" @param {string} [detail] for the log */
  constructor(code, detail) {
    super(detail ?? code);
    this.name = "OAuthFailure";
    this.code = code;
  }
}

/** Microsoft's tenant for personal accounts, whose addresses Microsoft has verified. */
const MICROSOFT_CONSUMER_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";

const TIMEOUT_MS = 10_000;

async function postForm(fetchImpl, url, form) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.error) {
    throw new OAuthFailure("provider_failed", `token endpoint ${response.status} ${body?.error ?? ""}`.trim());
  }
  return body;
}

function createGoogle({ clientId, clientSecret }, { fetchImpl, now }) {
  const keySet = createKeySet({ url: "https://www.googleapis.com/oauth2/v3/certs", fetchImpl, now });

  return {
    id: "google",
    label: "Google",
    authorizationUrl({ state, codeChallenge, nonce, redirectUri }) {
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        prompt: "select_account",
      }).toString();
      return url.toString();
    },
    async exchange({ code, codeVerifier, redirectUri, nonce }) {
      const tokens = await postForm(fetchImpl, "https://oauth2.googleapis.com/token", {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: codeVerifier,
      });
      const result = await verifyIdToken(tokens.id_token, {
        keySet,
        audience: clientId,
        nonce,
        now,
        issuer: (claims) => claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com",
      });
      if (!result.valid) throw new OAuthFailure("provider_failed", `id token: ${result.reason}`);
      const { claims } = result;
      return {
        subject: claims.sub,
        tenantId: "",
        email: typeof claims.email === "string" ? claims.email : null,
        emailVerified: claims.email_verified === true,
        name: typeof claims.name === "string" ? claims.name : null,
      };
    },
  };
}

function createGitHub({ clientId, clientSecret }, { fetchImpl }) {
  const api = async (path, accessToken) => {
    const response = await fetchImpl(`https://api.github.com${path}`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "FlowBoard",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new OAuthFailure("provider_failed", `GitHub ${path} answered ${response.status}`);
    return response.json();
  };

  return {
    id: "github",
    label: "GitHub",
    authorizationUrl({ state, codeChallenge, redirectUri }) {
      const url = new URL("https://github.com/login/oauth/authorize");
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        // The least that identifies someone and reads their addresses.
        scope: "read:user user:email",
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        allow_signup: "true",
      }).toString();
      return url.toString();
    },
    async exchange({ code, codeVerifier, redirectUri }) {
      const tokens = await postForm(fetchImpl, "https://github.com/login/oauth/access_token", {
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: codeVerifier,
      });
      if (typeof tokens.access_token !== "string") throw new OAuthFailure("provider_failed", "no access token");

      const profile = await api("/user", tokens.access_token);
      const emails = await api("/user/emails", tokens.access_token);
      if (!Number.isInteger(profile?.id)) throw new OAuthFailure("provider_failed", "no GitHub user id");

      // Only the address GitHub marks both primary and verified counts.
      const primary = Array.isArray(emails) ? emails.find((entry) => entry?.primary === true && entry?.verified === true) : null;
      return {
        // The numeric id: a username can be changed and then taken by someone else.
        subject: String(profile.id),
        tenantId: "",
        email: typeof primary?.email === "string" ? primary.email : null,
        emailVerified: Boolean(primary),
        name: typeof profile.name === "string" && profile.name.trim() ? profile.name : (profile.login ?? null),
      };
    },
  };
}

function createMicrosoft({ clientId, clientSecret, tenant = "common" }, { fetchImpl, now }) {
  const base = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}`;
  const keySet = createKeySet({ url: `${base}/discovery/v2.0/keys`, fetchImpl, now });

  return {
    id: "microsoft",
    label: "Microsoft",
    authorizationUrl({ state, codeChallenge, nonce, redirectUri }) {
      const url = new URL(`${base}/oauth2/v2.0/authorize`);
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        response_mode: "query",
        scope: "openid email profile",
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        prompt: "select_account",
      }).toString();
      return url.toString();
    },
    async exchange({ code, codeVerifier, redirectUri, nonce }) {
      const tokens = await postForm(fetchImpl, `${base}/oauth2/v2.0/token`, {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: codeVerifier,
        scope: "openid email profile",
      });
      const result = await verifyIdToken(tokens.id_token, {
        keySet,
        audience: clientId,
        nonce,
        now,
        // Multi-tenant: the issuer names the tenant the token itself claims.
        issuer: (claims) =>
          typeof claims.tid === "string" && claims.iss === `https://login.microsoftonline.com/${claims.tid}/v2.0`,
      });
      if (!result.valid) throw new OAuthFailure("provider_failed", `id token: ${result.reason}`);
      const { claims } = result;
      if (typeof claims.oid !== "string" || claims.oid === "") throw new OAuthFailure("provider_failed", "no oid");

      // Microsoft's `email` is whatever the tenant says, verified or not. It
      // counts only for personal accounts, or where the tenant has proven it
      // owns the domain (the optional `xms_edov` claim): the nOAuth guidance.
      const email = typeof claims.email === "string" ? claims.email : null;
      return {
        subject: claims.oid,
        tenantId: claims.tid,
        email,
        emailVerified: Boolean(email) && (claims.tid === MICROSOFT_CONSUMER_TENANT || claims.xms_edov === true),
        name: typeof claims.name === "string" ? claims.name : null,
      };
    },
  };
}

const FACTORIES = Object.freeze({ google: createGoogle, github: createGitHub, microsoft: createMicrosoft });

/**
 * The providers that have credentials configured, by id.
 *
 * @param {{ google?: Object | null, github?: Object | null, microsoft?: Object | null }} oauthConfig
 * @param {{ fetchImpl?: typeof fetch, now?: () => number }} [options]
 */
function createProviders(oauthConfig, { fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  const providers = {};
  for (const [id, create] of Object.entries(FACTORIES)) {
    if (oauthConfig?.[id]) providers[id] = create(oauthConfig[id], { fetchImpl, now });
  }
  return providers;
}

module.exports = {
  MICROSOFT_CONSUMER_TENANT,
  OAuthFailure,
  createProviders,
};
