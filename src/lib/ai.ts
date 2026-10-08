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
 * Ask a model for structured JSON by forcing a single tool call.
 * Returns the tool input, which the model fills to match `schema`.
 */
export async function askStructured<T>(opts: {
  model: keyof typeof MODELS;
  system: string;
  prompt: string;
  image?: ImageInput;
  toolName: string;
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
    tools: [
      {
        name: opts.toolName,
        description: "Return the result in this exact structure.",
        input_schema: opts.schema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: opts.toolName },
    messages: [{ role: "user", content }],
  });

  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("No structured result from model");
  return block.input as T;
}
