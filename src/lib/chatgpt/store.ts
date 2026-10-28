import "server-only";
import { get, run } from "../db";
import { decryptJson, encryptJson } from "../crypto";
import { OAuthError, PLAN_SCOPE, refreshTokens, revoke, TERMINAL_REFRESH_ERRORS, type IdClaims, type TokenSet } from "./oauth";

interface Credentials {
  accessToken: string;
  refreshToken: string | null;
  idToken: string | null;
  expiresAt: number;
}

interface Row {
  user_id: string;
  client_id: string;
  subject: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  scopes: string;
  model: string | null;
  credentials_enc: string | null;
  status: string;
  error: string | null;
  limited_until: string | null;
}

/** What the UI is allowed to see; never includes tokens. */
export interface ChatGptStatus {
  connected: boolean;
  /** Signed in AND the user granted plan usage. */
  sharing: boolean;
  email: string | null;
  name: string | null;
  picture: string | null;
  model: string | null;
  status: string;
  error: string | null;
  limitedUntil: string | null;
}

const row = (userId: string) => get<Row>("SELECT * FROM chatgpt_connections WHERE user_id = ?", userId);

export function connectionStatus(userId: string): ChatGptStatus | null {
  const r = row(userId);
  if (!r) return null;
  const connected = Boolean(r.credentials_enc);
  return {
    connected,
    sharing: connected && r.scopes.split(" ").includes(PLAN_SCOPE),
    email: r.email,
    name: r.name,
    picture: r.picture,
    model: r.model,
    status: r.status,
    error: r.error,
    limitedUntil: r.limited_until && Date.parse(r.limited_until) > Date.now() ? r.limited_until : null,
  };
}

export const savedClientId = (userId: string) => row(userId)?.client_id ?? null;

export function userIdForSubject(subject: string): string | null {
  return get<{ user_id: string }>("SELECT user_id FROM chatgpt_connections WHERE subject = ?", subject)?.user_id ?? null;
}

export function saveConnection(userId: string, clientId: string, claims: IdClaims, tokens: TokenSet) {
  const now = new Date().toISOString();
  const creds: Credentials = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    idToken: tokens.id_token ?? null,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  };
  run(
    `INSERT INTO chatgpt_connections (user_id, client_id, subject, email, name, picture, scopes, credentials_enc, status, error, limited_until, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ok', NULL, NULL, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET client_id = excluded.client_id, subject = excluded.subject, email = excluded.email,
       name = excluded.name, picture = excluded.picture, scopes = excluded.scopes, credentials_enc = excluded.credentials_enc,
       status = 'ok', error = NULL, limited_until = NULL, updated_at = excluded.updated_at`,
    userId,
    clientId,
    claims.sub,
    claims.email ?? null,
    claims.name ?? null,
    claims.picture ?? null,
    tokens.scope ?? "",
    encryptJson(creds),
    now,
    now,
  );
}

export function setModel(userId: string, model: string) {
  run("UPDATE chatgpt_connections SET model = ?, updated_at = ? WHERE user_id = ?", model, new Date().toISOString(), userId);
}

export function markStatus(userId: string, status: string, error: string | null, limitedForMs = 0) {
  run(
    "UPDATE chatgpt_connections SET status = ?, error = ?, limited_until = ?, updated_at = ? WHERE user_id = ?",
    status,
    error,
    limitedForMs ? new Date(Date.now() + limitedForMs).toISOString() : null,
    new Date().toISOString(),
    userId,
  );
}

/** Drops tokens but keeps the registration (client_id) for the next sign-in. */
function clearTokens(userId: string, status: string, error: string | null) {
  run(
    "UPDATE chatgpt_connections SET credentials_enc = NULL, scopes = '', status = ?, error = ?, updated_at = ? WHERE user_id = ?",
    status,
    error,
    new Date().toISOString(),
    userId,
  );
}

export async function disconnect(userId: string): Promise<{ revoked: boolean }> {
  const r = row(userId);
  if (!r?.credentials_enc) return { revoked: true };
  const creds = decryptJson<Credentials>(r.credentials_enc);
  const revoked = creds.refreshToken ? await revoke(r.client_id, creds.refreshToken) : true;
  clearTokens(userId, "signed_out", revoked ? null : "Remote revocation was not confirmed.");
  return { revoked };
}

// Refreshes for the same user are serialized: refresh tokens rotate, so two
// concurrent refreshes would invalidate each other.
const inflight = new Map<string, Promise<string | null>>();

/** A valid access token with plan usage, refreshing when near expiry. Null when unavailable. */
export function accessToken(userId: string, force = false): Promise<string | null> {
  const pending = inflight.get(userId);
  if (pending) return pending;
  const task = (async () => {
    const r = row(userId);
    if (!r?.credentials_enc || !r.scopes.split(" ").includes(PLAN_SCOPE)) return null;
    const creds = decryptJson<Credentials>(r.credentials_enc);
    if (!force && creds.expiresAt - 120_000 > Date.now()) return creds.accessToken;
    if (!creds.refreshToken) {
      clearTokens(userId, "signed_out", "Your ChatGPT session expired. Sign in again.");
      return null;
    }
    try {
      const t = await refreshTokens(r.client_id, creds.refreshToken);
      const next: Credentials = {
        accessToken: t.access_token,
        refreshToken: t.refresh_token ?? creds.refreshToken,
        idToken: t.id_token ?? creds.idToken,
        expiresAt: Date.now() + t.expires_in * 1000,
      };
      run(
        "UPDATE chatgpt_connections SET credentials_enc = ?, scopes = COALESCE(?, scopes), status = 'ok', error = NULL, updated_at = ? WHERE user_id = ?",
        encryptJson(next),
        t.scope ?? null,
        new Date().toISOString(),
        userId,
      );
      return next.accessToken;
    } catch (err) {
      if (err instanceof OAuthError && TERMINAL_REFRESH_ERRORS.has(err.code)) {
        clearTokens(userId, "signed_out", "ChatGPT access was revoked or expired. Sign in again.");
      } else {
        // Temporary failure: keep credentials and try again on the next request.
        markStatus(userId, "error", "Couldn't reach ChatGPT. We'll retry shortly.");
      }
      return null;
    }
  })().finally(() => inflight.delete(userId));
  inflight.set(userId, task);
  return task;
}

export function revokedByServer(userId: string, message: string) {
  clearTokens(userId, "signed_out", message);
}
