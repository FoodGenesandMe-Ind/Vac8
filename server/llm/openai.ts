import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { TOOL_DEFINITIONS } from "../tools.js";

const client = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type OpenAIMessage = ChatCompletionMessageParam;

export type ToolCall = { id: string; name: string; input: Record<string, unknown> };

const openAiTools = TOOL_DEFINITIONS.map((t) => ({
  type: "function" as const,
  function: {
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  },
}));

export type OpenAITurnResult = {
  text: string;
  toolCalls: ToolCall[];
};

export async function runOpenAITurn(
  system: string,
  messages: OpenAIMessage[],
  onText: (chunk: string) => void
): Promise<OpenAITurnResult> {
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

  const toolCalls: ToolCall[] = [];
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

/** Append assistant tool-call message + tool results to messages for the next turn */
export function appendOpenAIToolRound(
  messages: OpenAIMessage[],
  assistantText: string,
  toolCalls: ToolCall[],
  toolResults: { toolUseId: string; result: string }[]
): OpenAIMessage[] {
  return [
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
  ];
}
