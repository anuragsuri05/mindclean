import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { run } from "@/lib/db";
import { randomToken } from "@/lib/crypto";
import { oauthConnectors } from "@/lib/connectors";
import { isPlatform } from "@/lib/platforms";
import { appUrl } from "@/lib/url";
import { safeNext } from "@/lib/chatgpt/flow";

export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const user = await requireUser();
  const { provider } = await ctx.params;
  const connector = isPlatform(provider) ? oauthConnectors[provider] : undefined;
  const next = safeNext(new URL(req.url).searchParams.get("next"), "/app/sources");
  if (!connector) redirect(`${next}?error=unknown_provider`);
  if (!connector.configured()) redirect(`${next}?error=not_configured&provider=${provider}`);

  const state = randomToken(24);
  run("INSERT INTO oauth_states (state, user_id, provider, next, created_at) VALUES (?, ?, ?, ?, ?)", state, user.id, provider, next, new Date().toISOString());
  redirect(connector.authorizeUrl(state, appUrl(req, `/api/oauth/${provider}/callback`)));
}
