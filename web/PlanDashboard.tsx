import { useCallback, useState } from "react";
import type { VacationPlan } from "./types";
import {
  demoteSuggestion,
  promoteSuggestion,
  reorderSuggestions,
  reorderWorkingPlan,
} from "./vac8-api";
import { DropGap } from "./DropGap";
import { PlanCard } from "./PlanCard";
import type { DragPayload, DropTarget, PlanZone } from "./dnd-types";
import { reorderList } from "./dnd-types";

type Props = {
  plan: VacationPlan | null;
  onPromote: (plan: VacationPlan) => void;
};

function formatUsd(n?: number) {
  if (n == null) return "—";
  return `$${n.toLocaleString()}`;
}

export function PlanDashboard({ plan, onPromote }: Props) {
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const clearDnD = useCallback(() => {
    setDragPayload(null);
    setDropTarget(null);
  }, []);

  if (!plan) {
    return (
      <main className="flex-1 flex items-center justify-center text-muted text-sm p-8 text-center">
        Select or create a Vac8, then tell Agatha about your trip in the chat.
      </main>
    );
  }

  const activeSuggestions = plan.suggestions.filter((s) => !s.promoted);

  const handlePromote = async (suggestionId: string) => {
    const updated = await promoteSuggestion(plan.id, suggestionId);
    onPromote(updated);
  };

  const handleDemote = async (suggestionId: string) => {
    const updated = await demoteSuggestion(plan.id, suggestionId);
    onPromote(updated);
  };

  const handleDragOverGap = (zone: PlanZone, index: number) => {
    setDropTarget({ zone, index });
  };

  const handleDragOverCard = (
    zone: PlanZone,
    index: number,
    clientY: number,
    rect: DOMRect
  ) => {
    const mid = rect.top + rect.height / 2;
    const insertIndex = clientY < mid ? index : index + 1;
    setDropTarget({ zone, index: insertIndex });
  };

  const insertPromotedAt = async (suggestionId: string, toIndex: number) => {
    let updated = await promoteSuggestion(plan.id, suggestionId);
    const fromIdx = updated.workingPlan.findIndex((w) => w.id === suggestionId);
    if (fromIdx >= 0 && fromIdx !== toIndex) {
      const reordered = reorderList(updated.workingPlan, fromIdx, toIndex);
      updated = await reorderWorkingPlan(
        plan.id,
        reordered.map((i) => i.id)
      );
    }
    onPromote(updated);
    clearDnD();
  };

  const insertDemotedAt = async (itemId: string, toIndex: number) => {
    let updated = await demoteSuggestion(plan.id, itemId);
    const active = updated.suggestions.filter((s) => !s.promoted);
    const fromIdx = active.findIndex((s) => s.id === itemId);
    if (fromIdx >= 0 && fromIdx !== toIndex) {
      const reordered = reorderList(active, fromIdx, toIndex);
      updated = await reorderSuggestions(
        plan.id,
        reordered.map((s) => s.id)
      );
    }
    onPromote(updated);
    clearDnD();
  };

  const handleDrop = async (targetZone: PlanZone, targetIndex: number) => {
    if (!dragPayload) return;

    const { zone: sourceZone, index: sourceIndex, itemId } = dragPayload;

    try {
      if (sourceZone === targetZone) {
        if (sourceZone === "working") {
          let to = targetIndex;
          if (to > sourceIndex) to -= 1;
          if (to === sourceIndex) return;
          const reordered = reorderList(plan.workingPlan, sourceIndex, to);
          const updated = await reorderWorkingPlan(
            plan.id,
            reordered.map((i) => i.id)
          );
          onPromote(updated);
        } else {
          let to = targetIndex;
          if (to > sourceIndex) to -= 1;
          if (to === sourceIndex) return;
          const reordered = reorderList(activeSuggestions, sourceIndex, to);
          const updated = await reorderSuggestions(
            plan.id,
            reordered.map((s) => s.id)
          );
          onPromote(updated);
        }
        clearDnD();
        return;
      }

      if (sourceZone === "suggestions" && targetZone === "working") {
        await insertPromotedAt(itemId, targetIndex);
        return;
      }

      if (sourceZone === "working" && targetZone === "suggestions") {
        await insertDemotedAt(itemId, targetIndex);
        return;
      }
    } catch (e) {
      console.error(e);
      clearDnD();
    }
  };

  const workingHighlight =
    dragPayload?.zone === "suggestions" ? "ring-1 ring-accent/30 rounded-lg p-1 -m-1" : "";
  const suggestionsHighlight =
    dragPayload?.zone === "working" ? "ring-1 ring-accent/30 rounded-lg p-1 -m-1" : "";

  return (
    <main className="flex-1 flex flex-col min-w-0 border-r border-border">
      <header className="p-4 border-b border-border">
        <h1 className="text-lg font-semibold">{plan.title}</h1>
        {plan.narrative && (
          <p className="text-xs text-muted mt-1 line-clamp-2">{plan.narrative}</p>
        )}
        <div className="mt-3 flex gap-4 text-sm">
          <span>
            Est. total: <strong className="text-accent">{formatUsd(plan.totals.mid)}</strong>
          </span>
          <span className="text-muted">
            range {formatUsd(plan.totals.low)} – {formatUsd(plan.totals.high)}
          </span>
        </div>
        <p className="text-xs text-muted mt-2">
          Drag cards between sections to promote/demote, or use # / W# with Agatha.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <section className={workingHighlight}>
          <h2 className="text-xs uppercase tracking-wide text-muted mb-2">Working plan</h2>
          <ul className="space-y-0" onDragLeave={() => setDropTarget(null)}>
            <DropGap
              zone="working"
              index={0}
              dropTarget={dropTarget}
              onDragOver={handleDragOverGap}
              onDrop={handleDrop}
              large={plan.workingPlan.length === 0}
            />
            {plan.workingPlan.map((item, index) => (
              <div key={item.id}>
                <PlanCard
                  zone="working"
                  displayNum={index + 1}
                  index={index}
                  itemId={item.id}
                  dragPayload={dragPayload}
                  dropTarget={dropTarget}
                  onDragStart={setDragPayload}
                  onDragEnd={clearDnD}
                  onDragOverCard={handleDragOverCard}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <span className="font-medium">{item.title}</span>
                      <span className="text-muted shrink-0 ml-2">
                        {formatUsd(item.estimatedUsd)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDemote(item.id)}
                      className="shrink-0 px-2 py-1 text-xs rounded border border-border text-muted hover:text-gray-200 hover:bg-panel"
                    >
                      Demote
                    </button>
                  </div>
                  {item.description && (
                    <p className="text-muted mt-1 text-xs">{item.description}</p>
                  )}
                  {item.location && (
                    <p className="text-xs text-muted mt-0.5">{item.location}</p>
                  )}
                </PlanCard>
                <DropGap
                  zone="working"
                  index={index + 1}
                  dropTarget={dropTarget}
                  onDragOver={handleDragOverGap}
                  onDrop={handleDrop}
                />
              </div>
            ))}
          </ul>
        </section>

        {plan.priceWatches.length > 0 && (
          <section>
            <h2 className="text-xs uppercase tracking-wide text-muted mb-2">Price watches</h2>
            <ul className="space-y-2">
              {plan.priceWatches.map((w, index) => (
                <li
                  key={w.id}
                  className="p-2 rounded bg-surface border border-border text-xs"
                >
                  <span className="text-accent font-semibold mr-2">#{index + 1}</span>
                  <span className="font-medium">{w.label}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={suggestionsHighlight}>
          <h2 className="text-xs uppercase tracking-wide text-muted mb-2">Suggestions</h2>
          {activeSuggestions.length === 0 ? (
            dragPayload?.zone === "working" ? (
              <ul className="space-y-0">
                <DropGap
                  zone="suggestions"
                  index={0}
                  dropTarget={dropTarget}
                  onDragOver={handleDragOverGap}
                  onDrop={handleDrop}
                  large
                />
              </ul>
            ) : (
              <p className="text-sm text-muted">Agatha will add suggestions as you chat.</p>
            )
          ) : (
            <ul className="space-y-0">
              <DropGap
                zone="suggestions"
                index={0}
                dropTarget={dropTarget}
                onDragOver={handleDragOverGap}
                onDrop={handleDrop}
              />
              {activeSuggestions.map((s, index) => (
                <div key={s.id}>
                  <PlanCard
                    zone="suggestions"
                    displayNum={index + 1}
                    index={index}
                    itemId={s.id}
                    dragPayload={dragPayload}
                    dropTarget={dropTarget}
                    onDragStart={setDragPayload}
                    onDragEnd={clearDnD}
                    onDragOverCard={handleDragOverCard}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className="font-medium">{s.title}</span>
                        <span className="ml-2 text-xs text-muted uppercase">{s.type}</span>
                        {s.description && (
                          <p className="text-muted mt-1 text-xs">{s.description}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePromote(s.id)}
                        className="shrink-0 px-2 py-1 text-xs rounded bg-accent/20 text-accent hover:bg-accent/30"
                      >
                        Promote
                      </button>
                    </div>
                    {s.estimatedUsd != null && (
                      <p className="text-xs text-muted mt-1">~{formatUsd(s.estimatedUsd)}</p>
                    )}
                  </PlanCard>
                  <DropGap
                    zone="suggestions"
                    index={index + 1}
                    dropTarget={dropTarget}
                    onDragOver={handleDragOverGap}
                    onDrop={handleDrop}
                  />
                </div>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="p-2 border-t border-border text-xs text-muted">
        Drag suggestions into Working plan to promote. Drag working items down to demote.
      </footer>
    </main>
  );
}
