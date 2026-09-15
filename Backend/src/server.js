const cors = require("cors");
const express = require("express");
const { createServer } = require("node:http");
const { Server } = require("socket.io");
const { createAiRouter, handleAiRequestError } = require("./ai/aiRouter");
const { createDiagramService } = require("./ai/diagramService");
const { createGeminiProvider } = require("./ai/providers/geminiProvider");
const { createRateLimiter } = require("./ai/rateLimiter");
const { getServerConfig, loadLocalEnvFile } = require("./config/serverConfig");
const { OperationStore } = require("./operations/operationStore");
const { registerBoardGateway } = require("./realtime/boardGateway");

function createApp(config = getServerConfig(), { diagramService, logger = console } = {}) {
  const app = express();
  const httpServer = createServer(app);
  const operationStore = new OperationStore();

  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.json({ ok: true, service: "flowboard-realtime" });
  });

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
  };
}

if (require.main === module) {
  loadLocalEnvFile();
  const config = getServerConfig();
  const { httpServer } = createApp(config);

  httpServer.listen(config.port, () => {
    console.info(
      `FlowBoard realtime server listening on http://localhost:${config.port}`,
    );
    console.info(
      config.ai.geminiApiKey
        ? `AI diagram generation enabled (model: ${config.ai.geminiModel}).`
        : "AI diagram generation disabled: GEMINI_API_KEY is not set.",
    );
  });
}

module.exports = {
  createApp,
};
