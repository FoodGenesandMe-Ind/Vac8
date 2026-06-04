import type { VacationPlan, PlanItem, Suggestion } from "../schema/plan.js";

export type PlanSection = "working" | "suggestions";

export function activeSuggestions(plan: VacationPlan): Suggestion[] {
  return plan.suggestions.filter((s) => !s.promoted);
}

export function resolveItemId(
  plan: VacationPlan,
  section: PlanSection,
  displayNum: number
): string | null {
  const n = Math.floor(displayNum);
  if (n < 1) return null;
  if (section === "working") {
    return plan.workingPlan[n - 1]?.id ?? null;
  }
  return activeSuggestions(plan)[n - 1]?.id ?? null;
}

export function reorderWorkingPlan(plan: VacationPlan, orderedIds: string[]): PlanItem[] {
  const byId = new Map(plan.workingPlan.map((w) => [w.id, w]));
  const next = orderedIds.map((id) => byId.get(id)).filter((x): x is PlanItem => !!x);
  const missing = plan.workingPlan.filter((w) => !orderedIds.includes(w.id));
  return [...next, ...missing];
}

export function reorderUnpromotedSuggestions(
  plan: VacationPlan,
  orderedActiveIds: string[]
): Suggestion[] {
  const promoted = plan.suggestions.filter((s) => s.promoted);
  const byId = new Map(activeSuggestions(plan).map((s) => [s.id, s]));
  const reordered = orderedActiveIds.map((id) => byId.get(id)).filter((x): x is Suggestion => !!x);
  const missing = activeSuggestions(plan).filter((s) => !orderedActiveIds.includes(s.id));
  return [...reordered, ...missing, ...promoted];
}

export function planWithDisplayNums(plan: VacationPlan) {
  return {
    workingPlan: plan.workingPlan.map((w, i) => ({ displayNum: i + 1, ...w })),
    suggestions: activeSuggestions(plan).map((s, i) => ({ displayNum: i + 1, ...s })),
    promotedSuggestions: plan.suggestions
      .filter((s) => s.promoted)
      .map((s, i) => ({ displayNum: i + 1, note: "in working plan", ...s })),
  };
}
