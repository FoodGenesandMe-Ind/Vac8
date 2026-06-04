import type { DragPayload, DropTarget, PlanZone } from "./dnd-types";
import type { ReactNode } from "react";

type Props = {
  zone: PlanZone;
  displayNum: number;
  index: number;
  itemId: string;
  children: ReactNode;
  dragPayload: DragPayload | null;
  dropTarget: DropTarget | null;
  onDragStart: (payload: DragPayload) => void;
  onDragEnd: () => void;
  onDragOverCard: (zone: PlanZone, index: number, clientY: number, rect: DOMRect) => void;
};

export function PlanCard({
  zone,
  displayNum,
  index,
  itemId,
  children,
  dragPayload,
  dropTarget,
  onDragStart,
  onDragEnd,
  onDragOverCard,
}: Props) {
  const isDragging = dragPayload?.itemId === itemId;
  const isHoverTarget =
    dropTarget?.zone === zone &&
    (dropTarget.index === index || dropTarget.index === index + 1);

  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(
          "application/x-vac8-card",
          JSON.stringify({ zone, index, itemId })
        );
        e.dataTransfer.effectAllowed = "move";
        onDragStart({ zone, index, itemId });
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        onDragOverCard(zone, index, e.clientY, rect);
      }}
      className={`p-3 rounded bg-surface border text-sm transition-colors duration-150 ${
        isDragging ? "opacity-40 scale-[0.98]" : ""
      } ${
        isHoverTarget ? "border-accent/60 bg-panel" : "border-border"
      }`}
    >
      <div className="flex gap-2 items-start">
        <div
          className="shrink-0 flex flex-col items-center gap-0.5 pt-0.5 cursor-grab active:cursor-grabbing text-muted hover:text-gray-300"
          title="Drag to reorder or drop into the other section"
          aria-label="Drag card"
        >
          <span className="text-[10px] font-semibold text-accent w-5 text-center">
            {zone === "working" ? `W#${displayNum}` : `#${displayNum}`}
          </span>
          <span className="flex flex-col gap-0.5 opacity-60">
            <span className="block w-3 h-0.5 bg-current rounded-full" />
            <span className="block w-3 h-0.5 bg-current rounded-full" />
            <span className="block w-3 h-0.5 bg-current rounded-full" />
          </span>
        </div>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </li>
  );
}
