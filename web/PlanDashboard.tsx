import type { VacationPlan } from "../schema/plan";
import { promoteSuggestion } from "./api";

type Props = {
  plan: VacationPlan | null;
  onPromote: (plan: VacationPlan) => void;
};

function formatUsd(n?: number) {
  if (n == null) return "—";
  return `$${n.toLocaleString()}`;
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
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <section>
          <h2 className="text-xs uppercase tracking-wide text-muted mb-2">Working plan</h2>
          {plan.workingPlan.length === 0 ? (
            <p className="text-sm text-muted">Promote suggestions below to build your itinerary.</p>
          ) : (
            <ul className="space-y-2">
              {plan.workingPlan.map((item) => (
                <li
                  key={item.id}
                  className="p-3 rounded bg-surface border border-border text-sm"
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{item.title}</span>
                    <span className="text-muted shrink-0">{formatUsd(item.estimatedUsd)}</span>
                  </div>
                  {item.description && (
                    <p className="text-muted mt-1 text-xs">{item.description}</p>
                  )}
                  {item.location && (
                    <p className="text-xs text-muted mt-0.5">{item.location}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {plan.priceWatches.length > 0 && (
          <section>
            <h2 className="text-xs uppercase tracking-wide text-muted mb-2">Price watches</h2>
            <ul className="space-y-2">
              {plan.priceWatches.map((w) => (
                <li
                  key={w.id}
                  className="p-2 rounded bg-surface border border-border text-xs"
                >
                  <div className="font-medium">{w.label}</div>
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
              {activeSuggestions.map((s) => (
                <li
                  key={s.id}
                  className="p-3 rounded bg-surface border border-border text-sm"
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
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="p-2 border-t border-border text-xs text-muted">
        Estimates are indicative from web search, not live bookable fares.
      </footer>
    </main>
  );
}
