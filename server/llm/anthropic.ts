import Anthropic from "@anthropic-ai/sdk";
import { TOOL_DEFINITIONS } from "../tools.js";

const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type AnthropicMessage = Anthropic.MessageParam;

export type ToolCall = { id: string; name: string; input: Record<string, unknown> };

export type AnthropicTurnResult = {
  text: string;
  toolCalls: ToolCall[];
  /** Full assistant blocks from this turn (text + tool_use) — required for the next request */
  assistantBlocks: Anthropic.ContentBlockParam[];
};

export async function runAnthropicTurn(
  system: string,
  messages: AnthropicMessage[],
  onText: (chunk: string) => void
): Promise<AnthropicTurnResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  const anthropic = client();
  const response = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system,
    messages,
    tools: TOOL_DEFINITIONS.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    })),
  });

  let text = "";
  const toolCalls: ToolCall[] = [];
  const assistantBlocks: Anthropic.ContentBlockParam[] = [];

  for (const block of response.content) {
    if (block.type === "text") {
      text += block.text;
      onText(block.text);
      assistantBlocks.push({ type: "text", text: block.text });
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      });
      assistantBlocks.push({
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      });
    }
  }

  return { text, toolCalls, assistantBlocks };
}
