import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildBoardContext } from "../../domain/diagram/boardContext.js";
import { estimateTextWidth } from "../../domain/diagram/diagramLayout.js";
import { createDiagramShapes, getDiagramPlacement } from "../../domain/diagram/diagramShapes.js";
import { boundsContain } from "../../domain/geometry/bounds.js";
import { getVisibleWorldBounds } from "../../domain/geometry/viewport.js";
import { createClientId } from "../shared/id/createClientId.js";
import { AI_PROMPT_MAX_LENGTH, AiRequestError, requestDiagram } from "./aiClient.js";

const MESSAGES = Object.freeze({
  PROMPT_REQUIRED: "Describe the diagram you want to create.",
  PROMPT_TOO_LONG: `Keep the description under ${AI_PROMPT_MAX_LENGTH.toLocaleString()} characters.`,
  UNDRAWABLE: "The AI returned a diagram FlowBoard couldn't draw. Try again.",
  INSERT_FAILED: "Couldn't add the diagram to the board. Try again.",
});

let measureContext = null;

/** Measure text the way Konva will draw it, or estimate where there is no canvas. */
function measureText(text, font) {
  measureContext ??= globalThis.document?.createElement("canvas").getContext("2d") ?? null;
  if (!measureContext) return estimateTextWidth(text, font);

  measureContext.font = `normal normal ${font.fontSize}px ${font.fontFamily}`;
  return measureContext.measureText(text).width;
}

/** Only the look of the drawing carries over from the active tool style. */
function pickStyle(activeStyle) {
  return { renderStyle: activeStyle?.renderStyle, fontFamily: activeStyle?.fontFamily };
}

function createPreviewIds() {
  let count = 0;
  return () => `preview_${++count}`;
}

/**
 * The AI diagram workflow: describe, generate, preview, insert.
 *
 * Generating is an HTTP request to FlowBoard's server and never touches the
 * board. Only `insert` does, through insertShapes — the path paste takes — so
 * the whole diagram is one undo step and one CREATE_SHAPES operation to
 * collaborators, and nothing reaches the board or anyone else until the user
 * chooses to add it.
 *
 * @param {Object} options
 * @param {() => Object[]} options.getShapes
 * @param {(shapes: Object[]) => boolean} options.insertShapes
 * @param {(bounds: Object, options?: { maxScale?: number }) => void} options.frameBounds
 * @param {{ x: number, y: number, scale: number }} options.transform
 * @param {{ width: number, height: number }} options.viewportSize
 * @param {Object} options.activeStyle
 * @param {(outcome: { ok: true, result: Object } | { ok: false, message: string }) => void} [options.onFinish]
 *   called when a generation succeeds or fails, but not when it is cancelled
 */
export function useAiDiagram({
  getShapes,
  insertShapes,
  frameBounds,
  transform,
  viewportSize,
  activeStyle,
  onFinish,
}) {
  const [prompt, setPrompt] = useState("");
  const [useBoardContext, setUseBoardContext] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);

  const requestRef = useRef(null);

  // Read when a generation finishes or a diagram is inserted — the view and
  // style at that moment, not at the moment the request started.
  const latestRef = useRef({ transform, viewportSize, activeStyle, onFinish });
  useEffect(() => {
    latestRef.current = { transform, viewportSize, activeStyle, onFinish };
  });

  useEffect(() => () => requestRef.current?.abort(), []);

  const generate = useCallback(async () => {
    // One generation at a time.
    if (requestRef.current) return;

    const description = prompt.trim();
    if (!description) {
      setError(MESSAGES.PROMPT_REQUIRED);
      return;
    }
    if (Array.from(description).length > AI_PROMPT_MAX_LENGTH) {
      setError(MESSAGES.PROMPT_TOO_LONG);
      return;
    }

    const controller = new AbortController();
    requestRef.current = controller;
    setGenerating(true);
    setError(null);

    try {
      const board = useBoardContext ? buildBoardContext(getShapes()) : undefined;
      const diagram = await requestDiagram({
        prompt: description,
        board,
        signal: controller.signal,
      });

      const result = createDiagramShapes(diagram, {
        createShapeId: createPreviewIds(),
        createGroupId: createPreviewIds(),
        measureText,
        style: pickStyle(latestRef.current.activeStyle),
      });

      setPreview({ diagram, ...result });
      latestRef.current.onFinish?.({ ok: true, result });
    } catch (caught) {
      if (caught instanceof AiRequestError && caught.code === "CANCELLED") return;

      let message = MESSAGES.UNDRAWABLE;
      if (caught instanceof AiRequestError) {
        message = caught.message;
      } else {
        console.error("[ai] The generated diagram could not be drawn.", caught);
      }

      setError(message);
      latestRef.current.onFinish?.({ ok: false, message });
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      setGenerating(false);
    }
  }, [getShapes, prompt, useBoardContext]);

  const cancel = useCallback(() => {
    requestRef.current?.abort();
  }, []);

  const discard = useCallback(() => {
    setPreview(null);
    setError(null);
  }, []);

  /**
   * Add the previewed diagram to the board: in view if there is room, beside
   * existing work if not, and brought into view if it landed outside it.
   *
   * @returns {Object | null} what was inserted, or null if it could not be
   */
  const insert = useCallback(() => {
    if (!preview) return null;

    const { transform: view, viewportSize: size, activeStyle: style } = latestRef.current;

    try {
      const visible = getVisibleWorldBounds(view, size);
      const result = createDiagramShapes(preview.diagram, {
        origin: getDiagramPlacement(preview.bounds, visible, getShapes()),
        createShapeId: () => createClientId("shape"),
        createGroupId: () => createClientId("grp"),
        measureText,
        style: pickStyle(style),
      });

      if (!insertShapes(result.shapes)) throw new Error("No shapes were inserted.");
      if (!boundsContain(visible, result.bounds)) {
        frameBounds(result.bounds, { maxScale: view.scale });
      }

      setPreview(null);
      setError(null);
      return result;
    } catch (caught) {
      console.error("[ai] Diagram insertion failed.", caught);
      setError(MESSAGES.INSERT_FAILED);
      return null;
    }
  }, [frameBounds, getShapes, insertShapes, preview]);

  return useMemo(
    () => ({
      prompt,
      setPrompt,
      maxPromptLength: AI_PROMPT_MAX_LENGTH,
      useBoardContext,
      setUseBoardContext,
      generating,
      error,
      preview,
      generate,
      cancel,
      discard,
      insert,
    }),
    [cancel, discard, error, generate, generating, insert, preview, prompt, useBoardContext],
  );
}
