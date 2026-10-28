import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { run } from "@/lib/db";
import { randomToken } from "@/lib/crypto";
import { authorizeUrl, DYNAMIC_CLIENT, pkce, redirectUri } from "@/lib/chatgpt/oauth";
import { savedClientId } from "@/lib/chatgpt/store";
import { CLIENT_COOKIE, safeNext } from "@/lib/chatgpt/flow";

/**
 * GET /api/chatgpt/start?mode=login|connect[&next=/app/profile][&fresh=1]
 * login:   "Continue with ChatGPT" creates or finds the Mindclean account.
 * connect: links ChatGPT to the signed-in account to power AI features.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const mode = params.get("mode") === "login" ? "login" : "connect";
  const user = await currentUser();
  if (mode === "connect" && !user) redirect("/");

  const next = safeNext(params.get("next"), mode === "login" ? "/app" : "/app/profile");
  const callback = redirectUri(req.url);
  if (!callback) redirect(`${mode === "login" ? "/" : next}?chatgpt_error=hosted`);

  // Reuse this person's issued registration when we know it; otherwise register.
  const remembered = (user && savedClientId(user.id)) || (await cookies()).get(CLIENT_COOKIE)?.value;
  const clientId = params.get("fresh") === "1" || !remembered ? DYNAMIC_CLIENT : remembered;

  const state = randomToken(24);
  const nonce = randomToken(24);
  const { verifier, challenge } = pkce();
  const origin = new URL(process.env.APP_URL ?? req.url).origin;
  run("DELETE FROM chatgpt_auth_states WHERE created_at < ?", new Date(Date.now() - 15 * 60_000).toISOString());
  run(
    `INSERT INTO chatgpt_auth_states (state, user_id, mode, client_id, verifier, nonce, redirect_uri, return_origin, next, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    state,
    mode === "connect" ? user!.id : null,
    mode,
    clientId,
    verifier,
    nonce,
    callback,
    origin,
    next,
    new Date().toISOString(),
  );
  redirect(await authorizeUrl({ clientId, state, nonce, challenge, redirectUri: callback, loginHint: user?.email }));
}
