import type { VacationPlan } from "./types";
import {
  demoteSuggestion,
  promoteSuggestion,
  reorderSuggestions,
  reorderWorkingPlan,
} from "./vac8-api";
import { DraggableCard } from "./DraggableCard";

type Props = {
  plan: VacationPlan | null;
  onPromote: (plan: VacationPlan) => void;
};

function formatUsd(n?: number) {
  if (n == null) return "—";
  return `$${n.toLocaleString()}`;
}

function reorderList<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function PlanDashboard({ plan, onPromote }: Props) {
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

  const handleReorderWorking = async (from: number, to: number) => {
    const reordered = reorderList(plan.workingPlan, from, to);
    const updated = await reorderWorkingPlan(
      plan.id,
      reordered.map((i) => i.id)
    );
    onPromote(updated);
  };

  const handleReorderSuggestions = async (from: number, to: number) => {
    const reordered = reorderList(activeSuggestions, from, to);
    const updated = await reorderSuggestions(
      plan.id,
      reordered.map((s) => s.id)
    );
    onPromote(updated);
  };

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
          Cards are numbered per section. Tell Agatha e.g. &quot;Promote #2&quot; (Suggestions) or &quot;Demote W#1&quot; (Working plan).
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <section>
          <h2 className="text-xs uppercase tracking-wide text-muted mb-2">Working plan</h2>
          {plan.workingPlan.length === 0 ? (
            <p className="text-sm text-muted">Promote suggestions below to build your itinerary.</p>
          ) : (
            <ul className="space-y-2">
              {plan.workingPlan.map((item, index) => (
                <DraggableCard
                  key={item.id}
                  displayNum={index + 1}
                  index={index}
                  onReorder={handleReorderWorking}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] text-muted uppercase mr-1">W#</span>
                      <span className="font-medium">{item.title}</span>
                      <span className="text-muted shrink-0 ml-2">{formatUsd(item.estimatedUsd)}</span>
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
                </DraggableCard>
              ))}
            </ul>
          )}
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
                  <div className="text-muted mt-1">
                    {w.recommendation === "buy_now" && (
                      <span className="text-green-400">Buy now</span>
                    )}
                    {w.recommendation === "wait" && (
                      <span className="text-amber-400">Wait</span>
                    )}
                    {w.recommendation === "neutral" && "Stable"}
                    {w.changePercent != null && ` (${w.changePercent.toFixed(1)}%)`}
                    {w.lastCheckedAt && ` · checked ${new Date(w.lastCheckedAt).toLocaleString()}`}
                  </div>
                  {w.googleFlightsUrl && (
                    <a
                      href={w.googleFlightsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent hover:underline mt-1 inline-block"
                    >
                      Google Flights
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="text-xs uppercase tracking-wide text-muted mb-2">Suggestions</h2>
          {activeSuggestions.length === 0 ? (
            <p className="text-sm text-muted">Agatha will add suggestions as you chat.</p>
          ) : (
            <ul className="space-y-2">
              {activeSuggestions.map((s, index) => (
                <DraggableCard
                  key={s.id}
                  displayNum={index + 1}
                  index={index}
                  onReorder={handleReorderSuggestions}
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
                </DraggableCard>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="p-2 border-t border-border text-xs text-muted">
        Drag the grip to reorder. Estimates are indicative, not live bookable fares.
      </footer>
    </main>
  );
}
