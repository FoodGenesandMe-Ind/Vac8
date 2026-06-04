import { v4 as uuid } from "uuid";
import type { VacationPlan, PlanItem, Suggestion, PriceWatch } from "../schema/plan.js";
import { recalcTotals } from "../schema/plan.js";
import { getVacation, saveVacation } from "./db.js";
import { searchWeb, buildGoogleFlightsUrl } from "./search.js";

export type ToolContext = { vacationId: string };

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
    name: "add_suggestions",
    description: "Add 1-4 trip suggestions to the plan (not yet in working plan).",
    input_schema: {
      type: "object" as const,
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["flight", "train", "stay", "activity", "transport", "other"] },
              title: { type: "string" },
              description: { type: "string" },
              location: { type: "string" },
              estimatedUsd: { type: "number" },
              confidence: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["type", "title"],
          },
        },
      },
      required: ["items"],
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
    name: "promote_suggestion",
    description: "Move a suggestion into the working plan.",
    input_schema: {
      type: "object" as const,
      properties: { suggestionId: { type: "string" } },
      required: ["suggestionId"],
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
    name: "add_price_watch",
    description: "Watch a fare or rate via periodic web search.",
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
    name: "set_narrative",
    description: "Save the user's original trip narrative (first message).",
    input_schema: {
      type: "object" as const,
      properties: { narrative: { type: "string" }, title: { type: "string" } },
      required: ["narrative"],
    },
  },
];

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<{ result: string; plan?: VacationPlan }> {
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
      return { result: `Added ${newSuggestions.length} suggestions.`, plan };
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
      const sid = String(input.suggestionId);
      const sug = plan.suggestions.find((s) => s.id === sid);
      if (!sug) return { result: "Suggestion not found." };
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
      return { result: `Price watch added: ${label}`, plan };
    }

    case "set_narrative": {
      const narrative = String(input.narrative ?? "");
      const title = input.title ? String(input.title) : plan.title;
      plan = saveVacation({ ...plan, narrative, title, status: "active" });
      return { result: "Narrative saved.", plan };
    }

    default:
      return { result: `Unknown tool: ${name}` };
  }
}
