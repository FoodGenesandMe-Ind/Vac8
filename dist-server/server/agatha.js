import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuid } from "uuid";
import { getVacation, addMessage, listMessages } from "./db.js";
import { runTool } from "./tools.js";
import * as anthropic from "./llm/anthropic.js";
import * as openai from "./llm/openai.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const promptPath = path.join(__dirname, "..", "prompts", "agatha.md");
function loadSystemPrompt(planSummary) {
    const base = fs.existsSync(promptPath)
        ? fs.readFileSync(promptPath, "utf-8")
        : "You are Agatha, a discerning travel agent.";
    return `${base}\n\nCurrent plan state:\n${planSummary}`;
}
function planSummary(vacationId) {
    const plan = getVacation(vacationId);
    if (!plan)
        return "No plan.";
    return JSON.stringify({
        title: plan.title,
        narrative: plan.narrative?.slice(0, 500),
        constraints: plan.constraints,
        workingPlanCount: plan.workingPlan.length,
        suggestions: plan.suggestions.filter((s) => !s.promoted).map((s) => ({ id: s.id, title: s.title })),
        pendingQuestion: plan.agathaState.pendingQuestion,
        totals: plan.totals,
        priceWatches: plan.priceWatches.length,
    }, null, 2);
}
export async function runAgathaTurn(vacationId, userMessage, send) {
    const plan = getVacation(vacationId);
    if (!plan)
        throw new Error("Vacation not found");
    const now = new Date().toISOString();
    addMessage({ id: uuid(), vacationId, role: "user", content: userMessage, createdAt: now });
    const history = listMessages(vacationId).map((m) => ({
        role: m.role,
        content: m.content,
    }));
    const provider = (process.env.AGATHA_PROVIDER ?? "anthropic").toLowerCase();
    const useAnthropic = provider === "anthropic" && process.env.ANTHROPIC_API_KEY;
    const useOpenai = provider === "openai" && process.env.OPENAI_API_KEY;
    const activeProvider = useAnthropic ? "anthropic" : useOpenai ? "openai" : null;
    if (!activeProvider) {
        const fallback = "Agatha needs ANTHROPIC_API_KEY or OPENAI_API_KEY in .env. Add keys and restart the server.";
        send("text", { chunk: fallback });
        addMessage({ id: uuid(), vacationId, role: "assistant", content: fallback, createdAt: new Date().toISOString() });
        send("done", {});
        return;
    }
    const system = loadSystemPrompt(planSummary(vacationId));
    let fullText = "";
    const onText = (chunk) => {
        fullText += chunk;
        send("text", { chunk });
    };
    const maxRounds = 6;
    let round = 0;
    let result = activeProvider === "anthropic"
        ? await anthropic.chatWithToolsAnthropic(system, history, onText)
        : await openai.chatWithToolsOpenAI(system, history, onText);
    while (result.toolCalls.length > 0 && round < maxRounds) {
        round++;
        const toolResults = [];
        for (const tc of result.toolCalls) {
            send("tool", { name: tc.name, status: "running" });
            try {
                const out = await runTool(tc.name, tc.input, { vacationId });
                if (out.plan)
                    send("plan_updated", { plan: out.plan });
                toolResults.push({ toolUseId: tc.id, name: tc.name, result: out.result });
                send("tool", { name: tc.name, status: "done", result: out.result.slice(0, 200) });
            }
            catch (e) {
                const err = e instanceof Error ? e.message : String(e);
                toolResults.push({ toolUseId: tc.id, name: tc.name, result: `Error: ${err}` });
                send("tool", { name: tc.name, status: "error", result: err });
            }
        }
        if (activeProvider === "anthropic") {
            result = await anthropic.continueWithToolResultsAnthropic(system, history, result.text, toolResults, onText);
        }
        else {
            result = await openai.continueWithToolResultsOpenAI(system, history, result.text, result.toolCalls, toolResults, onText);
        }
    }
    addMessage({
        id: uuid(),
        vacationId,
        role: "assistant",
        content: fullText,
        createdAt: new Date().toISOString(),
    });
    const updated = getVacation(vacationId);
    if (updated)
        send("plan_updated", { plan: updated });
    send("done", {});
}
