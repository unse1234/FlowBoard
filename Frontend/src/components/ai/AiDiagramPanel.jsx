import { useId } from "react";
import { ArrowLeft, CircleAlert, RotateCcw, Sparkles, SquarePlus } from "lucide-react";
import { Button, Toggle, cx } from "../ui/index.js";
import DiagramPreview from "./DiagramPreview.jsx";

const ICON = { size: 15, strokeWidth: 1.75 };

const EXAMPLES = [
  {
    label: "Login flow",
    prompt: "Create a login flow with credential validation, JWT generation, and a dashboard.",
  },
  {
    label: "MERN architecture",
    prompt:
      "Design a MERN stack architecture with a React client, an Express API on Node.js, and MongoDB.",
  },
  {
    label: "E-commerce system",
    prompt:
      "Create an e-commerce system diagram with storefront, cart, checkout, payments, orders, and inventory.",
  },
  {
    label: "CI/CD pipeline",
    prompt: "Draw a CI/CD pipeline from commit through build, test, and staging to production.",
  },
];

/**
 * AiDiagramPanel — describe a diagram, check the preview, add it to the board.
 *
 * Two steps on one surface. First the description, with starting points;
 * then a preview of exactly the shapes that will be added, with Insert as the
 * single primary action. Nothing touches the board before Insert.
 */
export default function AiDiagramPanel({ ai, hasShapes, onInsert, showTitle = true, touch = false }) {
  const buttonSize = touch ? "lg" : "md";

  if (ai.preview) {
    return (
      <PreviewStep ai={ai} buttonSize={buttonSize} showTitle={showTitle} onInsert={onInsert} />
    );
  }

  return <PromptStep ai={ai} buttonSize={buttonSize} hasShapes={hasShapes} showTitle={showTitle} touch={touch} />;
}

function PromptStep({ ai, buttonSize, hasShapes, showTitle, touch }) {
  const promptId = useId();
  const hintId = useId();
  const { prompt, setPrompt, maxPromptLength, generating, error } = ai;
  const length = prompt.length;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        ai.generate();
      }}
    >
      {showTitle ? <PanelTitle /> : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={promptId} className="sr-only">
          Describe your diagram
        </label>
        <textarea
          id={promptId}
          value={prompt}
          maxLength={maxPromptLength}
          rows={touch ? 4 : 3}
          placeholder="Describe what you want to draw…"
          aria-describedby={hintId}
          aria-invalid={error ? true : undefined}
          readOnly={generating}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;

            event.preventDefault();
            ai.generate();
          }}
          className={cx(
            "fb-scroll w-full resize-none rounded-md border border-border bg-surface-muted px-2.5 py-2",
            "text-text placeholder:text-text-soft read-only:text-text-muted",
            // Below 16px, iOS zooms the page when a field is focused.
            touch ? "text-[16px] leading-6" : "text-body",
          )}
        />
        <div
          id={hintId}
          className="flex min-h-3.5 items-center justify-between gap-2 text-caption font-normal text-text-muted"
        >
          <span>{touch ? null : "Enter to generate · Shift+Enter for a new line"}</span>
          {length > maxPromptLength * 0.8 ? (
            <span className="tabular-nums">
              {length.toLocaleString()} / {maxPromptLength.toLocaleString()}
            </span>
          ) : null}
        </div>
      </div>

      <div role="group" aria-label="Examples" className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((example) => (
          <button
            key={example.label}
            type="button"
            disabled={generating}
            onClick={() => setPrompt(example.prompt)}
            className={cx(
              "rounded-full border border-border px-2.5 text-label text-text-muted",
              "transition-colors duration-150 hover:bg-hover hover:text-text active:bg-pressed",
              "disabled:pointer-events-none disabled:opacity-45",
              touch ? "h-9" : "h-7",
            )}
          >
            {example.label}
          </button>
        ))}
      </div>

      {hasShapes ? (
        <label className="flex items-center justify-between gap-3 text-label font-normal text-text-muted">
          Use shapes on this board as context
          <Toggle
            checked={ai.useBoardContext}
            onChange={ai.setUseBoardContext}
            disabled={generating}
            label="Use shapes on this board as context"
          />
        </label>
      ) : null}

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      <div className="flex gap-2">
        <Button
          type="submit"
          variant="primary"
          size={buttonSize}
          className="flex-1"
          loading={generating}
        >
          {generating ? (
            "Generating diagram…"
          ) : (
            <>
              <Sparkles {...ICON} aria-hidden="true" />
              Generate diagram
            </>
          )}
        </Button>
        {generating ? (
          <Button size={buttonSize} onClick={ai.cancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function PreviewStep({ ai, buttonSize, showTitle, onInsert }) {
  const { preview, generating, error } = ai;
  const { title, nodeCount, edgeCount, shapes, bounds } = preview;

  return (
    <div className="flex flex-col gap-3">
      {showTitle ? <PanelTitle /> : null}

      <DiagramPreview shapes={shapes} bounds={bounds} title={title} />

      <div className="min-w-0">
        <p className="truncate text-body font-medium text-text">{title || "Generated diagram"}</p>
        <p className="text-label font-normal tabular-nums text-text-muted">
          {nodeCount} {nodeCount === 1 ? "node" : "nodes"} · {edgeCount}{" "}
          {edgeCount === 1 ? "connection" : "connections"} · editable shapes
        </p>
      </div>

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      <Button
        variant="primary"
        size={buttonSize}
        fullWidth
        disabled={generating}
        onClick={onInsert}
      >
        <SquarePlus {...ICON} aria-hidden="true" />
        Insert into board
      </Button>

      <div className="flex gap-2">
        <Button size={buttonSize} className="flex-1" loading={generating} onClick={ai.generate}>
          {generating ? (
            "Regenerating…"
          ) : (
            <>
              <RotateCcw {...ICON} aria-hidden="true" />
              Regenerate
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          size={buttonSize}
          className="flex-1"
          disabled={generating}
          onClick={ai.discard}
        >
          <ArrowLeft {...ICON} aria-hidden="true" />
          Edit description
        </Button>
      </div>
    </div>
  );
}

function PanelTitle() {
  return (
    <div>
      <h2 className="flex items-center gap-1.5 text-title text-text">
        <Sparkles size={15} strokeWidth={1.75} aria-hidden="true" />
        Generate a diagram
      </h2>
      <p className="mt-0.5 text-label font-normal text-text-muted">
        Describe a flow or a system. FlowBoard draws it as shapes you can edit.
      </p>
    </div>
  );
}

function ErrorMessage({ children }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-md bg-danger-soft px-2.5 py-2 text-label text-danger"
    >
      <CircleAlert size={14} strokeWidth={2} aria-hidden="true" className="mt-px shrink-0" />
      {children}
    </p>
  );
}
