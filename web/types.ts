export type PlanItem = {
  id: string;
  type: "flight" | "train" | "stay" | "activity" | "transport" | "other";
  title: string;
  description?: string;
  location?: string;
  estimatedUsd?: number;
  costBasis?: "search_snippet" | "model_estimate" | "user_override";
  startDate?: string;
  endDate?: string;
  source?: string;
  confidence?: "low" | "medium" | "high";
};

export type Suggestion = PlanItem & { promoted?: boolean };

export type PriceWatch = {
  id: string;
  itemId?: string;
  label: string;
  searchQuery: string;
  googleFlightsUrl?: string;
  lastSnapshot?: string;
  lastPriceUsd?: number;
  lastCheckedAt?: string;
  trend?: "up" | "down" | "stable" | "unknown";
  recommendation?: "buy_now" | "wait" | "neutral";
  changePercent?: number;
};

export type VacationPlan = {
  id: string;
  title: string;
  status: "draft" | "active";
  narrative?: string;
  constraints: Record<string, unknown>;
  workingPlan: PlanItem[];
  suggestions: Suggestion[];
  priceWatches: PriceWatch[];
  totals: { low: number; mid: number; high: number; currency: string };
  agathaState: { pendingQuestion?: string };
  createdAt: string;
  updatedAt: string;
};
