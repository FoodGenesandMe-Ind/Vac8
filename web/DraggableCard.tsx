import { useState, type ReactNode } from "react";

type Props = {
  displayNum: number;
  children: ReactNode;
  onReorder: (fromIndex: number, toIndex: number) => void;
  index: number;
};

export function DraggableCard({ displayNum, children, onReorder, index }: Props) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(index));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const from = Number(e.dataTransfer.getData("text/plain"));
        if (!Number.isNaN(from) && from !== index) {
          onReorder(from, index);
        }
      }}
      className={`p-3 rounded bg-surface border text-sm transition-colors ${
        dragOver ? "border-accent/60 bg-panel" : "border-border"
      }`}
    >
      <div className="flex gap-2 items-start">
        <div
          className="shrink-0 flex flex-col items-center gap-0.5 pt-0.5 cursor-grab active:cursor-grabbing text-muted hover:text-gray-300"
          title="Drag to reorder"
          aria-label="Drag to reorder"
        >
          <span className="text-[10px] font-semibold text-accent w-5 text-center">#{displayNum}</span>
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
