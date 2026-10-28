import "server-only";
import { get } from "./db";

/** Where a signed-in user should land: connect sources, then set a focus, then the feed. */
export function nextStep(userId: string): "/welcome/connect" | "/welcome/focus" | "/app" {
  const hasAccounts = get("SELECT 1 FROM accounts WHERE user_id = ? LIMIT 1", userId);
  if (!hasAccounts) return "/welcome/connect";
  const hasPlan = get("SELECT 1 FROM plans WHERE user_id = ? AND status IN ('active', 'paused', 'completed') LIMIT 1", userId);
  return hasPlan ? "/app" : "/welcome/focus";
}
