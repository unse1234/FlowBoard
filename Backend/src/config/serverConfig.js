const DEFAULT_PORT = 3001;
const DEFAULT_CLIENT_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

function getServerConfig(env = process.env) {
  return {
    port: Number(env.PORT ?? DEFAULT_PORT),
    clientOrigin: env.CLIENT_ORIGIN
      ? env.CLIENT_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean)
      : DEFAULT_CLIENT_ORIGINS,
  };
}

module.exports = {
  getServerConfig,
};
