import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { v4 as uuid } from "uuid";
import {
  listVacations,
  getVacation,
  saveVacation,
  deleteVacation,
  listMessages,
} from "./db.js";
import { emptyPlan, recalcTotals } from "../schema/plan.js";
import { runAgathaTurn } from "./agatha.js";
import { runTool } from "./tools.js";
import { startPriceCron } from "./jobs/price-check.js";

const app = new Hono();
const PORT = Number(process.env.PORT ?? 3847);
const HOST = process.env.HOST ?? "127.0.0.1";

app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      if (!origin) return "http://localhost:5173";
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
      return "http://localhost:5173";
    },
  })
);

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/vacations", (c) => c.json(listVacations()));

app.post("/api/vacations", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { title?: string };
  const id = uuid();
  const plan = emptyPlan(id, body.title ?? "New Vac8");
  saveVacation(plan);
  return c.json(plan, 201);
});

app.get("/api/vacations/:id", (c) => {
  const plan = getVacation(c.req.param("id"));
  if (!plan) return c.json({ error: "Not found" }, 404);
  return c.json(plan);
});

app.patch("/api/vacations/:id", async (c) => {
  const existing = getVacation(c.req.param("id"));
  if (!existing) return c.json({ error: "Not found" }, 404);
  const patch = await c.req.json();
  const merged = recalcTotals({ ...existing, ...patch, id: existing.id });
  return c.json(saveVacation(merged));
});

app.delete("/api/vacations/:id", (c) => {
  deleteVacation(c.req.param("id"));
  return c.json({ ok: true });
});

app.post("/api/vacations/:id/promote", async (c) => {
  const { suggestionId } = await c.req.json();
  const out = await runTool("promote_suggestion", { suggestionId }, { vacationId: c.req.param("id") });
  if (!out.plan) return c.json({ error: out.result }, 400);
  return c.json(out.plan);
});

app.post("/api/vacations/:id/demote", async (c) => {
  const { suggestionId } = await c.req.json();
  const out = await runTool("demote_suggestion", { suggestionId }, { vacationId: c.req.param("id") });
  if (!out.plan) return c.json({ error: out.result }, 400);
  return c.json(out.plan);
});

app.post("/api/vacations/:id/reorder/working", async (c) => {
  const { orderedIds } = await c.req.json();
  const out = await runTool(
    "reorder_working_plan",
    { orderedIds },
    { vacationId: c.req.param("id") }
  );
  if (!out.plan) return c.json({ error: out.result }, 400);
  return c.json(out.plan);
});

app.post("/api/vacations/:id/reorder/suggestions", async (c) => {
  const { orderedIds } = await c.req.json();
  const out = await runTool(
    "reorder_suggestions",
    { orderedIds },
    { vacationId: c.req.param("id") }
  );
  if (!out.plan) return c.json({ error: out.result }, 400);
  return c.json(out.plan);
});

app.get("/api/vacations/:id/messages", (c) => {
  return c.json(listMessages(c.req.param("id")));
});

app.post("/api/vacations/:id/chat", async (c) => {
  const vacationId = c.req.param("id");
  const { message } = await c.req.json();
  if (!message || typeof message !== "string") {
    return c.json({ error: "message required" }, 400);
  }

  return streamSSE(c, async (stream) => {
    const send = async (event: string, data: unknown) => {
      await stream.writeSSE({ event, data: JSON.stringify(data) });
    };

    try {
      await runAgathaTurn(vacationId, message, (event, data) => {
        void send(event, data);
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      await send("error", { message: err });
      await send("done", {});
    }
  });
});

console.log(`Vac8 API on http://${HOST}:${PORT}`);
startPriceCron();

serve({ fetch: app.fetch, hostname: HOST, port: PORT });
