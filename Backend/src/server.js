const cors = require("cors");
const express = require("express");
const { createServer } = require("node:http");
const { Server } = require("socket.io");
const { getServerConfig } = require("./config/serverConfig");
const { OperationStore } = require("./operations/operationStore");
const { registerBoardGateway } = require("./realtime/boardGateway");

function createApp(config = getServerConfig()) {
  const app = express();
  const httpServer = createServer(app);
  const operationStore = new OperationStore();

  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.json({ ok: true, service: "flowboard-realtime" });
  });

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
  const config = getServerConfig();
  const { httpServer } = createApp(config);

  httpServer.listen(config.port, () => {
    console.info(
      `FlowBoard realtime server listening on http://localhost:${config.port}`,
    );
  });
}

module.exports = {
  createApp,
};
