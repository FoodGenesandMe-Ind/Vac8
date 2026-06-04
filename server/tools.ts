import { v4 as uuid } from "uuid";
import type { VacationPlan, PlanItem, Suggestion, PriceWatch } from "../schema/plan.js";
import { recalcTotals } from "../schema/plan.js";
import { getVacation, saveVacation, deleteVacation } from "./db.js";
import { searchWeb, buildGoogleFlightsUrl } from "./search.js";
import {
  MUTATION_TOOLS,
  runVerification,
  checksForMutation,
  verifyRemoveSuggestion,
  verifyAddedSuggestions,
  type PlanCheck,
} from "./verify.js";
import {
  resolveItemId,
  reorderWorkingPlan,
  reorderUnpromotedSuggestions,
  type PlanSection,
} from "./plan-numbers.js";

const CARD_REF_PROPS = {
  suggestionId: { type: "string", description: "UUID from plan state" },
  displayNum: {
    type: "number",
    description: "Card number from UI: #n in Suggestions, W#n in Working plan (1-based)",
  },
  section: { type: "string", enum: ["working", "suggestions"] },
};

function resolveSuggestionId(
  plan: VacationPlan,
  input: Record<string, unknown>
): string | null {
  if (input.suggestionId) return String(input.suggestionId);
  if (input.displayNum != null) {
    const section = (input.section as PlanSection) ?? "suggestions";
    return resolveItemId(plan, section, Number(input.displayNum));
  }
  return null;
}

function resolveWorkingItemId(
  plan: VacationPlan,
  input: Record<string, unknown>
): string | null {
  if (input.itemId) return String(input.itemId);
  if (input.suggestionId) return String(input.suggestionId);
  if (input.displayNum != null) {
    const section = (input.section as PlanSection) ?? "working";
    return resolveItemId(plan, section, Number(input.displayNum));
  }
  return null;
}

export type ToolOutput = {
  result: string;
  plan?: VacationPlan;
  deleted?: boolean;
  verified?: boolean;
};

function applyAutoVerify(
  ctx: ToolContext,
  toolName: string,
  input: Record<string, unknown>,
  out: ToolOutput
): ToolOutput {
  let verification = { verified: true, summary: "ok", plan: out.plan ?? getVacation(ctx.vacationId) };

  if (toolName === "remove_suggestion") {
    verification = verifyRemoveSuggestion(ctx.vacationId, String(input.suggestionId ?? ""));
  } else if (toolName === "add_suggestions") {
    const items = (input.items as { title?: string }[]) ?? [];
    verification = verifyAddedSuggestions(
      ctx.vacationId,
      items.map((i) => i.title ?? "").filter(Boolean)
    );
  } else {
    const checks = checksForMutation(toolName, input);
    if (checks.length > 0) {
      verification = runVerification(ctx.vacationId, checks);
    }
  }

  if (!verification.verified) {
    return {
      result: `VERIFICATION_FAILED: ${toolName} was not confirmed in the database. ${verification.summary}. You must NOT tell the user this succeeded. Call the tool again or fix the issue, then wait for [verified in database].`,
      plan: verification.plan ?? out.plan,
      verified: false,
    };
  }

  return {
    ...out,
    result: `${out.result} [verified in database]`,
    plan: verification.plan ?? out.plan,
    verified: true,
  };
}

export type ToolContext = { vacationId: string };

const ITEM_UPDATE_PROPERTIES = {
  type: { type: "string", enum: ["flight", "train", "stay", "activity", "transport", "other"] },
  title: { type: "string" },
  description: { type: "string" },
  location: { type: "string" },
  estimatedUsd: { type: "number" },
  confidence: { type: "string", enum: ["low", "medium", "high"] },
  startDate: { type: "string" },
  endDate: { type: "string" },
};

function applyItemPatch<T extends PlanItem>(item: T, updates: Record<string, unknown>): T {
  const next = { ...item };
  if (updates.type != null) next.type = updates.type as PlanItem["type"];
  if (updates.title != null) next.title = String(updates.title);
  if (updates.description != null) next.description = String(updates.description);
  if (updates.location != null) next.location = String(updates.location);
  if (updates.estimatedUsd != null) {
    next.estimatedUsd = Number(updates.estimatedUsd);
    next.costBasis = "model_estimate";
  }
  if (updates.confidence != null) next.confidence = updates.confidence as PlanItem["confidence"];
  if (updates.startDate != null) next.startDate = String(updates.startDate);
  if (updates.endDate != null) next.endDate = String(updates.endDate);
  return next;
}

function syncSuggestionAndWorkingPlan(plan: VacationPlan, itemId: string, patch: Record<string, unknown>): VacationPlan {
  const suggestions = plan.suggestions.map((s) =>
    s.id === itemId ? applyItemPatch(s, patch) : s
  );
  const workingPlan = plan.workingPlan.map((w) =>
    w.id === itemId ? applyItemPatch(w, patch) : w
  );
  return recalcTotals({ ...plan, suggestions, workingPlan });
}

export const TOOL_DEFINITIONS = [
  {
    name: "search_web",
    description: "Search the web for travel info, fares, routes, hotels. Returns snippets.",
    input_schema: {
      type: "object" as const,
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"],
    },
  },
  {
    name: "update_vacation",
    description: "Update this vacation's title or status.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" },
        status: { type: "string", enum: ["draft", "active"] },
      },
    },
  },
  {
    name: "set_narrative",
    description: "Save or replace the user's trip narrative and optional title.",
    input_schema: {
      type: "object" as const,
      properties: { narrative: { type: "string" }, title: { type: "string" } },
      required: ["narrative"],
    },
  },
  {
    name: "update_constraints",
    description: "Merge structured trip constraints (dates, cabin, preferences).",
    input_schema: {
      type: "object" as const,
      properties: { constraints: { type: "object" } },
      required: ["constraints"],
    },
  },
  {
    name: "add_suggestions",
    description: "Add 1-4 new suggestion cards (not in working plan yet).",
    input_schema: {
      type: "object" as const,
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { ...ITEM_UPDATE_PROPERTIES },
            required: ["type", "title"],
          },
        },
      },
      required: ["items"],
    },
  },
  {
    name: "update_suggestion",
    description:
      "Edit a suggestion card. Use suggestionId OR displayNum (Suggestions #n, or working W#n via section).",
    input_schema: {
      type: "object" as const,
      properties: {
        ...CARD_REF_PROPS,
        updates: { type: "object", properties: { ...ITEM_UPDATE_PROPERTIES } },
      },
      required: ["updates"],
    },
  },
  {
    name: "remove_suggestion",
    description: "Delete a suggestion card by id or displayNum (#n in Suggestions).",
    input_schema: {
      type: "object" as const,
      properties: { ...CARD_REF_PROPS },
    },
  },
  {
    name: "promote_suggestion",
    description: "Promote Suggestions card #n into the working plan. Use displayNum (e.g. 4 for #4) or suggestionId.",
    input_schema: {
      type: "object" as const,
      properties: { ...CARD_REF_PROPS },
    },
  },
  {
    name: "demote_suggestion",
    description:
      "Demote working plan card W#n back to Suggestions. Use displayNum with section working, or suggestionId.",
    input_schema: {
      type: "object" as const,
      properties: { ...CARD_REF_PROPS, itemId: { type: "string" } },
    },
  },
  {
    name: "reorder_working_plan",
    description: "Reorder working plan cards. Pass orderedIds in the desired order (W#1 first, etc.).",
    input_schema: {
      type: "object" as const,
      properties: {
        orderedIds: { type: "array", items: { type: "string" } },
      },
      required: ["orderedIds"],
    },
  },
  {
    name: "reorder_suggestions",
    description: "Reorder unpromoted suggestion cards. Pass orderedIds (#1 first, etc.).",
    input_schema: {
      type: "object" as const,
      properties: {
        orderedIds: { type: "array", items: { type: "string" } },
      },
      required: ["orderedIds"],
    },
  },
  {
    name: "read_plan_from_db",
    description:
      "Re-read the vacation plan fresh from the database. Use for self-check after mutations — do not trust memory.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "verify_plan",
    description:
      "Self-test: verify the database matches expectations after a change. Call before telling the user a change succeeded.",
    input_schema: {
      type: "object" as const,
      properties: {
        checks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: {
                type: "string",
                enum: [
                  "suggestion_field",
                  "suggestion_promoted",
                  "in_working_plan",
                  "suggestion_exists",
                ],
              },
              suggestionId: { type: "string" },
              itemId: { type: "string" },
              field: { type: "string" },
              expected: {},
              promoted: { type: "boolean" },
              present: { type: "boolean" },
            },
            required: ["kind"],
          },
        },
      },
      required: ["checks"],
    },
  },
  {
    name: "update_working_plan_item",
    description: "Edit a working plan card. Use itemId OR displayNum with section working (W#n).",
    input_schema: {
      type: "object" as const,
      properties: {
        itemId: { type: "string" },
        displayNum: CARD_REF_PROPS.displayNum,
        section: CARD_REF_PROPS.section,
        updates: { type: "object", properties: { ...ITEM_UPDATE_PROPERTIES } },
      },
      required: ["updates"],
    },
  },
  {
    name: "remove_working_plan_item",
    description: "Remove an item from the working plan. The suggestion card stays but is unpromoted.",
    input_schema: {
      type: "object" as const,
      properties: { itemId: { type: "string" } },
      required: ["itemId"],
    },
  },
  {
    name: "add_price_watch",
    description: "Add a fare or rate watch.",
    input_schema: {
      type: "object" as const,
      properties: {
        label: { type: "string" },
        searchQuery: { type: "string" },
        origin: { type: "string" },
        destination: { type: "string" },
        cabin: { type: "string" },
      },
      required: ["label", "searchQuery"],
    },
  },
  {
    name: "update_price_watch",
    description: "Edit a price watch by id.",
    input_schema: {
      type: "object" as const,
      properties: {
        watchId: { type: "string" },
        label: { type: "string" },
        searchQuery: { type: "string" },
      },
      required: ["watchId"],
    },
  },
  {
    name: "remove_price_watch",
    description: "Delete a price watch by id.",
    input_schema: {
      type: "object" as const,
      properties: { watchId: { type: "string" } },
      required: ["watchId"],
    },
  },
  {
    name: "set_pending_question",
    description: "Set exactly one clarifying question. Only use when no pending question exists.",
    input_schema: {
      type: "object" as const,
      properties: { question: { type: "string" } },
      required: ["question"],
    },
  },
  {
    name: "clear_pending_question",
    description: "Clear pending question after user answered.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "delete_vacation",
    description: "Permanently delete this entire vacation. Only when the user explicitly asks to delete/remove the trip.",
    input_schema: {
      type: "object" as const,
      properties: { confirm: { type: "boolean", description: "Must be true" } },
      required: ["confirm"],
    },
  },
];

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolOutput> {
  let plan = getVacation(ctx.vacationId);
  if (!plan) throw new Error("Vacation not found");

  switch (name) {
    case "search_web": {
      const query = String(input.query ?? "");
      const results = await searchWeb(query);
      const text = results
        .slice(0, 6)
        .map((r, i) => `${i + 1}. ${r.title}\n${r.snippet}\n${r.link}`)
        .join("\n\n");
      return { result: text || "No results." };
    }

    case "update_vacation": {
      const title = input.title != null ? String(input.title) : plan.title;
      const status =
        input.status != null ? (input.status as VacationPlan["status"]) : plan.status;
      plan = saveVacation({ ...plan, title, status });
      return { result: `Vacation updated: ${plan.title}`, plan };
    }

    case "add_suggestions": {
      const items = (input.items as Partial<PlanItem>[]) ?? [];
      const newSuggestions: Suggestion[] = items.map((item) => ({
        id: uuid(),
        type: (item.type as PlanItem["type"]) ?? "other",
        title: item.title ?? "Suggestion",
        description: item.description,
        location: item.location,
        estimatedUsd: item.estimatedUsd,
        costBasis: item.estimatedUsd ? "model_estimate" : undefined,
        confidence: (item.confidence as Suggestion["confidence"]) ?? "medium",
        source: "agatha",
        promoted: false,
      }));
      plan = saveVacation({
        ...plan,
        suggestions: [...plan.suggestions, ...newSuggestions],
        status: "active",
      });
      return {
        result: `Added ${newSuggestions.length} suggestions. ids: ${newSuggestions.map((s) => s.id).join(", ")}`,
        plan,
      };
    }

    case "update_suggestion": {
      const sid = resolveSuggestionId(plan, input);
      if (!sid) return { result: "Suggestion not found: provide suggestionId or displayNum (#n)." };
      const updates = (input.updates as Record<string, unknown>) ?? {};
      const exists = plan.suggestions.some((s) => s.id === sid);
      if (!exists) return { result: `Suggestion not found: ${sid}` };
      plan = saveVacation(syncSuggestionAndWorkingPlan(plan, sid, updates));
      const updated = plan.suggestions.find((s) => s.id === sid);
      return { result: `Updated suggestion: ${updated?.title}`, plan };
    }

    case "remove_suggestion": {
      const sid = resolveSuggestionId(plan, input);
      if (!sid) return { result: "Suggestion not found: provide suggestionId or displayNum." };
      const sug = plan.suggestions.find((s) => s.id === sid);
      if (!sug) return { result: `Suggestion not found: ${sid}` };
      plan = saveVacation(
        recalcTotals({
          ...plan,
          suggestions: plan.suggestions.filter((s) => s.id !== sid),
          workingPlan: plan.workingPlan.filter((w) => w.id !== sid),
        })
      );
      return { result: `Removed suggestion: ${sug.title}`, plan };
    }

    case "update_constraints": {
      const constraints = (input.constraints as Record<string, unknown>) ?? {};
      plan = saveVacation({
        ...plan,
        constraints: { ...plan.constraints, ...constraints },
      });
      return { result: "Constraints updated.", plan };
    }

    case "promote_suggestion": {
      const sid = resolveSuggestionId(plan, input);
      if (!sid) return { result: "Suggestion not found: provide suggestionId or displayNum (#n in Suggestions)." };
      const sug = plan.suggestions.find((s) => s.id === sid);
      if (!sug) return { result: "Suggestion not found." };
      if (sug.promoted) return { result: "Already in working plan.", plan };
      const { promoted: _, ...item } = sug;
      plan = saveVacation(
        recalcTotals({
          ...plan,
          workingPlan: [...plan.workingPlan, item],
          suggestions: plan.suggestions.map((s) =>
            s.id === sid ? { ...s, promoted: true } : s
          ),
        })
      );
      return { result: `Promoted: ${sug.title}`, plan };
    }

    case "reorder_working_plan": {
      const orderedIds = (input.orderedIds as string[]) ?? [];
      plan = saveVacation({
        ...plan,
        workingPlan: reorderWorkingPlan(plan, orderedIds),
      });
      return { result: `Reordered working plan (${orderedIds.length} items).`, plan };
    }

    case "reorder_suggestions": {
      const orderedIds = (input.orderedIds as string[]) ?? [];
      plan = saveVacation({
        ...plan,
        suggestions: reorderUnpromotedSuggestions(plan, orderedIds),
      });
      return { result: `Reordered suggestions (${orderedIds.length} items).`, plan };
    }

    case "update_working_plan_item": {
      const itemId = resolveWorkingItemId(plan, input);
      if (!itemId) return { result: "Item not found: provide itemId or displayNum (W#n)." };
      const updates = (input.updates as Record<string, unknown>) ?? {};
      if (!plan.workingPlan.some((w) => w.id === itemId)) {
        return { result: `Working plan item not found: ${itemId}` };
      }
      plan = saveVacation(syncSuggestionAndWorkingPlan(plan, itemId, updates));
      const updated = plan.workingPlan.find((w) => w.id === itemId);
      return { result: `Updated working plan item: ${updated?.title}`, plan };
    }

    case "demote_suggestion":
    case "remove_working_plan_item": {
      const itemId = resolveWorkingItemId(plan, input);
      if (!itemId) return { result: "Working plan item not found: provide itemId or displayNum (W#n)." };
      const item = plan.workingPlan.find((w) => w.id === itemId);
      if (!item) return { result: `Working plan item not found: ${itemId}` };
      plan = saveVacation(
        recalcTotals({
          ...plan,
          workingPlan: plan.workingPlan.filter((w) => w.id !== itemId),
          suggestions: plan.suggestions.map((s) =>
            s.id === itemId ? { ...s, promoted: false } : s
          ),
        })
      );
      return { result: `Demoted to suggestions: ${item.title}`, plan };
    }

    case "read_plan_from_db": {
      const fresh = getVacation(ctx.vacationId);
      if (!fresh) return { result: "Vacation not found in database." };
      return {
        result: JSON.stringify(
          {
            vacationId: fresh.id,
            title: fresh.title,
            suggestions: fresh.suggestions,
            workingPlan: fresh.workingPlan,
            totals: fresh.totals,
          },
          null,
          2
        ),
        plan: fresh,
      };
    }

    case "verify_plan": {
      const checks = (input.checks as PlanCheck[]) ?? [];
      const v = runVerification(ctx.vacationId, checks);
      return {
        result: JSON.stringify({ verified: v.verified, results: v.results }, null, 2),
        plan: v.plan ?? undefined,
        verified: v.verified,
      };
    }

    case "set_pending_question": {
      if (plan.agathaState.pendingQuestion) {
        return {
          result: "Blocked: a question is already pending. Wait for the user's answer.",
        };
      }
      const question = String(input.question ?? "");
      plan = saveVacation({
        ...plan,
        agathaState: { pendingQuestion: question },
      });
      return { result: `Pending question set.`, plan };
    }

    case "clear_pending_question": {
      plan = saveVacation({ ...plan, agathaState: {} });
      return { result: "Pending question cleared.", plan };
    }

    case "add_price_watch": {
      const label = String(input.label);
      const searchQuery = String(input.searchQuery);
      const url = buildGoogleFlightsUrl({
        origin: input.origin as string | undefined,
        destination: input.destination as string | undefined,
        cabin: (input.cabin as "first") ?? undefined,
      });
      const watch: PriceWatch = {
        id: uuid(),
        label,
        searchQuery,
        googleFlightsUrl: url,
        trend: "unknown",
        recommendation: "neutral",
      };
      plan = saveVacation({ ...plan, priceWatches: [...plan.priceWatches, watch] });
      return { result: `Price watch added: ${label} (id ${watch.id})`, plan };
    }

    case "update_price_watch": {
      const watchId = String(input.watchId);
      const watches = plan.priceWatches.map((w) => {
        if (w.id !== watchId) return w;
        return {
          ...w,
          ...(input.label != null ? { label: String(input.label) } : {}),
          ...(input.searchQuery != null ? { searchQuery: String(input.searchQuery) } : {}),
        };
      });
      if (!plan.priceWatches.some((w) => w.id === watchId)) {
        return { result: `Price watch not found: ${watchId}` };
      }
      plan = saveVacation({ ...plan, priceWatches: watches });
      return { result: "Price watch updated.", plan };
    }

    case "remove_price_watch": {
      const watchId = String(input.watchId);
      plan = saveVacation({
        ...plan,
        priceWatches: plan.priceWatches.filter((w) => w.id !== watchId),
      });
      return { result: "Price watch removed.", plan };
    }

    case "set_narrative": {
      const narrative = String(input.narrative ?? "");
      const title = input.title ? String(input.title) : plan.title;
      plan = saveVacation({ ...plan, narrative, title, status: "active" });
      return { result: "Narrative saved.", plan };
    }

    case "delete_vacation": {
      if (input.confirm !== true) {
        return { result: "Delete cancelled: confirm must be true." };
      }
      deleteVacation(ctx.vacationId);
      return { result: "Vacation deleted.", deleted: true };
    }

    default:
      return { result: `Unknown tool: ${name}` };
  }
}

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolOutput> {
  const out = await executeTool(name, input, ctx);
  if (MUTATION_TOOLS.has(name) && !out.deleted) {
    return applyAutoVerify(ctx, name, input, out);
  }
  return { ...out, verified: out.verified ?? true };
}
