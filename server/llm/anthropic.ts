import Anthropic from "@anthropic-ai/sdk";
import { TOOL_DEFINITIONS } from "../tools.js";

const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type LlmMessage = { role: "user" | "assistant"; content: string };

export async function chatWithToolsAnthropic(
  system: string,
  messages: LlmMessage[],
  onText: (chunk: string) => void
): Promise<{
  text: string;
  toolCalls: { id: string; name: string; input: Record<string, unknown> }[];
}> {
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
  const toolCalls: { id: string; name: string; input: Record<string, unknown> }[] = [];

  for (const block of response.content) {
    if (block.type === "text") {
      text += block.text;
      onText(block.text);
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      });
    }
  }

  return { text, toolCalls };
}

export async function continueWithToolResultsAnthropic(
  system: string,
  messages: LlmMessage[],
  assistantText: string,
  toolResults: { toolUseId: string; name: string; result: string }[],
  onText: (chunk: string) => void
): Promise<{ text: string; toolCalls: { id: string; name: string; input: Record<string, unknown> }[] }> {
  const anthropic = client();

  const content: Anthropic.MessageParam["content"] = [
    ...(assistantText ? [{ type: "text" as const, text: assistantText }] : []),
    ...toolResults.map((tr) => ({
      type: "tool_result" as const,
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
  const toolCalls: { id: string; name: string; input: Record<string, unknown> }[] = [];

  for (const block of response.content) {
    if (block.type === "text") {
      text += block.text;
      onText(block.text);
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      });
    }
  }

  return { text, toolCalls };
}
