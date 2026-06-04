export type PlanZone = "working" | "suggestions";

export type DragPayload = {
  zone: PlanZone;
  index: number;
  itemId: string;
};

export type DropTarget = {
  zone: PlanZone;
  index: number;
};

export function reorderList<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
