const cors = require("cors");
const express = require("express");
const { createServer } = require("node:http");
const { Server } = require("socket.io");
const { createAiRouter, handleAiRequestError } = require("./ai/aiRouter");
const { createDiagramService } = require("./ai/diagramService");
const { createGeminiProvider } = require("./ai/providers/geminiProvider");
const { createRateLimiter } = require("./ai/rateLimiter");
const { createAccessTokens } = require("./auth/accessTokens");
const { createAccountEvents } = require("./auth/accountEvents");
const { createAuthRouter, handleAuthRequestError } = require("./auth/authRouter");
const { createBoardRouters, handleBoardRequestError } = require("./boards/boardRouter");
const { createTurnstileVerifier } = require("./auth/botCheck");
const { createLoginThrottle } = require("./auth/loginThrottle");
const { createPasswordHasher } = require("./auth/passwordHasher");
const { createRefreshCookie } = require("./auth/refreshTokens");
const { getServerConfig, loadLocalEnvFile } = require("./config/serverConfig");
const { createDatabase } = require("./db/createDatabase");
const { createEmailService } = require("./email/emailService");
const { createResendTransport } = require("./email/resendTransport");
const { createPostgresRateLimiter } = require("./http/rateLimiter");
const { createSecurityHeaders } = require("./http/securityHeaders");
const { OperationStore } = require("./operations/operationStore");
const { createBoardRepository } = require("./boards/boardRepository");
const { createSessionRepository } = require("./auth/sessionRepository");
const { registerBoardGateway } = require("./realtime/boardGateway");
const { createBoardAuthorizer } = require("./realtime/boardAuthorizer");
const { createOriginGate } = require("./realtime/originGate");
const { connectRealtimeRevocation } = require("./realtime/realtimeRevocation");
const { registerSecureBoardGateway } = require("./realtime/secureBoardGateway");
const { registerSecureVoiceGateway } = require("./realtime/secureVoiceGateway");
const { createSocketAuth } = require("./realtime/socketAuth");

/** How long a shutdown may take before the process stops waiting and exits. */
const SHUTDOWN_GRACE_MS = 15_000;

function createApp(
  config = getServerConfig(),
  {
    diagramService,
    database = null,
    logger = console,
    fetchImpl = globalThis.fetch,
    // Tests pass an in-memory mailbox; otherwise Resend when it is configured.
    emailTransport = config.email.resendApiKey
      ? createResendTransport({ apiKey: config.email.resendApiKey, fetchImpl })
      : null,
  } = {},
) {
  const app = express();
  const httpServer = createServer(app);
  const operationStore = new OperationStore();
  const accountEvents = createAccountEvents({ logger });
  const emailService = createEmailService({
    transport: emailTransport,
    from: config.email.from,
    appUrl: config.appUrl,
    logger,
  });

  // Express announces itself in every response otherwise, which tells an
  // attacker which framework to look up advisories for and helps nobody else.
  app.disable("x-powered-by");

  // Before the routes, so every response carries them — including the ones
  // produced by an error handler, which is where they are easiest to lose.
  app.use(createSecurityHeaders(config.security));

  // Only the auth routes let a page send credentials, because only they read
  // the refresh cookie, and the cookie's Path means no other route receives it.
  // Every other route stays cookie-less, so it is never a CSRF target.
  const authPath = `${config.auth.cookie.path}/`;
  app.use(
    cors((request, callback) => {
      callback(null, {
        origin: config.clientOrigin,
        credentials: request.path.startsWith(authPath),
      });
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  // Liveness: is this process running? Deliberately checks nothing else, so a
  // dependency outage restarts nothing — that is what readiness is for.
  app.get("/health", (_request, response) => {
    response.json({ ok: true, service: "flowboard-realtime" });
  });

  // Readiness: can this instance serve traffic? A load balancer uses this to
  // decide whether to send requests here, so it answers 503 while a dependency
  // is unreachable and the instance stays up and keeps retrying.
  app.get("/ready", async (_request, response) => {
    const checks = { database: "not_configured" };

    if (database) {
      try {
        await database.ping();
        checks.database = "ok";
      } catch (error) {
        checks.database = "unavailable";
        logger.error?.("[ready] Database check failed.", { message: error?.message });
      }
    }

    const ready = checks.database === "ok";

    response.status(ready ? 200 : 503).json({ ok: ready, checks });
  });

  // Authentication needs the database, so the routes only exist when one is
  // configured. Without them a request answers 404 rather than failing inside
  // a handler that has nothing to query.
  //
  // With a database but no signing key, createAccessTokens throws and the
  // server does not start. Serving sign-in pages that can never sign anyone
  // in, behind a readiness check that says all is well, would be worse.
  // With a database but no signing key this throws, and the server does not
  // start (see below).
  const accessTokens = database ? createAccessTokens({ config: config.auth.accessToken }) : null;

  if (database) {
    app.use(
      "/api/auth",
      createAuthRouter({
        database,
        passwordHasher: createPasswordHasher({ config: config.auth.argon2, logger }),
        accessTokens,
        refreshCookie: createRefreshCookie(config.auth.cookie),
        sessionLifetimes: config.auth.refreshToken,
        // The same list CORS uses: the pages that may talk to this API.
        trustedOrigins: config.clientOrigin,
        edgeSecret: config.auth.edgeSecret,
        // Counted in PostgreSQL, so each limit holds across every instance
        // rather than multiplying by them (E-17). Zero turns one off.
        signInLimiter:
          config.auth.rateLimitPerMinute > 0
            ? createPostgresRateLimiter({
                database,
                name: "sign-in",
                limit: config.auth.rateLimitPerMinute,
                logger,
              })
            : null,
        sessionPurge: {
          retentionDays: config.auth.sessionRetentionDays,
          every: config.auth.sessionPurgeEvery,
        },
        emailService,
        accountEvents,
        addressLimiter:
          config.auth.emailsPerAddressPerHour > 0
            ? createPostgresRateLimiter({
                database,
                name: "address-email",
                limit: config.auth.emailsPerAddressPerHour,
                windowSeconds: 60 * 60,
                logger,
              })
            : null,
        botCheck: config.auth.turnstileSecretKey
          ? createTurnstileVerifier({ secretKey: config.auth.turnstileSecretKey, fetchImpl, logger })
          : null,
        loginThrottle:
          config.auth.loginBackoffThreshold > 0
            ? createLoginThrottle({
                database,
                policy: { threshold: config.auth.loginBackoffThreshold },
                logger,
              })
            : null,
        sessionLimiter:
          config.auth.sessionRateLimitPerMinute > 0
            ? createPostgresRateLimiter({
                database,
                name: "session",
                limit: config.auth.sessionRateLimitPerMinute,
                logger,
              })
            : null,
        logger,
      }),
      handleAuthRequestError,
    );

    // Boards need accounts, so they exist exactly when auth does (spec
    // Phase C). Bearer-only: the web app calls them directly, like /api/ai.
    const { boardsRouter, invitesRouter } = createBoardRouters({
      database,
      accessTokens,
      accountEvents,
      appUrl: config.appUrl,
      limiter:
        config.boards.rateLimitPerMinute > 0
          ? createPostgresRateLimiter({
              database,
              name: "boards",
              limit: config.boards.rateLimitPerMinute,
              logger,
            })
          : null,
      logger,
    });
    app.use("/api/boards", boardsRouter, handleBoardRequestError);
    app.use("/api/invites", invitesRouter, handleBoardRequestError);
  }

  // AI runs over plain HTTP, never the socket: a generation takes seconds and
  // must not hold up realtime traffic. What it produces reaches peers the way
  // every other edit does — as operations from the client that inserts it.
  app.use(
    "/api/ai",
    createAiRouter({
      diagramService:
        diagramService ??
        createDiagramService({ provider: createGeminiProvider(config.ai), logger }),
      rateLimiter:
        config.ai.rateLimitPerMinute > 0
          ? createRateLimiter({ limit: config.ai.rateLimitPerMinute })
          : null,
      logger,
    }),
    handleAiRequestError,
  );

  const io = new Server(httpServer, {
    cors: {
      origin: config.clientOrigin,
      methods: ["GET", "POST"],
    },
    // Refuses a handshake from any page not on CLIENT_ORIGIN, WebSocket
    // included, which `cors` alone does not (Phase D).
    allowRequest: createOriginGate(config.clientOrigin, { logger }),
    maxHttpBufferSize: config.realtime.maxMessageBytes,
    // A dropped connection can be resumed for a while, missed events and all.
    // skipMiddlewares false: a resumed socket is authenticated again, and the
    // gateway re-checks its board access, so recovery never bypasses either.
    ...(database && config.realtime.recoverySeconds > 0
      ? {
          connectionStateRecovery: {
            maxDisconnectionDuration: config.realtime.recoverySeconds * 1000,
            skipMiddlewares: false,
          },
        }
      : {}),
  });

  if (database) {
    // Every connection authenticated, every board authorised against the
    // database, identity never taken from a payload (Phase D, E-21).
    const sessions = createSessionRepository({ database });
    io.use(
      createSocketAuth({
        accessTokens,
        sessions,
        limiter:
          config.realtime.connectRateLimitPerMinute > 0
            ? createPostgresRateLimiter({
                database,
                name: "socket-connect",
                limit: config.realtime.connectRateLimitPerMinute,
                logger,
              })
            : null,
        logger,
      }),
    );
    const authorizer = createBoardAuthorizer({ sessions, boards: createBoardRepository({ database }) });
    connectRealtimeRevocation({
      accountEvents,
      boardGateway: registerSecureBoardGateway(io, { operationStore, authorizer, logger }),
      voiceGateway: registerSecureVoiceGateway(io, { authorizer, logger }),
      logger,
    });
  } else {
    // No database means no accounts at all: the anonymous rooms of before,
    // kept so a server deployed without one still works (the "dark" deploy).
    // Anyone with a room id can join. DEPLOYMENT.md: set DATABASE_URL.
    registerBoardGateway(io, { operationStore });
    const { registerVoiceGateway } = require("./realtime/voiceGateway");
    registerVoiceGateway(io, {});
  }

  return {
    app,
    httpServer,
    io,
    operationStore,
    database,
    emailService,
    accountEvents,
  };
}

/**
 * Stop serving without cutting work in half.
 *
 * A rolling deploy sends SIGTERM and then waits. In that window the instance
 * has to stop accepting new connections, let sockets close, and release its
 * database connections — in that order, so nothing is mid-write when the pool
 * goes away. The timer is the backstop for a connection that never closes.
 */
function createShutdownHandler({
  httpServer,
  io,
  database,
  emailService = null,
  logger = console,
  graceMs = SHUTDOWN_GRACE_MS,
  exit = (code) => process.exit(code),
}) {
  let shuttingDown = false;

  return async function shutdown(signal) {
    // A second signal while already draining must not start a second drain.
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info?.(`[shutdown] ${signal} received; draining.`);

    const forceExit = setTimeout(() => {
      logger.error?.("[shutdown] Grace period expired; exiting now.");
      exit(1);
    }, graceMs);
    // Do not let this timer hold the process open if everything closes early.
    forceExit.unref();

    try {
      // Sockets first, then HTTP, then the pool: nothing may still be
      // mid-write when its database connection is taken away.
      await new Promise((resolve) => io.close(() => resolve()));
      await new Promise((resolve) => httpServer.close(() => resolve()));
      // A reset link or a security notice already promised to someone is
      // sent before the pool it needs goes away.
      await emailService?.drain();
      await database?.close();

      logger.info?.("[shutdown] Drained cleanly.");
      clearTimeout(forceExit);
      exit(0);
    } catch (error) {
      logger.error?.("[shutdown] Failed while draining.", { message: error?.message });
      clearTimeout(forceExit);
      exit(1);
    }
  };
}

if (require.main === module) {
  loadLocalEnvFile();
  const config = getServerConfig();

  const database = config.database.connectionString
    ? createDatabase({ config: config.database })
    : null;

  const { httpServer, io, emailService } = createApp(config, { database });

  httpServer.listen(config.port, () => {
    console.info(
      `FlowBoard realtime server listening on http://localhost:${config.port}`,
    );
    console.info(
      config.ai.geminiApiKey
        ? `AI diagram generation enabled (model: ${config.ai.geminiModel}).`
        : "AI diagram generation disabled: GEMINI_API_KEY is not set.",
    );
    console.info(
      database
        ? `Database pool ready (max ${config.database.poolMax} connections per instance).`
        : "Database not configured: DATABASE_URL is not set, so /ready reports not ready.",
    );
    console.info(
      database
        ? `Auth routes enabled at /api/auth (limit ${config.auth.rateLimitPerMinute}/min per client).`
        : "Auth routes disabled: they need DATABASE_URL.",
    );
    console.info(
      emailService.enabled
        ? "Email enabled through Resend (verification, password reset, security notices)."
        : "Email disabled: RESEND_API_KEY, MAIL_FROM and APP_URL are not all set. Nobody can verify an address or reset a password.",
    );
  });

  const shutdown = createShutdownHandler({ httpServer, io, database, emailService });
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

module.exports = {
  createApp,
  createShutdownHandler,
};
