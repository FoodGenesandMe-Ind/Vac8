import type { DropTarget, PlanZone } from "./dnd-types";

type Props = {
  zone: PlanZone;
  index: number;
  dropTarget: DropTarget | null;
  onDragOver: (zone: PlanZone, index: number) => void;
  onDrop: (zone: PlanZone, index: number) => void;
  large?: boolean;
};

export function DropGap({ zone, index, dropTarget, onDragOver, onDrop, large }: Props) {
  const active = dropTarget?.zone === zone && dropTarget.index === index;

  return (
    <li
      className="list-none"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDragOver(zone, index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop(zone, index);
      }}
    >
      <div
        className={`rounded transition-all duration-200 ease-out overflow-hidden ${
          active
            ? "drop-gap-active border-2 border-dashed border-accent bg-accent/20"
            : "h-1 border-2 border-transparent bg-transparent"
        } ${large && !active ? "h-8 border-dashed border-border/40" : ""}`}
        aria-hidden
      />
    </li>
  );
}
