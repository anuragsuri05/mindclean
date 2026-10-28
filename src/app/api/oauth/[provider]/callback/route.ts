import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { createAccount } from "@/lib/accounts";
import { oauthConnectors } from "@/lib/connectors";
import { isPlatform } from "@/lib/platforms";
import { appUrl } from "@/lib/url";

const STATE_TTL_MS = 15 * 60_000;

export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const user = await requireUser();
  const { provider } = await ctx.params;
  const params = new URL(req.url).searchParams;
  const state = params.get("state") ?? "";
  const code = params.get("code");

  const row = get<{ user_id: string; provider: string; next: string; created_at: string }>("SELECT * FROM oauth_states WHERE state = ?", state);
  run("DELETE FROM oauth_states WHERE state = ? OR created_at < ?", state, new Date(Date.now() - STATE_TTL_MS).toISOString());

  const connector = isPlatform(provider) ? oauthConnectors[provider] : undefined;
  const valid = row && row.user_id === user.id && row.provider === provider && Date.now() - Date.parse(row.created_at) < STATE_TTL_MS;
  const back = valid ? row.next : "/app/sources";
  if (!connector || !valid) redirect("/app/sources?error=invalid_state");
  if (!code) redirect(`${back}?error=${encodeURIComponent(params.get("error") ?? "denied")}`);

  let ok = true;
  try {
    const { credentials, profile } = await connector.exchangeCode(code, appUrl(req, `/api/oauth/${provider}/callback`));
    createAccount(user.id, provider as Parameters<typeof createAccount>[1], "live", profile, credentials);
  } catch (err) {
    console.error(`[oauth ${provider}]`, err);
    ok = false;
  }
  redirect(ok ? `${back}?connected=${provider}` : `${back}?error=exchange_failed`);
}
