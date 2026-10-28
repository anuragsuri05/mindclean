import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "../db";

/**
 * Sign in with ChatGPT (plan usage). Implements OpenAI's open-source/local
 * flow: https://developers.openai.com/siwc/token-sharing-open-source/sign-in
 *
 * - No client secret, no API key. A first sign-in registers the app under the
 *   user's ChatGPT account (client_id=dynamic_agent_client); OpenAI returns an
 *   issued client_id that we keep and reuse.
 * - The redirect URI must be a 127.0.0.1 loopback callback, so this works when
 *   Mindclean runs on the user's own machine. Hosted deployments need OpenAI's
 *   approval and set CHATGPT_REDIRECT_URI.
 */

// Overridable only for local testing against a mock OpenAI.
export const ISSUER = process.env.CHATGPT_ISSUER ?? "https://auth.openai.com";
/** OAuth resource indicator (token audience); also the API base URL. */
export const RESOURCE = "https://api.openai.com/v1";
export const API_BASE = process.env.CHATGPT_API_BASE ?? RESOURCE;
export const PLAN_SCOPE = "chatgpt.tokens.use.direct";
export const SCOPES = `openid profile email offline_access resource.invoke ${PLAN_SCOPE}`;
export const DYNAMIC_CLIENT = "dynamic_agent_client";
export const APP_NAME = "Mindclean";

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  revocation_endpoint: string;
  jwks_uri: string;
}

let discovery: { doc: Discovery; at: number } | null = null;

export async function endpoints(): Promise<Discovery> {
  if (discovery && Date.now() - discovery.at < 3_600_000) return discovery.doc;
  const res = await fetch(`${ISSUER}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`OpenAI discovery failed (${res.status})`);
  discovery = { doc: (await res.json()) as Discovery, at: Date.now() };
  return discovery.doc;
}

/** Stable per-installation host id (`ext_agent_host_id`), persisted under .data/. */
export function hostId(): string {
  const file = path.join(dataDir(), "chatgpt-host.json");
  try {
    return (JSON.parse(fs.readFileSync(file, "utf8")) as { id: string }).id;
  } catch {
    const id = `urn:uuid:${crypto.randomUUID()}`;
    fs.writeFileSync(file, JSON.stringify({ id }), { mode: 0o600 });
    return id;
  }
}

const b64url = (buf: Buffer) => buf.toString("base64url");

export function pkce() {
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/**
 * The callback URL registered with OpenAI. Always 127.0.0.1 (never "localhost")
 * on the port the app is served from, unless an approved deployment overrides it.
 * Returns null when the app is remotely hosted without an override.
 */
export function redirectUri(requestUrl: string): string | null {
  if (process.env.CHATGPT_REDIRECT_URI) return process.env.CHATGPT_REDIRECT_URI;
  const url = new URL(process.env.APP_URL ?? requestUrl);
  if (!LOOPBACK.has(url.hostname)) return null;
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  return `http://127.0.0.1:${port}/api/chatgpt/callback`;
}

export async function authorizeUrl(p: {
  clientId: string;
  state: string;
  nonce: string;
  challenge: string;
  redirectUri: string;
  loginHint?: string | null;
}): Promise<string> {
  const params = new URLSearchParams({
    client_id: p.clientId,
    ext_agent_host_id: hostId(),
    response_type: "code",
    redirect_uri: p.redirectUri,
    scope: SCOPES,
    resource: RESOURCE,
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.challenge,
    code_challenge_method: "S256",
  });
  if (p.clientId === DYNAMIC_CLIENT) params.set("agent_name_hint", APP_NAME);
  if (p.loginHint) params.set("login_hint", p.loginHint);
  return `${(await endpoints()).authorization_endpoint}?${params}`;
}

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch((await endpoints()).token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as TokenSet & { error?: string; error_description?: string };
  if (!res.ok || json.error) throw new OAuthError(json.error ?? `http_${res.status}`, json.error_description ?? `Token request failed (${res.status})`);
  return json;
}

export const exchangeCode = (p: { clientId: string; code: string; verifier: string; redirectUri: string }) =>
  tokenRequest({
    grant_type: "authorization_code",
    client_id: p.clientId,
    code: p.code,
    code_verifier: p.verifier,
    redirect_uri: p.redirectUri,
    resource: RESOURCE,
  });

/** Omits `scope` so the original grant is retained. Refresh tokens rotate. */
export const refreshTokens = (clientId: string, refreshToken: string) =>
  tokenRequest({ grant_type: "refresh_token", client_id: clientId, refresh_token: refreshToken, resource: RESOURCE });

/** Terminal refresh failures: the grant is gone and the user must sign in again. */
export const TERMINAL_REFRESH_ERRORS = new Set([
  "invalid_grant",
  "invalid_refresh_token",
  "token_expired",
  "refresh_token_expired",
  "refresh_token_invalidated",
  "refresh_token_reused",
]);

export async function revoke(clientId: string, refreshToken: string): Promise<boolean> {
  try {
    const res = await fetch((await endpoints()).revocation_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken, token_type_hint: "refresh_token", client_id: clientId }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface IdClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

let jwks: { keys: (JsonWebKey & { kid?: string })[]; at: number } | null = null;

async function signingKey(kid: string | undefined, reload = false): Promise<crypto.KeyObject> {
  const load = async () => {
    const res = await fetch((await endpoints()).jwks_uri, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`JWKS fetch failed (${res.status})`);
    jwks = { keys: ((await res.json()) as { keys: (JsonWebKey & { kid?: string })[] }).keys, at: Date.now() };
  };
  if (reload || !jwks || Date.now() - jwks.at > 3_600_000) await load();
  let jwk = jwks!.keys.find((k) => !kid || k.kid === kid);
  if (!jwk) {
    await load(); // key rotation
    jwk = jwks!.keys.find((k) => !kid || k.kid === kid);
  }
  if (!jwk) throw new Error("No matching signing key");
  return crypto.createPublicKey({ key: jwk, format: "jwk" });
}

/** Verifies an RS256 ID token's signature, issuer, audience, expiry and nonce. */
export async function verifyIdToken(idToken: string, clientId: string, nonce: string): Promise<IdClaims> {
  const [h, p, s] = idToken.split(".");
  if (!h || !p || !s) throw new Error("Malformed ID token");
  const header = JSON.parse(Buffer.from(h, "base64url").toString()) as { alg: string; kid?: string };
  if (header.alg !== "RS256") throw new Error(`Unexpected ID token alg ${header.alg}`);
  const check = async (reload: boolean) =>
    crypto.verify("RSA-SHA256", Buffer.from(`${h}.${p}`), await signingKey(header.kid, reload), Buffer.from(s, "base64url"));
  // A cached key can be stale after rotation: refetch the JWKS once before rejecting.
  if (!(await check(false)) && !(await check(true))) throw new Error("ID token signature invalid");

  const claims = JSON.parse(Buffer.from(p, "base64url").toString()) as IdClaims & {
    iss: string;
    aud: string | string[];
    exp: number;
    nonce?: string;
  };
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== ISSUER) throw new Error("ID token issuer mismatch");
  if (!(Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(clientId)) throw new Error("ID token audience mismatch");
  if (claims.exp < now - 60) throw new Error("ID token expired");
  if (claims.nonce !== nonce) throw new Error("ID token nonce mismatch");
  return claims;
}
