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
