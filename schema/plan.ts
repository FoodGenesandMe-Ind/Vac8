import { z } from "zod";

export const PlanItemSchema = z.object({
  id: z.string(),
  type: z.enum(["flight", "train", "stay", "activity", "transport", "other"]),
  title: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
  estimatedUsd: z.number().optional(),
  costBasis: z.enum(["search_snippet", "model_estimate", "user_override"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  source: z.string().optional(),
  confidence: z.enum(["low", "medium", "high"]).optional(),
});

export const SuggestionSchema = PlanItemSchema.extend({
  promoted: z.boolean().default(false),
});

export const PriceWatchSchema = z.object({
  id: z.string(),
  itemId: z.string().optional(),
  label: z.string(),
  searchQuery: z.string(),
  googleFlightsUrl: z.string().optional(),
  lastSnapshot: z.string().optional(),
  lastPriceUsd: z.number().optional(),
  lastCheckedAt: z.string().optional(),
  trend: z.enum(["up", "down", "stable", "unknown"]).default("unknown"),
  recommendation: z.enum(["buy_now", "wait", "neutral"]).default("neutral"),
  changePercent: z.number().optional(),
});

export const PlanTotalsSchema = z.object({
  low: z.number().default(0),
  mid: z.number().default(0),
  high: z.number().default(0),
  currency: z.string().default("USD"),
});

export const AgathaStateSchema = z.object({
  pendingQuestion: z.string().optional(),
});

export const VacationPlanSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(["draft", "active"]).default("draft"),
  narrative: z.string().optional(),
  constraints: z.record(z.unknown()).default({}),
  workingPlan: z.array(PlanItemSchema).default([]),
  suggestions: z.array(SuggestionSchema).default([]),
  priceWatches: z.array(PriceWatchSchema).default([]),
  totals: PlanTotalsSchema.default({ low: 0, mid: 0, high: 0, currency: "USD" }),
  agathaState: AgathaStateSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PlanItem = z.infer<typeof PlanItemSchema>;
export type Suggestion = z.infer<typeof SuggestionSchema>;
export type PriceWatch = z.infer<typeof PriceWatchSchema>;
export type VacationPlan = z.infer<typeof VacationPlanSchema>;

export function recalcTotals(plan: VacationPlan): VacationPlan {
  const items = plan.workingPlan;
  const estimates = items
    .map((i) => i.estimatedUsd)
    .filter((n): n is number => typeof n === "number");

  if (estimates.length === 0) {
    return { ...plan, totals: { low: 0, mid: 0, high: 0, currency: "USD" } };
  }

  const sum = estimates.reduce((a, b) => a + b, 0);
  const buffer = sum * 0.15;
  return {
    ...plan,
    totals: {
      low: Math.round(sum - buffer),
      mid: Math.round(sum),
      high: Math.round(sum + buffer),
      currency: "USD",
    },
  };
}

export function emptyPlan(id: string, title: string): VacationPlan {
  const now = new Date().toISOString();
  return {
    id,
    title,
    status: "draft",
    constraints: {},
    workingPlan: [],
    suggestions: [],
    priceWatches: [],
    totals: { low: 0, mid: 0, high: 0, currency: "USD" },
    agathaState: {},
    createdAt: now,
    updatedAt: now,
  };
}
