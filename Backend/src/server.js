const cors = require("cors");
const express = require("express");
const { createServer } = require("node:http");
const { Server } = require("socket.io");
const { createAiRouter, handleAiRequestError } = require("./ai/aiRouter");
const { createDiagramService } = require("./ai/diagramService");
const { createGeminiProvider } = require("./ai/providers/geminiProvider");
const { createRateLimiter } = require("./ai/rateLimiter");
const { createAuthRouter, handleAuthRequestError } = require("./auth/authRouter");
const { createPasswordHasher } = require("./auth/passwordHasher");
const { getServerConfig, loadLocalEnvFile } = require("./config/serverConfig");
const { createDatabase } = require("./db/createDatabase");
const { OperationStore } = require("./operations/operationStore");
const { registerBoardGateway } = require("./realtime/boardGateway");

/** How long a shutdown may take before the process stops waiting and exits. */
const SHUTDOWN_GRACE_MS = 15_000;

function createApp(config = getServerConfig(), { diagramService, database = null, logger = console } = {}) {
  const app = express();
  const httpServer = createServer(app);
  const operationStore = new OperationStore();

  app.use(cors({ origin: config.clientOrigin }));
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
  if (database) {
    app.use(
      "/api/auth",
      createAuthRouter({
        database,
        passwordHasher: createPasswordHasher({ config: config.auth.argon2, logger }),
        rateLimiter:
          config.auth.rateLimitPerMinute > 0
            ? createRateLimiter({ limit: config.auth.rateLimitPerMinute })
            : null,
        logger,
      }),
      handleAuthRequestError,
    );
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
  });

  registerBoardGateway(io, { operationStore });
  const { registerVoiceGateway } = require("./realtime/voiceGateway");
  registerVoiceGateway(io, {});

  return {
    app,
    httpServer,
    io,
    operationStore,
    database,
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

  const { httpServer, io } = createApp(config, { database });

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
  });

  const shutdown = createShutdownHandler({ httpServer, io, database });
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

module.exports = {
  createApp,
  createShutdownHandler,
};
