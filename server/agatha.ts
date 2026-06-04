import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuid } from "uuid";
import type Anthropic from "@anthropic-ai/sdk";
import { getVacation, addMessage, listMessages } from "./db.js";
import { runTool } from "./tools.js";
import * as anthropic from "./llm/anthropic.js";
import * as openai from "./llm/openai.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const promptPath = path.join(__dirname, "..", "prompts", "agatha.md");

const SLOW_MS = 8000;
const SUGGESTIONS_NUDGE =
  "The vacation has a narrative but no suggestions yet. You must call search_web (at least one query), then add_suggestions with 2-4 items, then give a brief friendly reply and one clarifying question via set_pending_question.";

function loadSystemPrompt(planSummary: string): string {
  const base = fs.existsSync(promptPath)
    ? fs.readFileSync(promptPath, "utf-8")
    : "You are Agatha, a discerning travel agent.";
  return `${base}\n\nCurrent plan state:\n${planSummary}`;
}

function planSummary(vacationId: string): string {
  const plan = getVacation(vacationId);
  if (!plan) return "No plan.";
  return JSON.stringify(
    {
      vacationId: plan.id,
      title: plan.title,
      status: plan.status,
      narrative: plan.narrative?.slice(0, 500),
      constraints: plan.constraints,
      suggestions: plan.suggestions.map((s) => ({
        id: s.id,
        title: s.title,
        type: s.type,
        promoted: s.promoted,
        description: s.description?.slice(0, 200),
        location: s.location,
        estimatedUsd: s.estimatedUsd,
      })),
      workingPlan: plan.workingPlan.map((w) => ({
        id: w.id,
        title: w.title,
        type: w.type,
        description: w.description?.slice(0, 200),
        estimatedUsd: w.estimatedUsd,
      })),
      priceWatches: plan.priceWatches.map((w) => ({
        id: w.id,
        label: w.label,
        recommendation: w.recommendation,
      })),
      pendingQuestion: plan.agathaState.pendingQuestion,
      totals: plan.totals,
    },
    null,
    2
  );
}

function needsSuggestions(vacationId: string): boolean {
  const plan = getVacation(vacationId);
  if (!plan?.narrative) return false;
  return plan.suggestions.filter((s) => !s.promoted).length === 0;
}

type SseSend = (event: string, data: unknown) => void;

type ToolResult = { toolUseId: string; name: string; result: string };

async function runTools(
  toolCalls: anthropic.ToolCall[],
  ctx: { vacationId: string },
  send: SseSend
): Promise<ToolResult[]> {
  const toolResults: ToolResult[] = [];
  for (const tc of toolCalls) {
    send("status", { phase: "tool", tool: tc.name });
    send("tool", { name: tc.name, status: "running" });
    try {
      const out = await runTool(tc.name, tc.input, ctx);
      if (out.deleted) {
        send("vacation_deleted", { vacationId: ctx.vacationId });
        toolResults.push({ toolUseId: tc.id, name: tc.name, result: out.result });
        continue;
      }
      if (out.plan) send("plan_updated", { plan: out.plan });
      toolResults.push({ toolUseId: tc.id, name: tc.name, result: out.result });
      send("tool", { name: tc.name, status: "done", result: out.result.slice(0, 200) });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      toolResults.push({ toolUseId: tc.id, name: tc.name, result: `Error: ${err}` });
      send("tool", { name: tc.name, status: "error", result: err });
    }
  }
  return toolResults;
}

export async function runAgathaTurn(
  vacationId: string,
  userMessage: string,
  send: SseSend
): Promise<void> {
  const plan = getVacation(vacationId);
  if (!plan) throw new Error("Vacation not found");

  const now = new Date().toISOString();
  addMessage({ id: uuid(), vacationId, role: "user", content: userMessage, createdAt: now });

  const history = listMessages(vacationId).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const provider = (process.env.AGATHA_PROVIDER ?? "anthropic").toLowerCase();
  const useAnthropic = provider === "anthropic" && process.env.ANTHROPIC_API_KEY;
  const useOpenai = provider === "openai" && process.env.OPENAI_API_KEY;
  const activeProvider = useAnthropic ? "anthropic" : useOpenai ? "openai" : null;

  if (!activeProvider) {
    const fallback =
      "Agatha needs ANTHROPIC_API_KEY or OPENAI_API_KEY in .env. Add keys and restart the server.";
    send("text", { chunk: fallback });
    addMessage({ id: uuid(), vacationId, role: "assistant", content: fallback, createdAt: new Date().toISOString() });
    send("done", {});
    return;
  }

  send("status", { phase: "thinking" });
  const slowTimer = setTimeout(() => {
    send("status", {
      phase: "slow",
      message: "Give me a little more time — I'm still working on it...",
    });
  }, SLOW_MS);

  const system = loadSystemPrompt(planSummary(vacationId));
  let fullText = "";

  const onText = (chunk: string) => {
    fullText += chunk;
    send("text", { chunk });
  };

  const maxRounds = 8;
  let round = 0;

  try {
    if (activeProvider === "anthropic") {
      const turnMessages: Anthropic.MessageParam[] = history.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      let result = await anthropic.runAnthropicTurn(system, turnMessages, onText);

      while (result.toolCalls.length > 0 && round < maxRounds) {
        round++;
        const toolResults = await runTools(result.toolCalls, { vacationId }, send);
        turnMessages.push({ role: "assistant", content: result.assistantBlocks });
        turnMessages.push({
          role: "user",
          content: toolResults.map((tr) => ({
            type: "tool_result" as const,
            tool_use_id: tr.toolUseId,
            content: tr.result,
          })),
        });
        result = await anthropic.runAnthropicTurn(system, turnMessages, onText);
      }

      if (needsSuggestions(vacationId)) {
        send("status", { phase: "thinking" });
        turnMessages.push({ role: "user", content: SUGGESTIONS_NUDGE });
        let nudge = await anthropic.runAnthropicTurn(system, turnMessages, onText);
        let nudgeRound = 0;
        while (nudge.toolCalls.length > 0 && nudgeRound < 4) {
          nudgeRound++;
          const toolResults = await runTools(nudge.toolCalls, { vacationId }, send);
          turnMessages.push({ role: "assistant", content: nudge.assistantBlocks });
          turnMessages.push({
            role: "user",
            content: toolResults.map((tr) => ({
              type: "tool_result" as const,
              tool_use_id: tr.toolUseId,
              content: tr.result,
            })),
          });
          nudge = await anthropic.runAnthropicTurn(system, turnMessages, onText);
        }
      }
    } else {
      let oaMessages: openai.OpenAIMessage[] = history.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      let result = await openai.runOpenAITurn(system, oaMessages, onText);

      while (result.toolCalls.length > 0 && round < maxRounds) {
        round++;
        const toolResults = await runTools(result.toolCalls, { vacationId }, send);
        oaMessages = openai.appendOpenAIToolRound(oaMessages, result.text, result.toolCalls, toolResults);
        result = await openai.runOpenAITurn(system, oaMessages, onText);
      }

      if (needsSuggestions(vacationId)) {
        send("status", { phase: "thinking" });
        oaMessages.push({ role: "user", content: SUGGESTIONS_NUDGE });
        let nudge = await openai.runOpenAITurn(system, oaMessages, onText);
        let nudgeRound = 0;
        while (nudge.toolCalls.length > 0 && nudgeRound < 4) {
          nudgeRound++;
          const toolResults = await runTools(nudge.toolCalls, { vacationId }, send);
          oaMessages = openai.appendOpenAIToolRound(oaMessages, nudge.text, nudge.toolCalls, toolResults);
          nudge = await openai.runOpenAITurn(system, oaMessages, onText);
        }
      }
    }
  } finally {
    clearTimeout(slowTimer);
  }

  addMessage({
    id: uuid(),
    vacationId,
    role: "assistant",
    content: fullText,
    createdAt: new Date().toISOString(),
  });

  const updated = getVacation(vacationId);
  if (updated) send("plan_updated", { plan: updated });
  send("done", {});
}
