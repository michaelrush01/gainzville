import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Every AI call goes through this file, so models or providers can be swapped in one place.
export const MODELS = {
  chat: "claude-haiku-5-5",
  vision: "claude-sonnet-5-5",
} as const;

let client: Anthropic | null = null;

export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getClient() {
  if (!client) client = new Anthropic(); // reads ANTHROPIC_API_KEY from the server environment
  return client;
}

type ImageInput = { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" };

/**
 * Ask a model for JSON that matches `schema`, using Claude's structured outputs.
 */
export async function askStructured<T>(opts: {
  model: keyof typeof MODELS;
  system: string;
  prompt: string;
  image?: ImageInput;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const content: Anthropic.ContentBlockParam[] = [];
  if (opts.image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: opts.image.mediaType, data: opts.image.base64 },
    });
  }
  content.push({ type: "text", text: opts.prompt });

  const res = await getClient().messages.create({
    model: MODELS[opts.model],
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.system,
    output_config: { effort: "low", format: { type: "json_schema", schema: opts.schema } },
    messages: [{ role: "user", content }],
  });

  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("No result from model");
  return JSON.parse(text.text) as T;
}

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type ToolCall = { name: string; input: Record<string, unknown> };

/**
 * One chat reply. The model may call tools (change the plan, point at stores). We don't run them here:
 * we acknowledge them so the model can finish its answer, and hand the calls to the app to act on.
 */
export async function chatReply(opts: {
  system: string;
  messages: ChatTurn[];
  tools: Anthropic.Tool[];
  toolAck: (call: ToolCall) => string;
  maxTokens?: number;
}): Promise<{ text: string; toolCalls: ToolCall[] }> {
  const messages: Anthropic.MessageParam[] = opts.messages.map((m) => ({ role: m.role, content: m.content }));
  const toolCalls: ToolCall[] = [];
  const texts: string[] = [];

  for (let round = 0; round < 3; round++) {
    const res = await getClient().messages.create({
      model: MODELS.chat,
      max_tokens: opts.maxTokens ?? 1600,
      system: opts.system,
      tools: opts.tools,
      messages,
    });
    for (const b of res.content) {
      if (b.type === "text" && b.text.trim()) texts.push(b.text.trim());
      if (b.type === "tool_use") toolCalls.push({ name: b.name, input: b.input as Record<string, unknown> });
    }
    if (res.stop_reason === "max_tokens") console.warn("chat reply hit max_tokens");
    if (res.stop_reason !== "tool_use") break;

    // Acknowledge each tool call so the model can write the rest of its answer
    messages.push({ role: "assistant", content: res.content });
    messages.push({
      role: "user",
      content: res.content.flatMap((b) =>
        b.type === "tool_use"
          ? [{ type: "tool_result" as const, tool_use_id: b.id, content: opts.toolAck({ name: b.name, input: b.input as Record<string, unknown> }) }]
          : [],
      ),
    });
  }
  return { text: texts.join("\n\n"), toolCalls };
}

/**
 * Research on the live web, then answer as JSON matching `schema`. Uses Claude's server-side
 * web search and fetch tools (Anthropic runs them; we never scrape sites ourselves).
 */
export async function researchStructured<T>(opts: {
  model: keyof typeof MODELS;
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  maxSearches: number;
  maxFetches: number;
  maxTokens?: number;
}): Promise<{ result: T; searches: number }> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.prompt }];
  let searches = 0;
  for (let round = 0; round < 4; round++) {
    const res = await getClient().messages.create({
      model: MODELS[opts.model],
      max_tokens: opts.maxTokens ?? 16000,
      system: opts.system,
      tools: [
        { type: "web_search_20260318", name: "web_search", max_uses: opts.maxSearches },
        { type: "web_fetch_20260318", name: "web_fetch", max_uses: opts.maxFetches, max_content_tokens: 10000 },
      ],
      output_config: { format: { type: "json_schema", schema: opts.schema } },
      messages,
    });
    searches += res.usage.server_tool_use?.web_search_requests ?? 0;
    console.log(`research round ${round}: ${res.usage.input_tokens} in, ${res.usage.output_tokens} out, ${searches} searches, ${res.stop_reason}`);
    // Long searches can pause partway; send the turn back so the model continues
    if (res.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: res.content });
      continue;
    }
    if (res.stop_reason === "max_tokens") throw new Error("Research answer was cut off (max_tokens)");
    const text = res.content.filter((b) => b.type === "text").pop();
    if (!text || text.type !== "text") throw new Error(`No research result (${res.stop_reason})`);
    return { result: JSON.parse(text.text) as T, searches };
  }
  throw new Error("Research didn't finish");
}
