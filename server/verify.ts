import { getVacation } from "./db.js";
import type { VacationPlan } from "../schema/plan.js";

export type PlanCheck = {
  kind: "suggestion_field" | "suggestion_promoted" | "in_working_plan" | "suggestion_exists";
  suggestionId?: string;
  itemId?: string;
  field?: string;
  expected?: unknown;
  promoted?: boolean;
  present?: boolean;
};

export type VerificationResult = {
  verified: boolean;
  results: { kind: string; ok: boolean; detail: string }[];
  summary: string;
  plan: VacationPlan | null;
};

export const MUTATION_TOOLS = new Set([
  "update_vacation",
  "set_narrative",
  "update_constraints",
  "add_suggestions",
  "update_suggestion",
  "remove_suggestion",
  "promote_suggestion",
  "demote_suggestion",
  "remove_working_plan_item",
  "update_working_plan_item",
  "add_price_watch",
  "update_price_watch",
  "remove_price_watch",
]);

export function runVerification(vacationId: string, checks: PlanCheck[]): VerificationResult {
  const fresh = getVacation(vacationId);
  if (!fresh) {
    return {
      verified: false,
      results: [{ kind: "db", ok: false, detail: "Vacation not found" }],
      summary: "Vacation not found in database",
      plan: null,
    };
  }

  const results: { kind: string; ok: boolean; detail: string }[] = [];

  for (const check of checks) {
    const sid = check.suggestionId ?? "";
    const iid = check.itemId ?? check.suggestionId ?? "";
    const sug = fresh.suggestions.find((s) => s.id === sid);
    const inWorking = fresh.workingPlan.some((w) => w.id === iid);

    if (check.kind === "suggestion_exists") {
      const ok = !!sug;
      results.push({
        kind: check.kind,
        ok,
        detail: ok ? `Suggestion ${sid} exists` : `Suggestion ${sid} missing`,
      });
      continue;
    }

    if (check.kind === "suggestion_promoted") {
      const want = check.promoted === true;
      const ok = !!sug && sug.promoted === want;
      results.push({
        kind: check.kind,
        ok,
        detail: ok
          ? `promoted=${want}`
          : `expected promoted=${want}, got ${String(sug?.promoted ?? "missing")}`,
      });
      continue;
    }

    if (check.kind === "in_working_plan") {
      const want = check.present !== false;
      const ok = want ? inWorking : !inWorking;
      results.push({
        kind: check.kind,
        ok,
        detail: ok
          ? `in_working_plan=${want}`
          : `expected in_working_plan=${want}, got ${inWorking}`,
      });
      continue;
    }

    if (check.kind === "suggestion_field") {
      const field = check.field ?? "";
      const expected = check.expected;
      const actual = sug ? (sug as Record<string, unknown>)[field] : undefined;
      const ok =
        sug != null &&
        (typeof expected === "string"
          ? String(actual ?? "").includes(expected)
          : actual === expected);
      results.push({
        kind: check.kind,
        ok,
        detail: ok
          ? `${field} ok`
          : `expected ${field}=${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      });
      continue;
    }

    results.push({ kind: check.kind, ok: false, detail: "Unknown check kind" });
  }

  const verified = results.every((r) => r.ok);
  const failed = results.filter((r) => !r.ok).map((r) => r.detail);
  return {
    verified,
    results,
    summary: verified ? "All checks passed" : failed.join("; "),
    plan: fresh,
  };
}

export function checksForMutation(
  toolName: string,
  input: Record<string, unknown>
): PlanCheck[] {
  const sid = input.suggestionId != null ? String(input.suggestionId) : "";
  const itemId = input.itemId != null ? String(input.itemId) : sid;

  switch (toolName) {
    case "promote_suggestion":
      return [
        { kind: "suggestion_exists", suggestionId: sid },
        { kind: "suggestion_promoted", suggestionId: sid, promoted: true },
        { kind: "in_working_plan", itemId: sid, present: true },
      ];

    case "demote_suggestion":
    case "remove_working_plan_item":
      return [
        { kind: "suggestion_exists", suggestionId: itemId || sid },
        { kind: "suggestion_promoted", suggestionId: itemId || sid, promoted: false },
        { kind: "in_working_plan", itemId: itemId || sid, present: false },
      ];

    case "update_suggestion":
    case "update_working_plan_item": {
      const updates = (input.updates as Record<string, unknown>) ?? {};
      const id = toolName === "update_suggestion" ? sid : itemId;
      return [
        { kind: "suggestion_exists", suggestionId: id },
        ...Object.entries(updates).map(([field, expected]) => ({
          kind: "suggestion_field" as const,
          suggestionId: id,
          field,
          expected,
        })),
      ];
    }

    case "remove_suggestion":
      return [{ kind: "suggestion_exists", suggestionId: sid }]; // expect missing — handled below

    case "add_suggestions": {
      const items = (input.items as { title?: string }[]) ?? [];
      return items.flatMap((item, i) => [
        {
          kind: "suggestion_field" as const,
          suggestionId: "", // filled post-hoc
          field: "title",
          expected: item.title ?? "",
        },
      ]);
    }

    default:
      return [];
  }
}

/** Special verify for remove: suggestion must NOT exist */
export function verifyRemoveSuggestion(vacationId: string, suggestionId: string): VerificationResult {
  const fresh = getVacation(vacationId);
  if (!fresh) {
    return { verified: false, results: [], summary: "not found", plan: null };
  }
  const exists = fresh.suggestions.some((s) => s.id === suggestionId);
  const inWorking = fresh.workingPlan.some((w) => w.id === suggestionId);
  const ok = !exists && !inWorking;
  return {
    verified: ok,
    results: [
      {
        kind: "removed",
        ok,
        detail: ok ? "removed" : `still exists promoted=${exists} working=${inWorking}`,
      },
    ],
    summary: ok ? "Suggestion removed" : "Suggestion still in database",
    plan: fresh,
  };
}

/** Post-add: verify titles exist on unpromoted or any suggestions */
export function verifyAddedSuggestions(
  vacationId: string,
  titles: string[]
): VerificationResult {
  const fresh = getVacation(vacationId);
  if (!fresh) {
    return { verified: false, results: [], summary: "not found", plan: null };
  }
  const results = titles.map((title) => {
    const ok = fresh.suggestions.some((s) => s.title.includes(title) || title.includes(s.title));
    return {
      kind: "added",
      ok,
      detail: ok ? `found "${title}"` : `missing "${title}"`,
    };
  });
  const verified = results.every((r) => r.ok);
  return {
    verified,
    results,
    summary: verified ? "Suggestions in DB" : results.filter((r) => !r.ok).map((r) => r.detail).join("; "),
    plan: fresh,
  };
}

export function requiredActionsFromUser(message: string): string[] {
  const m = message.toLowerCase();
  const actions: string[] = [];
  if (/\bdemot(e|ed|ing)?\b|move back|back to suggestion/.test(m)) actions.push("demote");
  if (/\bpromot(e|ed|ing)?\b|add to (the )?working plan|move up/.test(m)) actions.push("promote");
  if (/\bupdate|\bedit|\bchange|\bfix|\badd .*(airline|detail|description)/.test(m)) actions.push("update");
  if (/\bremove|\bdelete/.test(m)) actions.push("remove");
  return actions;
}

export function mutationSatisfiesAction(
  action: string,
  entry: { tool: string; verified: boolean }
): boolean {
  if (!entry.verified) return false;
  switch (action) {
    case "demote":
      return entry.tool === "demote_suggestion" || entry.tool === "remove_working_plan_item";
    case "promote":
      return entry.tool === "promote_suggestion";
    case "update":
      return entry.tool === "update_suggestion" || entry.tool === "update_working_plan_item";
    case "remove":
      return entry.tool === "remove_suggestion";
    default:
      return false;
  }
}
