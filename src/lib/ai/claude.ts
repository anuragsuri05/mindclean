import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";

/**
 * Server-side fallback: if a request is declined by a safety classifier, the API
 * re-runs it on Anthropic's recommended fallback model instead of refusing.
 */
export const FALLBACK: { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks: "default" } = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};

let client: Anthropic | null | undefined;

/** Returns null when no Anthropic credentials are configured on the server. */
export function claude(): Anthropic | null {
  if (client === undefined) {
    client = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? new Anthropic() : null;
  }
  return client;
}

export function logClaudeError(where: string, err: unknown) {
  if (err instanceof Anthropic.RateLimitError) console.warn(`[claude:${where}] rate limited, using heuristics`);
  else if (err instanceof Anthropic.AuthenticationError) console.warn(`[claude:${where}] invalid API key, using heuristics`);
  else if (err instanceof Anthropic.APIError) console.warn(`[claude:${where}] API error ${err.status}: ${err.message}`);
  else console.warn(`[claude:${where}]`, err);
}
