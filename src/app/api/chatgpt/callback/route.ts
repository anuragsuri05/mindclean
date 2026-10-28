import { redirect } from "next/navigation";
import { get, run } from "@/lib/db";
import { hashPassword, newId, randomToken, sha256 } from "@/lib/crypto";
import { DYNAMIC_CLIENT, exchangeCode, OAuthError, verifyIdToken, type IdClaims } from "@/lib/chatgpt/oauth";
import { saveConnection, userIdForSubject } from "@/lib/chatgpt/store";

const STATE_TTL_MS = 15 * 60_000;

interface StateRow {
  user_id: string | null;
  mode: "login" | "connect";
  client_id: string;
  verifier: string;
  nonce: string;
  redirect_uri: string;
  return_origin: string;
  next: string;
  created_at: string;
}

/**
 * OAuth callback. Served on http://127.0.0.1:<port> (OpenAI requires a loopback
 * redirect), which may be a different origin from the one the user browses, so
 * it doesn't rely on cookies. It finishes sign-in, then hands off to
 * /api/chatgpt/finish on the app's own origin with a one-time ticket.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const state = params.get("state") ?? "";
  const row = get<StateRow>("SELECT * FROM chatgpt_auth_states WHERE state = ?", state);
  run("DELETE FROM chatgpt_auth_states WHERE state = ?", state);
  if (!row || Date.now() - Date.parse(row.created_at) > STATE_TTL_MS) {
    return new Response("This ChatGPT sign-in link has expired. Go back to Mindclean and try again.", { status: 400 });
  }

  const failTo = row.mode === "login" ? "/" : row.next;
  const fail = (code: string) => redirect(`${row.return_origin}${failTo}?chatgpt_error=${code}`);

  if (params.get("error")) fail(params.get("error") === "access_denied" ? "denied" : "oauth");
  const code = params.get("code");
  if (!code) fail("oauth");

  // New registrations must come back with the issued client_id; returning ones must not change it.
  const returned = params.get("client_id");
  const clientId = row.client_id === DYNAMIC_CLIENT ? returned : row.client_id;
  if (!clientId || (row.client_id !== DYNAMIC_CLIENT && returned && returned !== row.client_id)) fail("registration");

  let userId: string | null = null;
  try {
    const tokens = await exchangeCode({ clientId: clientId!, code: code!, verifier: row.verifier, redirectUri: row.redirect_uri });
    if (!tokens.id_token) throw new Error("No ID token returned");
    const claims = await verifyIdToken(tokens.id_token, clientId!, row.nonce);

    const linked = userIdForSubject(claims.sub);
    if (row.mode === "connect") {
      if (linked && linked !== row.user_id) fail("account_in_use");
      userId = row.user_id;
    } else {
      userId = linked ?? findOrCreateUser(claims);
    }
    saveConnection(userId!, clientId!, claims, tokens);
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) throw err; // let redirect() through
    console.error("[chatgpt callback]", err);
    fail(err instanceof OAuthError && err.code === "invalid_grant" ? "expired" : "exchange");
  }

  const ticket = randomToken(32);
  run(
    "INSERT INTO login_tickets (token_hash, user_id, next, client_id, expires_at) VALUES (?, ?, ?, ?, ?)",
    sha256(ticket),
    userId!,
    row.next,
    clientId!,
    new Date(Date.now() + 2 * 60_000).toISOString(),
  );
  redirect(`${row.return_origin}/api/chatgpt/finish?ticket=${ticket}`);
}

/** Login mode: link by verified email, otherwise create a passwordless Mindclean account. */
function findOrCreateUser(claims: IdClaims): string {
  const email = claims.email?.toLowerCase();
  if (email && claims.email_verified !== false) {
    const existing = get<{ id: string }>("SELECT id FROM users WHERE email = ?", email);
    if (existing) return existing.id;
  }
  const id = newId();
  run(
    "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
    id,
    email ?? `${claims.sub}@chatgpt.local`,
    claims.name ?? email?.split("@")[0] ?? "ChatGPT user",
    // Unusable password: this account signs in with ChatGPT.
    `chatgpt$${hashPassword(randomToken(32))}`,
    new Date().toISOString(),
  );
  return id;
}
