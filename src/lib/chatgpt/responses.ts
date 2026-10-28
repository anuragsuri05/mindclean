import "server-only";
import { API_BASE } from "./oauth";
import { accessToken, markStatus, revokedByServer, setModel } from "./store";

/**
 * Plan-funded inference through the public Responses API.
 * Constraints (https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference):
 * `store: false` and `stream: true` on every request; no system-role messages;
 * no sampling fields (temperature, max_output_tokens); hosted tools unavailable.
 */

export class ChatGptError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

interface ModelInfo {
  slug: string;
  display_name?: string;
  visibility?: string;
}

export async function listModels(userId: string): Promise<{ slug: string; name: string }[]> {
  const token = await accessToken(userId);
  if (!token) throw new ChatGptError("not_connected", "ChatGPT plan usage isn't connected.");
  const res = await fetch(`${API_BASE}/models`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw await toError(res);
  const body = (await res.json()) as { models?: ModelInfo[]; data?: ModelInfo[] };
  // Keep the server's ordering; only show models marked for listing.
  return (body.models ?? body.data ?? [])
    .filter((m) => !m.visibility || m.visibility === "list")
    .map((m) => ({ slug: m.slug, name: m.display_name ?? m.slug }));
}

async function toError(res: Response): Promise<ChatGptError> {
  const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string }; detail?: string };
  return new ChatGptError(body.error?.code ?? `http_${res.status}`, body.error?.message ?? body.detail ?? `ChatGPT request failed (${res.status})`, res.status);
}

/** Resolve the user's chosen model, defaulting to the first listed one. */
export async function modelFor(userId: string, preferred: string | null): Promise<string> {
  if (preferred) return preferred;
  const [first] = await listModels(userId);
  if (!first) throw new ChatGptError("no_models", "No ChatGPT models are available for this account.");
  setModel(userId, first.slug);
  return first.slug;
}

/** Streams a response and returns the full text once `response.completed` arrives. */
async function stream(token: string, body: object): Promise<string> {
  const res = await fetch(`${API_BASE}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok || !res.body) throw await toError(res);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const data = chunk
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("\n");
      if (!data || data === "[DONE]") continue;
      const event = JSON.parse(data) as { type: string; delta?: string; response?: { error?: { code?: string; message?: string } } };
      if (event.type === "response.output_text.delta") text += event.delta ?? "";
      else if (event.type === "response.completed") return text;
      else if (event.type === "response.failed" || event.type === "error") {
        const e = event.response?.error ?? (event as { code?: string; message?: string });
        throw new ChatGptError(e.code ?? "response_failed", e.message ?? "ChatGPT response failed");
      } else if (event.type === "response.incomplete") throw new ChatGptError("response_incomplete", "ChatGPT returned an incomplete response");
    }
  }
  throw new ChatGptError("stream_interrupted", "The ChatGPT stream ended before completing");
}

const LIMIT_BACKOFF_MS = 30 * 60_000;

/**
 * One instructions + user-input request on the user's ChatGPT plan. Handles a
 * single token refresh on 401 and records usage-limit / eligibility problems on
 * the connection so the UI can explain them.
 */
export async function respond(userId: string, preferredModel: string | null, instructions: string, input: string): Promise<string> {
  let token = await accessToken(userId);
  if (!token) throw new ChatGptError("not_connected", "ChatGPT plan usage isn't connected.");
  const model = await modelFor(userId, preferredModel);
  const body = { model, instructions, input: [{ role: "user", content: input }], store: false, stream: true };

  try {
    try {
      return await stream(token, body);
    } catch (err) {
      if (!(err instanceof ChatGptError) || err.status !== 401 || err.code === "subscription_sharing_invalid_user") throw err;
      token = await accessToken(userId, true);
      if (!token) throw err;
      return await stream(token, body);
    }
  } catch (err) {
    if (err instanceof ChatGptError) {
      switch (err.code) {
        case "subscription_sharing_usage_limit_exceeded":
          markStatus(userId, "limited", "You've reached the usage limit you set for Mindclean in ChatGPT.", LIMIT_BACKOFF_MS);
          break;
        case "subscription_sharing_user_not_eligible":
          markStatus(userId, "not_eligible", "ChatGPT plan usage isn't available for this account or workspace (Plus or Pro is required).");
          break;
        case "subscription_sharing_unsupported_capability":
          // Usually a model the plan can't use: forget it so the default is re-picked.
          if (preferredModel) setModel(userId, "");
          break;
        case "chatpass_v2_scope_not_authorized":
        case "chatpass_v2_invalid_authorization_context":
          revokedByServer(userId, "ChatGPT plan usage is no longer authorized. Sign in again to re-enable it.");
          break;
      }
    }
    throw err;
  }
}
