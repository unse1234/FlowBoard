import { useRef } from "react";
import {
  ArrowRight,
  Circle,
  Diamond,
  Eraser,
  ImagePlus,
  Lock,
  Minus,
  MousePointer2,
  Pencil,
  Square,
  Type,
  Unlock,
  Zap,
} from "lucide-react";
import { TOOLS } from "../constants/tools.js";
import { Divider, IconButton } from "./ui/index.js";

const ICON_SIZE = 17;

/**
 * The drawing tools, in the order the design shows them. `opensFile` marks the
 * image tool, which must pick a file before it becomes the active tool.
 */
const TOOL_BUTTONS = [
  { id: TOOLS.SELECT, title: "Select", shortcut: "V", Icon: MousePointer2 },
  { id: TOOLS.RECT, title: "Rectangle", shortcut: "R", Icon: Square },
  { id: TOOLS.CIRCLE, title: "Ellipse", shortcut: "O", Icon: Circle },
  { id: TOOLS.DIAMOND, title: "Diamond", shortcut: "D", Icon: Diamond },
  { id: TOOLS.LINE, title: "Line", shortcut: "L", Icon: Minus },
  { id: TOOLS.ARROW, title: "Arrow", shortcut: "A", Icon: ArrowRight },
  { id: TOOLS.PEN, title: "Draw", shortcut: "P", Icon: Pencil },
  { id: TOOLS.TEXT, title: "Text", shortcut: "T", Icon: Type },
  { id: TOOLS.IMAGE, title: "Image", Icon: ImagePlus, opensFile: true },
  { id: TOOLS.LASER, title: "Laser pointer", shortcut: "K", Icon: Zap },
  { id: TOOLS.ERASER, title: "Eraser", shortcut: "E", Icon: Eraser },
];

/**
 * Toolbar — the floating tool strip.
 *
 * Desktop: a horizontal pill centred at the top of the canvas.
 * Mobile: the same strip is not shown here at all — the mobile design puts
 * tools in a bottom sheet (see ToolsSheet), with an optional floating vertical
 * strip on the right for the compact variant.
 *
 * @param {'horizontal'|'vertical'} orientation
 */
export default function Toolbar({
  tool,
  setTool,
  toolLocked,
  setToolLocked,
  pendingImageAsset,
  onImageFileSelected,
  orientation = "horizontal",
  className = "",
}) {
  const fileInputRef = useRef(null);
  const isVertical = orientation === "vertical";

  const handleToolClick = (button) => {
    if (button.opensFile) {
      fileInputRef.current?.click();
      return;
    }
    setTool(button.id);
  };

  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      aria-orientation={isVertical ? "vertical" : "horizontal"}
      className={[
        "flex items-center gap-0.5 rounded-panel border border-border bg-surface p-1.5 shadow-panel",
        isVertical
          ? "flex-col"
          : "fb-scroll-none max-w-[calc(100vw-1.5rem)] overflow-x-auto",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {TOOL_BUTTONS.map((button) => {
        const Icon = button.Icon;
        const isPendingImage = button.id === TOOLS.IMAGE && pendingImageAsset;

        return (
          <IconButton
            key={button.id}
            size="lg"
            active={tool === button.id}
            title={
              isPendingImage
                ? "Click the canvas to place the image"
                : button.shortcut
                  ? `${button.title} (${button.shortcut})`
                  : button.title
            }
            className={isPendingImage ? "ring-2 ring-brand" : ""}
            onClick={() => handleToolClick(button)}
          >
            <Icon size={ICON_SIZE} strokeWidth={2} />
          </IconButton>
        );
      })}

      <Divider
        vertical={!isVertical}
        className={isVertical ? "my-1 w-6" : "mx-1"}
      />

      <IconButton
        size="lg"
        active={toolLocked}
        title={
          toolLocked
            ? "Tool stays active after drawing"
            : "Switch back to Select after drawing"
        }
        onClick={() => setToolLocked((locked) => !locked)}
      >
        {toolLocked ? (
          <Lock size={ICON_SIZE} strokeWidth={2} />
        ) : (
          <Unlock size={ICON_SIZE} strokeWidth={2} />
        )}
      </IconButton>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const [file] = event.target.files ?? [];
          if (file) onImageFileSelected(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}
