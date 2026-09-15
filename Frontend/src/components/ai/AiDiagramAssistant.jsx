import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useAiDiagram } from "../../features/ai/useAiDiagram.js";
import { useToast } from "../../features/toasts/toastContext.js";
import { IconButton, Island, Popover, Sheet, Spinner, cx } from "../ui/index.js";
import AiDiagramPanel from "./AiDiagramPanel.jsx";

const TOAST_ID = "ai-diagram";

function describeResult({ title, nodeCount, edgeCount }) {
  const counts = `${nodeCount} ${nodeCount === 1 ? "node" : "nodes"}, ${edgeCount} ${
    edgeCount === 1 ? "connection" : "connections"
  }`;

  return title ? `${title} · ${counts}` : counts;
}

/**
 * AiDiagramAssistant — turn a description into a diagram on the board.
 *
 * On tablet and desktop a sparkle button sits beside the tool dock and opens
 * the panel as a popover above it. Phones have no room there, so the board
 * menu opens the panel as a sheet instead.
 *
 * The workflow's state lives here rather than in BoardPage, so typing a
 * description re-renders this component and not the board, and rather than in
 * the panel, so closing the panel keeps the draft and preview while a
 * generation finishes in the background — a toast then offers the result.
 *
 * @param {'popover'|'sheet'} presentation
 */
function AiDiagramAssistant({
  presentation,
  touch = false,
  open: sheetOpen = false,
  onOpen,
  onClose,
  hasShapes,
  getShapes,
  insertShapes,
  frameBounds,
  transform,
  viewportSize,
  activeStyle,
  onUndo,
}) {
  const { toast } = useToast();
  const triggerRef = useRef(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const isSheet = presentation === "sheet";
  const open = isSheet ? sheetOpen : popoverOpen;

  const openPanel = useCallback(() => {
    if (isSheet) onOpen?.();
    else setPopoverOpen(true);
  }, [isSheet, onOpen]);

  const closePanel = useCallback(() => {
    if (isSheet) onClose?.();
    else setPopoverOpen(false);
  }, [isSheet, onClose]);

  // Read when a generation finishes, which can be long after it started.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const handleFinish = useCallback(
    (outcome) => {
      if (openRef.current) return;

      toast(
        outcome.ok
          ? {
              id: TOAST_ID,
              tone: "info",
              title: "Diagram ready",
              description: describeResult(outcome.result),
              duration: 10000,
              action: { label: "Review", onClick: openPanel },
            }
          : {
              id: TOAST_ID,
              tone: "danger",
              title: "Couldn't generate the diagram",
              description: outcome.message,
              duration: 8000,
              action: { label: "Open", onClick: openPanel },
            },
      );
    },
    [openPanel, toast],
  );

  const ai = useAiDiagram({
    getShapes,
    insertShapes,
    frameBounds,
    transform,
    viewportSize,
    activeStyle,
    onFinish: handleFinish,
  });

  const { insert } = ai;
  const handleInsert = useCallback(() => {
    const inserted = insert();
    if (!inserted) return;

    closePanel();
    toast({
      id: TOAST_ID,
      tone: "success",
      title: "Diagram added",
      description: describeResult(inserted),
      duration: 6000,
      action: { label: "Undo", onClick: onUndo },
    });
  }, [closePanel, insert, onUndo, toast]);

  const panel = (
    <AiDiagramPanel
      ai={ai}
      hasShapes={hasShapes}
      touch={touch}
      showTitle={!isSheet}
      onInsert={handleInsert}
    />
  );

  if (isSheet) {
    return (
      <Sheet
        open={sheetOpen}
        onClose={onClose}
        title="Generate a diagram"
        description="Describe it, then add it as shapes you can edit."
      >
        {panel}
      </Sheet>
    );
  }

  const iconSize = touch ? 20 : 18;

  return (
    <>
      <Island className={cx("flex items-center", touch ? "rounded-xl p-0.5" : "p-1")}>
        <IconButton
          ref={triggerRef}
          label="Generate diagram with AI"
          tooltip={ai.generating ? "Generating diagram…" : "Generate diagram with AI"}
          size={touch ? "xl" : "lg"}
          tone="soft"
          active={popoverOpen}
          aria-haspopup="dialog"
          aria-expanded={popoverOpen}
          onClick={() => setPopoverOpen((current) => !current)}
        >
          {ai.generating ? (
            <Spinner size={iconSize} />
          ) : (
            <Sparkles size={iconSize} strokeWidth={1.75} />
          )}
        </IconButton>
      </Island>

      <Popover
        open={popoverOpen}
        onClose={closePanel}
        anchorRef={triggerRef}
        placement="top-end"
        offset={10}
        label="Generate a diagram"
        className="fb-scroll max-h-[min(80dvh,640px)] w-96 max-w-[calc(100vw-1rem)] overflow-y-auto p-4"
      >
        {panel}
      </Popover>
    </>
  );
}

export default memo(AiDiagramAssistant);
