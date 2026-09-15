const { AiError } = require("./aiErrors");
const { buildDiagramPrompt, DIAGRAM_SYSTEM_INSTRUCTION } = require("./diagramPrompt");
const { parseDiagramRequest } = require("./diagramRequest");
const { DIAGRAM_RESPONSE_SCHEMA, validateDiagram } = require("./diagramSchema");

/**
 * Natural language in, a validated diagram out.
 *
 * This is all the HTTP layer calls. It checks the request, asks the provider
 * for structured output, and returns nothing validateDiagram has not accepted,
 * so no model output reaches a client unchecked.
 *
 * @param {Object} dependencies
 * @param {{ name: string, model: string, generateJson: Function }} dependencies.provider
 * @param {Pick<Console, "info">} [dependencies.logger]
 */
function createDiagramService({ provider, logger = console }) {
  /**
   * @param {{ prompt: unknown, board?: unknown, signal?: AbortSignal }} request
   * @returns {Promise<{ title: string, direction: string, nodes: object[], edges: object[] }>}
   * @throws {AiError}
   */
  async function generateDiagram({ prompt, board, signal } = {}) {
    const request = parseDiagramRequest({ prompt, board });
    const startedAt = Date.now();

    const { text } = await provider.generateJson({
      systemInstruction: DIAGRAM_SYSTEM_INSTRUCTION,
      prompt: buildDiagramPrompt(request),
      schema: DIAGRAM_RESPONSE_SCHEMA,
      signal,
    });

    const validation = validateDiagram(parseJson(text));
    if (!validation.valid) {
      throw new AiError(validation.code, { detail: validation.reason });
    }

    logger.info?.("[ai] Diagram generated.", {
      provider: provider.name,
      model: provider.model,
      nodes: validation.diagram.nodes.length,
      edges: validation.diagram.edges.length,
      droppedEdges: validation.droppedEdges,
      withBoardContext: Boolean(request.board),
      durationMs: Date.now() - startedAt,
    });

    return validation.diagram;
  }

  return { generateDiagram };
}

/** Parse the model's reply, tolerating a stray Markdown fence around the JSON. */
function parseJson(text) {
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(unfenced);
  } catch (error) {
    throw new AiError("AI_INVALID_RESPONSE", {
      detail: `Response was not valid JSON: ${error.message}`,
    });
  }
}

module.exports = {
  createDiagramService,
};
