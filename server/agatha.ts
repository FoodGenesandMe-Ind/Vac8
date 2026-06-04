import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuid } from "uuid";
import type Anthropic from "@anthropic-ai/sdk";
import { getVacation, addMessage, listMessages } from "./db.js";
import { runTool, type ToolOutput } from "./tools.js";
import {
  MUTATION_TOOLS,
  requiredActionsFromUser,
  mutationSatisfiesAction,
} from "./verify.js";
import * as anthropic from "./llm/anthropic.js";
import * as openai from "./llm/openai.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const promptPath = path.join(__dirname, "..", "prompts", "agatha.md");

const SLOW_MS = 8000;
const MAX_AUDIT_RETRIES = 2;
const SUGGESTIONS_NUDGE =
  "The vacation has a narrative but no suggestions yet. You must call search_web (at least one query), then add_suggestions with 2-4 items, then give a brief friendly reply and one clarifying question via set_pending_question.";

const AUDIT_RETRY_PROMPT = (missing: string[]) =>
  `SYSTEM (mandatory): The user asked you to ${missing.join(" and ")} but that action was NOT completed and verified in the database. You must call the correct tool (e.g. demote_suggestion, promote_suggestion, update_suggestion) now. Do not tell the user it is done until the tool result includes [verified in database].`;

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

type TurnLogEntry = { tool: string; verified: boolean };

type ToolResult = { toolUseId: string; name: string; result: string };

function auditTurn(userMessage: string, turnLog: TurnLogEntry[]): { ok: boolean; missing: string[] } {
  const required = requiredActionsFromUser(userMessage);
  const missing = required.filter(
    (action) => !turnLog.some((e) => mutationSatisfiesAction(action, e))
  );
  return { ok: missing.length === 0, missing };
}

function honestFailureMessage(missing: string[]): string {
  const action = missing.join(", ");
  return (
    `I could not confirm that ${action} was saved in the database. ` +
    `Please try again here in chat, or use the Promote/Demote buttons in the center panel — those always write directly to the plan.`
  );
}

async function runTools(
  toolCalls: anthropic.ToolCall[],
  ctx: { vacationId: string },
  send: SseSend,
  turnLog: TurnLogEntry[]
): Promise<ToolResult[]> {
  const toolResults: ToolResult[] = [];
  for (const tc of toolCalls) {
    send("status", { phase: "tool", tool: tc.name });
    send("tool", { name: tc.name, status: "running" });
    try {
      const out: ToolOutput = await runTool(tc.name, tc.input, ctx);
      if (MUTATION_TOOLS.has(tc.name)) {
        turnLog.push({ tool: tc.name, verified: out.verified === true });
      }
      if (out.deleted) {
        send("vacation_deleted", { vacationId: ctx.vacationId });
        toolResults.push({ toolUseId: tc.id, name: tc.name, result: out.result });
        continue;
      }
      if (out.plan) send("plan_updated", { plan: out.plan });
      toolResults.push({ toolUseId: tc.id, name: tc.name, result: out.result });
      send("tool", {
        name: tc.name,
        status: out.verified === false ? "error" : "done",
        result: out.result.slice(0, 200),
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      if (MUTATION_TOOLS.has(tc.name)) {
        turnLog.push({ tool: tc.name, verified: false });
      }
      toolResults.push({ toolUseId: tc.id, name: tc.name, result: `Error: ${err}` });
      send("tool", { name: tc.name, status: "error", result: err });
    }
  }
  return toolResults;
}

async function runAnthropicLoop(
  system: string,
  turnMessages: Anthropic.MessageParam[],
  vacationId: string,
  send: SseSend,
  turnLog: TurnLogEntry[],
  onTextBuffer: (chunk: string) => void
): Promise<void> {
  const maxRounds = 8;
  let round = 0;
  let result = await anthropic.runAnthropicTurn(system, turnMessages, onTextBuffer);

  while (result.toolCalls.length > 0 && round < maxRounds) {
    round++;
    const toolResults = await runTools(result.toolCalls, { vacationId }, send, turnLog);
    turnMessages.push({ role: "assistant", content: result.assistantBlocks });
    turnMessages.push({
      role: "user",
      content: toolResults.map((tr) => ({
        type: "tool_result" as const,
        tool_use_id: tr.toolUseId,
        content: tr.result,
      })),
    });
    result = await anthropic.runAnthropicTurn(system, turnMessages, onTextBuffer);
  }
}

async function runOpenAILoop(
  system: string,
  oaMessages: openai.OpenAIMessage[],
  vacationId: string,
  send: SseSend,
  turnLog: TurnLogEntry[],
  onTextBuffer: (chunk: string) => void
): Promise<void> {
  const maxRounds = 8;
  let round = 0;
  let result = await openai.runOpenAITurn(system, oaMessages, onTextBuffer);

  while (result.toolCalls.length > 0 && round < maxRounds) {
    round++;
    const toolResults = await runTools(result.toolCalls, { vacationId }, send, turnLog);
    oaMessages = openai.appendOpenAIToolRound(oaMessages, result.text, result.toolCalls, toolResults);
    result = await openai.runOpenAITurn(system, oaMessages, onTextBuffer);
  }
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
  let textBuffer = "";
  const onTextBuffer = (chunk: string) => {
    textBuffer += chunk;
  };

  const turnLog: TurnLogEntry[] = [];
  let audit = { ok: true, missing: [] as string[] };
  let auditRetries = 0;

  try {
    do {
      textBuffer = "";
      const systemFresh = loadSystemPrompt(planSummary(vacationId));

      if (activeProvider === "anthropic") {
        const turnMessages: Anthropic.MessageParam[] = history.map((m) => ({
          role: m.role,
          content: m.content,
        }));
        if (auditRetries > 0) {
          turnMessages.push({ role: "user", content: AUDIT_RETRY_PROMPT(audit.missing) });
        }
        await runAnthropicLoop(systemFresh, turnMessages, vacationId, send, turnLog, onTextBuffer);

        if (needsSuggestions(vacationId) && auditRetries === 0) {
          turnMessages.push({ role: "user", content: SUGGESTIONS_NUDGE });
          await runAnthropicLoop(systemFresh, turnMessages, vacationId, send, turnLog, onTextBuffer);
        }
      } else {
        const oaMessages: openai.OpenAIMessage[] = history.map((m) => ({
          role: m.role,
          content: m.content,
        }));
        if (auditRetries > 0) {
          oaMessages.push({ role: "user", content: AUDIT_RETRY_PROMPT(audit.missing) });
        }
        await runOpenAILoop(systemFresh, oaMessages, vacationId, send, turnLog, onTextBuffer);

        if (needsSuggestions(vacationId) && auditRetries === 0) {
          oaMessages.push({ role: "user", content: SUGGESTIONS_NUDGE });
          await runOpenAILoop(systemFresh, oaMessages, vacationId, send, turnLog, onTextBuffer);
        }
      }

      audit = auditTurn(userMessage, turnLog);
      if (!audit.ok && auditRetries < MAX_AUDIT_RETRIES) {
        auditRetries++;
        send("status", { phase: "thinking" });
        continue;
      }
      break;
    } while (true);

    let fullText: string;
    if (!audit.ok) {
      fullText = honestFailureMessage(audit.missing);
    } else if (textBuffer.includes("VERIFICATION_FAILED")) {
      fullText =
        honestFailureMessage([]) +
        " (A tool reported a database verification failure.)";
    } else {
      fullText = textBuffer;
    }

    send("text", { chunk: fullText });

    addMessage({
      id: uuid(),
      vacationId,
      role: "assistant",
      content: fullText,
      createdAt: new Date().toISOString(),
    });
  } finally {
    clearTimeout(slowTimer);
  }

  const updated = getVacation(vacationId);
  if (updated) send("plan_updated", { plan: updated });
  send("done", {});
}
