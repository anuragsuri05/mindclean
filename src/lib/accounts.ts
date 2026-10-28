import "server-only";
import type { Account, Platform } from "./types";
import { all, get, run } from "./db";
import { decryptJson, encryptJson, newId } from "./crypto";
import type { Profile } from "./connectors/types";

interface AccountRow {
  id: string;
  user_id: string;
  platform: Platform;
  mode: Account["mode"];
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
  credentials_enc: string | null;
  status: "ok" | "error";
  error: string | null;
  last_synced_at: string | null;
  created_at: string;
}

const toAccount = (r: AccountRow): Account => ({
  id: r.id,
  userId: r.user_id,
  platform: r.platform,
  mode: r.mode,
  displayName: r.display_name,
  handle: r.handle,
  avatarUrl: r.avatar_url,
  status: r.status,
  error: r.error,
  lastSyncedAt: r.last_synced_at,
  createdAt: r.created_at,
});

export function listAccounts(userId: string): Account[] {
  return all<AccountRow>("SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at", userId).map(toAccount);
}

export function getAccount(userId: string, id: string): Account | null {
  const row = get<AccountRow>("SELECT * FROM accounts WHERE id = ? AND user_id = ?", id, userId);
  return row ? toAccount(row) : null;
}

export function accountCredentials<C>(id: string): C | null {
  const row = get<{ credentials_enc: string | null }>("SELECT credentials_enc FROM accounts WHERE id = ?", id);
  return row?.credentials_enc ? decryptJson<C>(row.credentials_enc) : null;
}

export function createAccount(userId: string, platform: Platform, mode: Account["mode"], profile: Profile, credentials: unknown): Account {
  const id = newId();
  run(
    `INSERT INTO accounts (id, user_id, platform, mode, display_name, handle, avatar_url, credentials_enc, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    userId,
    platform,
    mode,
    profile.displayName,
    profile.handle,
    profile.avatarUrl,
    encryptJson(credentials),
    new Date().toISOString(),
  );
  return getAccount(userId, id)!;
}

export function saveCredentials(id: string, credentials: unknown) {
  run("UPDATE accounts SET credentials_enc = ? WHERE id = ?", encryptJson(credentials), id);
}

export function markSynced(id: string, error: string | null) {
  run(
    "UPDATE accounts SET status = ?, error = ?, last_synced_at = ? WHERE id = ?",
    error ? "error" : "ok",
    error,
    new Date().toISOString(),
    id,
  );
}

export function deleteAccount(userId: string, id: string): boolean {
  return Number(run("DELETE FROM accounts WHERE id = ? AND user_id = ?", id, userId).changes) > 0;
}
