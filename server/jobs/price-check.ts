import cron from "node-cron";
import notifier from "node-notifier";
import { listVacations, saveVacation } from "../db.js";
import { webSearchProvider } from "../search.js";
import { parsePriceFromSnapshot } from "../search.js";
import type { VacationPlan, PriceWatch } from "../../schema/plan.js";

const THRESHOLD_PERCENT = 5;

function evaluateWatch(watch: PriceWatch, priceUsd: number | undefined, snapshot: string): PriceWatch {
  const now = new Date().toISOString();
  let trend: PriceWatch["trend"] = "unknown";
  let recommendation: PriceWatch["recommendation"] = "neutral";
  let changePercent: number | undefined;

  if (priceUsd != null && watch.lastPriceUsd != null && watch.lastPriceUsd > 0) {
    changePercent = ((priceUsd - watch.lastPriceUsd) / watch.lastPriceUsd) * 100;
    if (changePercent <= -THRESHOLD_PERCENT) {
      trend = "down";
      recommendation = "buy_now";
    } else if (changePercent >= THRESHOLD_PERCENT) {
      trend = "up";
      recommendation = "wait";
    } else {
      trend = "stable";
      recommendation = "neutral";
    }
  }

  return {
    ...watch,
    lastSnapshot: snapshot.slice(0, 2000),
    lastPriceUsd: priceUsd ?? watch.lastPriceUsd,
    lastCheckedAt: now,
    trend,
    recommendation,
    changePercent,
  };
}

export async function runPriceChecks(): Promise<void> {
  const plans = listVacations();
  for (const plan of plans) {
    if (plan.priceWatches.length === 0) continue;

    let updated = false;
    const watches: PriceWatch[] = [];

    for (const watch of plan.priceWatches) {
      try {
        const quote = await webSearchProvider.fetchQuote(watch.searchQuery);
        const priceUsd = quote.priceUsd ?? parsePriceFromSnapshot(quote.snapshot);
        const prev = watch.lastPriceUsd;
        const newWatch = evaluateWatch(watch, priceUsd, quote.snapshot);
        watches.push(newWatch);

        if (
          prev != null &&
          priceUsd != null &&
          newWatch.recommendation !== "neutral" &&
          Math.abs(newWatch.changePercent ?? 0) >= THRESHOLD_PERCENT
        ) {
          notifier.notify({
            title: `Vac8: ${newWatch.recommendation === "buy_now" ? "Buy now" : "Wait"} — ${plan.title}`,
            message: `${watch.label}: ${newWatch.changePercent?.toFixed(1)}% change`,
          });
        }
        updated = true;
      } catch (e) {
        console.error(`Price check failed for ${watch.id}:`, e);
        watches.push(watch);
      }
    }

    if (updated) {
      saveVacation({ ...plan, priceWatches: watches });
    }
  }
}

export function startPriceCron(): void {
  const schedule = process.env.PRICE_CRON ?? "0 */6 * * *";
  cron.schedule(schedule, () => {
    runPriceChecks().catch((e) => console.error("Price cron error:", e));
  });
  console.log(`Price checks scheduled: ${schedule}`);
}
