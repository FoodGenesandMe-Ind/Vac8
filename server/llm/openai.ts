import OpenAI from "openai";
import { TOOL_DEFINITIONS } from "../tools.js";

const client = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type LlmMessage = { role: "user" | "assistant"; content: string };

const openAiTools = TOOL_DEFINITIONS.map((t) => ({
  type: "function" as const,
  function: {
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  },
}));

export async function chatWithToolsOpenAI(
  system: string,
  messages: LlmMessage[],
  onText: (chunk: string) => void
): Promise<{
  text: string;
  toolCalls: { id: string; name: string; input: Record<string, unknown> }[];
}> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");

  const openai = client();
  const res = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [{ role: "system", content: system }, ...messages],
    tools: openAiTools,
  });

  const choice = res.choices[0]?.message;
  let text = choice?.content ?? "";
  if (text) onText(text);

  const toolCalls: { id: string; name: string; input: Record<string, unknown> }[] = [];
  for (const tc of choice?.tool_calls ?? []) {
    if (tc.type === "function") {
      toolCalls.push({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>,
      });
    }
  }

  return { text, toolCalls };
}

export async function continueWithToolResultsOpenAI(
  system: string,
  messages: LlmMessage[],
  assistantText: string,
  toolCalls: { id: string; name: string; input: Record<string, unknown> }[],
  toolResults: { toolUseId: string; name: string; result: string }[],
  onText: (chunk: string) => void
): Promise<{ text: string; toolCalls: { id: string; name: string; input: Record<string, unknown> }[] }> {
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
          type: "function" as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.input) },
        })),
      },
      ...toolResults.map((tr) => ({
        role: "tool" as const,
        tool_call_id: tr.toolUseId,
        content: tr.result,
      })),
    ],
    tools: openAiTools,
  });

  const choice = res.choices[0]?.message;
  let text = choice?.content ?? "";
  if (text) onText(text);

  const newToolCalls: { id: string; name: string; input: Record<string, unknown> }[] = [];
  for (const tc of choice?.tool_calls ?? []) {
    if (tc.type === "function") {
      newToolCalls.push({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>,
      });
    }
  }

  return { text, toolCalls: newToolCalls };
}
