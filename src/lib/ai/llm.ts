import "server-only";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { claude, FALLBACK, logClaudeError, MODEL as CLAUDE_MODEL } from "./claude";
import { connectionStatus } from "../chatgpt/store";
import { ChatGptError, respond } from "../chatgpt/responses";
import { extractJson } from "./json";

export type AiSource = "chatgpt" | "claude" | "heuristic";

export interface StructuredTask<S extends z.ZodType> {
  /** Used in logs only. */
  name: string;
  instructions: string;
  input: string;
  schema: S;
  maxTokens: number;
}

async function viaChatGpt<S extends z.ZodType>(userId: string, model: string | null, task: StructuredTask<S>): Promise<z.infer<S>> {
  const schema = JSON.stringify(z.toJSONSchema(task.schema));
  const instructions = `${task.instructions}\n\nRespond with a single JSON object and nothing else (no prose, no code fences). It must match this JSON Schema:\n${schema}`;
  let lastError: unknown;
  // One retry if the model's JSON doesn't validate.
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await respond(userId, model, instructions, task.input);
    try {
      return task.schema.parse(extractJson(text));
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function viaClaude<S extends z.ZodType>(task: StructuredTask<S>): Promise<z.infer<S> | null> {
  const ai = claude();
  if (!ai) return null;
  const response = await ai.beta.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: task.maxTokens,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(task.schema) },
    system: [{ type: "text", text: task.instructions, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: task.input }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) return null;
  return response.parsed_output as z.infer<S>;
}

/**
 * Runs a structured task on the best available model:
 * 1. the user's own ChatGPT plan (Sign in with ChatGPT), with no API key needed;
 * 2. Claude, if the server has an Anthropic key;
 * 3. null, so the caller uses its keyword heuristic.
 */
export async function generate<S extends z.ZodType>(userId: string, task: StructuredTask<S>): Promise<{ data: z.infer<S>; source: AiSource } | null> {
  const chatgpt = connectionStatus(userId);
  if (chatgpt?.sharing && !chatgpt.limitedUntil) {
    try {
      return { data: await viaChatGpt(userId, chatgpt.model, task), source: "chatgpt" };
    } catch (err) {
      console.warn(`[chatgpt:${task.name}]`, err instanceof ChatGptError ? `${err.code}: ${err.message}` : err);
    }
  }
  try {
    const data = await viaClaude(task);
    if (data) return { data, source: "claude" };
  } catch (err) {
    logClaudeError(task.name, err);
  }
  return null;
}
