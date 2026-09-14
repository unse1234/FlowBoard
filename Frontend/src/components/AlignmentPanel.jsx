import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
} from "lucide-react";
import { ALIGNMENTS, AXES } from "../domain/geometry/alignment.js";
import { IconButton, SectionLabel } from "./ui/index.js";

const ICON_SIZE = 15;

const ALIGN_BUTTONS = [
  { id: ALIGNMENTS.LEFT, title: "Align left", Icon: AlignStartVertical },
  { id: ALIGNMENTS.CENTER_X, title: "Align centre", Icon: AlignCenterVertical },
  { id: ALIGNMENTS.RIGHT, title: "Align right", Icon: AlignEndVertical },
  { id: ALIGNMENTS.TOP, title: "Align top", Icon: AlignStartHorizontal },
  { id: ALIGNMENTS.CENTER_Y, title: "Align middle", Icon: AlignCenterHorizontal },
  { id: ALIGNMENTS.BOTTOM, title: "Align bottom", Icon: AlignEndHorizontal },
];

/**
 * Align and distribute controls.
 *
 * Only rendered with more than one shape selected — aligning a single shape has
 * nothing to align it to, so the whole section is absent rather than disabled.
 * Distribute additionally needs three, since the outer two define the span.
 */
export default function AlignmentPanel({ alignmentActions }) {
  if (!alignmentActions?.canAlign) return null;

  return (
    <section className="space-y-2">
      <SectionLabel>Align</SectionLabel>

      <div className="grid grid-cols-6 gap-1.5">
        {ALIGN_BUTTONS.map((button) => {
          const Icon = button.Icon;

          return (
            <IconButton
              key={button.id}
              title={button.title}
              onClick={() => alignmentActions.align(button.id)}
            >
              <Icon size={ICON_SIZE} />
            </IconButton>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <IconButton
          title={
            alignmentActions.canDistribute
              ? "Distribute horizontally"
              : "Distribute horizontally — needs three shapes"
          }
          disabled={!alignmentActions.canDistribute}
          onClick={() => alignmentActions.distribute(AXES.HORIZONTAL)}
        >
          <AlignHorizontalDistributeCenter size={ICON_SIZE} />
        </IconButton>
        <IconButton
          title={
            alignmentActions.canDistribute
              ? "Distribute vertically"
              : "Distribute vertically — needs three shapes"
          }
          disabled={!alignmentActions.canDistribute}
          onClick={() => alignmentActions.distribute(AXES.VERTICAL)}
        >
          <AlignVerticalDistributeCenter size={ICON_SIZE} />
        </IconButton>
      </div>
    </section>
  );
}
