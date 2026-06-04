import OpenAI from "openai";
import { TOOL_DEFINITIONS } from "../tools.js";
const client = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const openAiTools = TOOL_DEFINITIONS.map((t) => ({
    type: "function",
    function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
    },
}));
export async function chatWithToolsOpenAI(system, messages, onText) {
    if (!process.env.OPENAI_API_KEY)
        throw new Error("OPENAI_API_KEY not set");
    const openai = client();
    const res = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        messages: [{ role: "system", content: system }, ...messages],
        tools: openAiTools,
    });
    const choice = res.choices[0]?.message;
    let text = choice?.content ?? "";
    if (text)
        onText(text);
    const toolCalls = [];
    for (const tc of choice?.tool_calls ?? []) {
        if (tc.type === "function") {
            toolCalls.push({
                id: tc.id,
                name: tc.function.name,
                input: JSON.parse(tc.function.arguments || "{}"),
            });
        }
    }
    return { text, toolCalls };
}
export async function continueWithToolResultsOpenAI(system, messages, assistantText, toolCalls, toolResults, onText) {
    const openai = client();
    const res = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        messages: [
            { role: "system", content: system },
            ...messages,
            {
                role: "assistant",
                content: assistantText || null,
                tool_calls: toolCalls.map((tc) => ({
                    id: tc.id,
                    type: "function",
                    function: { name: tc.name, arguments: JSON.stringify(tc.input) },
                })),
            },
            ...toolResults.map((tr) => ({
                role: "tool",
                tool_call_id: tr.toolUseId,
                content: tr.result,
            })),
        ],
        tools: openAiTools,
    });
    const choice = res.choices[0]?.message;
    let text = choice?.content ?? "";
    if (text)
        onText(text);
    const newToolCalls = [];
    for (const tc of choice?.tool_calls ?? []) {
        if (tc.type === "function") {
            newToolCalls.push({
                id: tc.id,
                name: tc.function.name,
                input: JSON.parse(tc.function.arguments || "{}"),
            });
        }
    }
    return { text, toolCalls: newToolCalls };
}
