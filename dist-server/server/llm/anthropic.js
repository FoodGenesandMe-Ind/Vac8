import Anthropic from "@anthropic-ai/sdk";
import { TOOL_DEFINITIONS } from "../tools.js";
const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export async function chatWithToolsAnthropic(system, messages, onText) {
    const anthropic = client();
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY not set");
    }
    const response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        tools: TOOL_DEFINITIONS.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema,
        })),
    });
    let text = "";
    const toolCalls = [];
    for (const block of response.content) {
        if (block.type === "text") {
            text += block.text;
            onText(block.text);
        }
        else if (block.type === "tool_use") {
            toolCalls.push({
                id: block.id,
                name: block.name,
                input: block.input,
            });
        }
    }
    return { text, toolCalls };
}
export async function continueWithToolResultsAnthropic(system, messages, assistantText, toolResults, onText) {
    const anthropic = client();
    const content = [
        ...(assistantText ? [{ type: "text", text: assistantText }] : []),
        ...toolResults.map((tr) => ({
            type: "tool_result",
            tool_use_id: tr.toolUseId,
            content: tr.result,
        })),
    ];
    const response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system,
        messages: [
            ...messages.map((m) => ({ role: m.role, content: m.content })),
            { role: "assistant", content },
        ],
        tools: TOOL_DEFINITIONS.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema,
        })),
    });
    let text = "";
    const toolCalls = [];
    for (const block of response.content) {
        if (block.type === "text") {
            text += block.text;
            onText(block.text);
        }
        else if (block.type === "tool_use") {
            toolCalls.push({
                id: block.id,
                name: block.name,
                input: block.input,
            });
        }
    }
    return { text, toolCalls };
}
