const express = require("express");
const { AiError, toAiError } = require("./aiErrors");

/**
 * HTTP routes for AI features, mounted at /api/ai.
 *
 * Every response uses one envelope: `{ ok: true, ... }` on success and
 * `{ ok: false, code, error }` on failure, where `error` is safe to show a
 * user. Provider messages, validation detail and stack traces are logged here
 * and never sent.
 */
function createAiRouter({ diagramService, rateLimiter = null, logger = console }) {
  const router = express.Router();

  router.post("/generate-diagram", async (request, response) => {
    const limit = rateLimiter?.consume(getClientKey(request));
    if (limit && !limit.allowed) {
      sendError(
        response,
        new AiError("RATE_LIMITED", { retryAfterSeconds: limit.retryAfterSeconds }),
      );
      return;
    }

    // A client that gives up — closes the panel, leaves the page — should not
    // keep a generation running against the quota.
    const controller = new AbortController();
    const cancelIfUnfinished = () => {
      if (!response.writableEnded) controller.abort();
    };
    response.on("close", cancelIfUnfinished);

    try {
      const diagram = await diagramService.generateDiagram({
        prompt: request.body?.prompt,
        board: request.body?.board,
        signal: controller.signal,
      });

      response.json({ ok: true, diagram });
    } catch (error) {
      const aiError = toAiError(error);
      logFailure(logger, aiError);

      if (!controller.signal.aborted && !response.headersSent) sendError(response, aiError);
    } finally {
      response.off("close", cancelIfUnfinished);
    }
  });

  return router;
}

/**
 * Answer in the same envelope when the body parser rejects a request before it
 * reaches a route — otherwise Express would reply with an HTML error page.
 */
function handleAiRequestError(error, _request, response, next) {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error?.type === "entity.parse.failed") {
    sendError(response, new AiError("INVALID_JSON"));
    return;
  }

  if (error?.type === "entity.too.large") {
    sendError(response, new AiError("PAYLOAD_TOO_LARGE"));
    return;
  }

  next(error);
}

function sendError(response, error) {
  if (error.retryAfterSeconds) response.set("Retry-After", String(error.retryAfterSeconds));

  response.status(error.status).json({ ok: false, code: error.code, error: error.message });
}

function logFailure(logger, error) {
  if (error.code === "REQUEST_CANCELLED") {
    logger.info?.("[ai] Diagram request cancelled by the client.");
    return;
  }

  const entry = { code: error.code, status: error.status, detail: error.detail };

  if (error.code === "INTERNAL") {
    logger.error?.("[ai] Diagram generation failed unexpectedly.", entry, error.cause);
  } else if (error.status >= 500) {
    logger.error?.("[ai] Diagram generation failed.", entry);
  } else {
    logger.warn?.("[ai] Diagram request rejected.", entry);
  }
}

function getClientKey(request) {
  return request.ip ?? request.socket?.remoteAddress ?? "unknown";
}

module.exports = {
  createAiRouter,
  handleAiRequestError,
};
