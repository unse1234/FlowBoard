import { Redo2, Undo2 } from "lucide-react";

const ICON_SIZE = 16;

export default function ZoomControls({ scale, onUndo, onRedo }) {
  return (
    <div className="fixed bottom-3 left-3 z-50 flex items-center gap-1 rounded-md bg-gray-950/80 px-2 py-2 text-sm text-white">
      <div className="min-w-12 px-1 font-syne-mono text-xs">
        {Math.round(scale * 100)}%
      </div>
      <button
        type="button"
        onClick={onUndo}
        className="grid h-8 w-8 place-items-center rounded bg-white/10 text-white hover:bg-white/20"
        title="Undo"
        aria-label="Undo"
      >
        <Undo2 size={ICON_SIZE} />
      </button>
      <button
        type="button"
        onClick={onRedo}
        className="grid h-8 w-8 place-items-center rounded bg-white/10 text-white hover:bg-white/20"
        title="Redo"
        aria-label="Redo"
      >
        <Redo2 size={ICON_SIZE} />
      </button>
    </div>
  );
}
