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
import { useThemeContext } from "../features/theme/ThemeProvider.jsx";
import { TOOLS } from "../constants/tools.js";

const ICON_SIZE = 18;

const TOOL_BUTTONS = [
  { id: TOOLS.SELECT, title: "Select", Icon: MousePointer2 },
  { id: TOOLS.RECT, title: "Rectangle", Icon: Square },
  { id: TOOLS.CIRCLE, title: "Ellipse", Icon: Circle },
  { id: TOOLS.DIAMOND, title: "Diamond", Icon: Diamond },
  { id: TOOLS.LINE, title: "Line", Icon: Minus },
  { id: TOOLS.ARROW, title: "Arrow", Icon: ArrowRight },
  { id: TOOLS.PEN, title: "Pen", Icon: Pencil },
  { id: TOOLS.TEXT, title: "Text", Icon: Type },
  { id: TOOLS.IMAGE, title: "Image", Icon: ImagePlus, opensFile: true },
  { id: TOOLS.LASER, title: "Laser", Icon: Zap },
  { id: TOOLS.ERASER, title: "Eraser", Icon: Eraser },
];

export default function Toolbar({
  tool,
  setTool,
  toolLocked,
  setToolLocked,
  pendingImageAsset,
  onImageFileSelected,
}) {
  const { isDark } = useThemeContext();
  const fileInputRef = useRef(null);

  const handleToolClick = (button) => {
    if (button.opensFile) {
      fileInputRef.current?.click();
      return;
    }

    setTool(button.id);
  };

  const toolbarBase = isDark
    ? "border-slate-700 bg-slate-900 text-slate-100"
    : "border-gray-200 bg-white text-slate-950";

  const inactiveButtonBase = isDark
    ? "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
    : "border-gray-100 bg-gray-100 text-gray-800 hover:bg-gray-200";

  const getButtonClasses = (isActive) => {
    if (isActive) {
      return isDark ? "bg-slate-700 text-white" : "bg-gray-950 text-white";
    }

    return isDark
      ? "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
      : "border-gray-100 bg-gray-100 text-gray-800 hover:bg-gray-200";
  };

  return (
    <div
      className={`fixed top-3 right-1/2 z-50 flex translate-x-1/2 items-center gap-1 rounded-lg p-1.5 shadow-lg ${toolbarBase}`}
    >
      {TOOL_BUTTONS.map((button) => {
        const Icon = button.Icon;
        const isActive = tool === button.id;
        const isPendingImage = button.id === TOOLS.IMAGE && pendingImageAsset;

        return (
          <button
            key={button.id}
            type="button"
            onClick={() => handleToolClick(button)}
            title={
              isPendingImage ? "Click canvas to place image" : button.title
            }
            aria-label={button.title}
            className={`grid h-9 w-9 place-items-center rounded-md transition ${getButtonClasses(isActive)} ${isPendingImage ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}
          >
            <Icon size={ICON_SIZE} strokeWidth={2} />
          </button>
        );
      })}

      <div className="mx-1 h-6 w-px bg-gray-200 dark:bg-slate-700" />

      <button
        type="button"
        onClick={() => setToolLocked((prev) => !prev)}
        className={`grid h-9 w-9 place-items-center rounded-md transition ${
          toolLocked
            ? isDark
              ? "bg-slate-700 text-white"
              : "bg-gray-950 text-white"
            : inactiveButtonBase
        }`}
        title={
          toolLocked
            ? "Keep tool active after drawing"
            : "Switch to select after drawing"
        }
        aria-label="Toggle tool lock"
      >
        {toolLocked ? (
          <Lock size={ICON_SIZE} strokeWidth={2} />
        ) : (
          <Unlock size={ICON_SIZE} strokeWidth={2} />
        )}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const [file] = e.target.files ?? [];
          if (file) onImageFileSelected(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
