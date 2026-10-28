import "server-only";
import type { SQLInputValue } from "node:sqlite";
import type { Account, Bucket, ContentCategory, FeedItem, MixedFeedItem, Plan, PlanDay, Platform } from "./types";
import { all, get, run, transaction } from "./db";
import { accountCredentials, listAccounts, markSynced, saveCredentials } from "./accounts";
import { connectorFor, ConnectorError } from "./connectors";
import { composePage, rankByAlignment } from "./engine/mixer";
import type { RawItem } from "./connectors/types";
import { scoreItems } from "./ai/classify";
import { newId, sha256 } from "./crypto";

const REFRESH_TTL_MS = 10 * 60_000;
const MAX_FETCHES_PER_SYNC = 3;
const POOL_LIMIT = 200;
const ACCOUNT_PAGE = 15;
const UNPLANNED_PAGE = 10;
const SCORE_AHEAD = 40;

/*
 * Ordering. Items keep each platform's own order. Every refresh starts a new
 * "batch"; newer batches sort first, and items inside a batch keep fetch order.
 * Both are packed into one integer: seq = (BATCH_CEIL - refreshTimeMs) * 1000 + index.
 */
const BATCH_CEIL = 10_000_000_000_000;
const MAX_BATCH_INDEX = 999;

interface ItemRow {
  id: string;
  account_id: string;
  platform: Platform;
  external_id: string;
  author_name: string;
  author_handle: string | null;
  author_avatar: string | null;
  title: string | null;
  text: string;
  url: string | null;
  media_json: string;
  category_hint: ContentCategory | null;
  created_at: string;
  topic: string | null;
  category: ContentCategory | null;
  alignment: number | null;
  scored_for: string | null;
}

const toItem = (r: ItemRow): FeedItem => ({
  id: r.id,
  accountId: r.account_id,
  platform: r.platform,
  externalId: r.external_id,
  authorName: r.author_name,
  authorHandle: r.author_handle ?? undefined,
  authorAvatar: r.author_avatar ?? undefined,
  title: r.title ?? undefined,
  text: r.text,
  url: r.url ?? undefined,
  media: JSON.parse(r.media_json),
  createdAt: r.created_at,
  categoryHint: r.category_hint ?? undefined,
  topic: r.topic,
  category: r.category ?? r.category_hint,
  alignment: r.alignment,
});

interface CursorRow {
  next_cursor: string | null;
  exhausted: number;
  batch_base: number;
  next_idx: number;
  refreshed_at: string;
}

const cursorRow = (accountId: string) => get<CursorRow>("SELECT * FROM feed_cursors WHERE account_id = ?", accountId);

function needsRefresh(accountId: string) {
  const cur = cursorRow(accountId);
  return !cur || Date.now() - Date.parse(cur.refreshed_at) > REFRESH_TTL_MS;
}

/**
 * Store a batch of items for an account. A `fresh` batch sorts ahead of
 * everything already cached; otherwise items continue the current batch.
 */
export function storeItems(account: Account, items: RawItem[], opts: { fresh: boolean; nextCursor: string | null }) {
  const cur = cursorRow(account.id);
  const fresh = opts.fresh || !cur;
  const batchBase = fresh ? BATCH_CEIL - Date.now() : cur.batch_base;
  let idx = fresh ? 0 : cur.next_idx;
  const now = new Date().toISOString();
  transaction(() => {
    for (const it of items) {
      if (idx > MAX_BATCH_INDEX) break;
      run(
        `INSERT INTO items (id, account_id, user_id, platform, external_id, author_name, author_handle, author_avatar, title, text, url, media_json, category_hint, created_at, fetched_at, seq)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           author_name = excluded.author_name, author_avatar = excluded.author_avatar, title = excluded.title,
           text = excluded.text, media_json = excluded.media_json, fetched_at = excluded.fetched_at, seq = excluded.seq`,
        `${account.id}:${it.externalId}`,
        account.id,
        account.userId,
        it.platform,
        it.externalId,
        it.authorName,
        it.authorHandle ?? null,
        it.authorAvatar ?? null,
        it.title ?? null,
        it.text,
        it.url ?? null,
        JSON.stringify(it.media),
        it.categoryHint ?? null,
        it.createdAt,
        now,
        batchBase * 1000 + idx++,
      );
    }
    run(
      `INSERT INTO feed_cursors (account_id, next_cursor, exhausted, batch_base, next_idx, refreshed_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id) DO UPDATE SET next_cursor = excluded.next_cursor, exhausted = excluded.exhausted,
         batch_base = excluded.batch_base, next_idx = excluded.next_idx,
         refreshed_at = CASE WHEN ? THEN excluded.refreshed_at ELSE feed_cursors.refreshed_at END`,
      account.id,
      opts.nextCursor,
      opts.nextCursor ? 0 : 1,
      batchBase,
      idx,
      now,
      fresh ? 1 : 0,
    );
  });
}

/** Fetch one page from the platform: a fresh batch when `refresh`, else the next page of the current batch. */
async function fetchPage(account: Account, refresh: boolean): Promise<number> {
  // The mobile app pushes these posts to /api/device/ingest; there's nothing to pull.
  if (account.mode === "device") return 0;
  const cur = cursorRow(account.id);
  const fresh = refresh || !cur;
  if (!fresh && (cur.exhausted || cur.next_idx > MAX_BATCH_INDEX)) return 0;

  const connector = connectorFor(account.platform, account.mode);
  const credentials = accountCredentials<unknown>(account.id);

  try {
    const result = await connector.fetchPage(credentials, fresh ? null : cur.next_cursor);
    if (result.credentials) saveCredentials(account.id, result.credentials);
    storeItems(account, result.items, { fresh, nextCursor: result.nextCursor });
    markSynced(account.id, null);
    return result.items.length;
  } catch (err) {
    const message = err instanceof ConnectorError ? err.message : "Couldn't reach this platform right now.";
    if (!(err instanceof ConnectorError)) console.error(`[sync ${account.platform}]`, err);
    markSynced(account.id, message);
    return 0;
  }
}

/** Cached items the user hasn't viewed yet and that this mix session hasn't served. */
function countUnseen(account: Account, excludeIds: Set<string>) {
  const n = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM items i WHERE i.account_id = ? AND NOT EXISTS (
       SELECT 1 FROM events e WHERE e.user_id = ? AND e.item_id = i.id AND e.type = 'view')`,
    account.id,
    account.userId,
  )!.n;
  const prefix = `${account.id}:`;
  return n - [...excludeIds].filter((id) => id.startsWith(prefix)).length;
}

/** Make sure at least `depth` unseen items are cached for the account, fetching more pages if needed. */
async function ensureDepth(account: Account, depth: number, exclude = new Set<string>()) {
  if (needsRefresh(account.id)) await fetchPage(account, true);
  for (let i = 0; i < MAX_FETCHES_PER_SYNC && countUnseen(account, exclude) < depth; i++) {
    if ((await fetchPage(account, false)) === 0) break;
  }
}

function pool(userId: string, accountId: string, snapshot: string, exclude: Set<string>): FeedItem[] {
  return all<ItemRow>(
    `SELECT i.* FROM items i
     WHERE i.account_id = ? AND NOT EXISTS (
       SELECT 1 FROM events e WHERE e.user_id = ? AND e.item_id = i.id AND e.type = 'view' AND e.ts < ?
     )
     ORDER BY i.seq LIMIT ?`,
    accountId,
    userId,
    snapshot,
    POOL_LIMIT + exclude.size,
  )
    .map(toItem)
    .filter((it) => !exclude.has(it.id));
}

/** Round-robin merge so several accounts in one bucket share it fairly. */
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

export const goalHash = (plan: Plan) => sha256(JSON.stringify(plan.goalProfile)).slice(0, 16);

/** Score items that haven't been scored for the plan's current goal, and write the scores back. */
async function ensureScores(userId: string, plan: Plan, items: FeedItem[]): Promise<FeedItem[]> {
  const hash = goalHash(plan);
  const ids = items.map((i) => i.id);
  const placeholders = ids.map(() => "?").join(",") || "''";
  const scored = new Set(
    all<{ id: string }>(`SELECT id FROM items WHERE scored_for = ? AND id IN (${placeholders})`, hash, ...ids).map((r) => r.id),
  );
  const todo = items.filter((i) => !scored.has(i.id));
  if (todo.length === 0) return items;

  const scores = await scoreItems(userId, plan.goalProfile, todo);
  transaction(() => {
    for (const s of scores) {
      run("UPDATE items SET topic = ?, category = ?, alignment = ?, scored_for = ? WHERE id = ?", s.topic, s.category, s.alignment, hash, s.id);
    }
  });
  const byId = new Map(scores.map((s) => [s.id, s]));
  return items.map((i) => {
    const s = byId.get(i.id);
    return s ? { ...i, topic: s.topic, category: s.category, alignment: s.alignment } : i;
  });
}

interface MixSession {
  id: string;
  page: number;
  served: string[];
  snapshot: string;
}

function loadSession(userId: string, sessionId: string | null, planId: string | null): MixSession {
  if (sessionId) {
    const row = get<{ id: string; page: number; served: string; snapshot: string; plan_id: string | null }>(
      "SELECT * FROM mix_sessions WHERE id = ? AND user_id = ?",
      sessionId,
      userId,
    );
    if (row && row.plan_id === planId) return { id: row.id, page: row.page, served: JSON.parse(row.served), snapshot: row.snapshot };
  }
  const session = { id: newId(), page: 0, served: [], snapshot: new Date().toISOString() };
  run("DELETE FROM mix_sessions WHERE user_id = ? AND created_at < ?", userId, new Date(Date.now() - 86_400_000).toISOString());
  run("INSERT INTO mix_sessions (id, user_id, plan_id, snapshot, created_at) VALUES (?, ?, ?, ?, ?)", session.id, userId, planId, session.snapshot, session.snapshot);
  return session;
}

function saveSession(s: MixSession) {
  run("UPDATE mix_sessions SET page = ?, served = ? WHERE id = ?", s.page, JSON.stringify(s.served), s.id);
}

const pageSizeFor = (plan: Plan | null) => plan?.pageSize ?? UNPLANNED_PAGE;

export interface MixPage {
  sessionId: string;
  items: MixedFeedItem[];
  caughtUp: boolean;
}

/**
 * One page of the mindful mix. A mix session remembers which items it has
 * already served, so rescoring and reranking between pages never repeats or
 * skips an item.
 */
export async function mixPage(userId: string, plan: Plan | null, today: PlanDay | null, sessionId: string | null): Promise<MixPage> {
  const accounts = listAccounts(userId);
  const session = loadSession(userId, sessionId, plan?.id ?? null);
  const served = new Set(session.served);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((a): a is Account => Boolean(a));

  const fromAccounts = plan ? pick(plan.fromAccountIds) : accounts;
  const toAccounts = plan ? pick(plan.toAccountIds) : [];
  const involved = [...fromAccounts, ...toAccounts];
  await Promise.all(involved.map((a) => ensureDepth(a, pageSizeFor(plan) * 3, served)));

  const fromPool = interleave(fromAccounts.map((a) => pool(userId, a.id, session.snapshot, served)));
  let toPool = interleave(toAccounts.map((a) => pool(userId, a.id, session.snapshot, served)));

  if (plan) {
    const scoredTo = await ensureScores(userId, plan, toPool.slice(0, SCORE_AHEAD));
    toPool = rankByAlignment([...scoredTo, ...toPool.slice(SCORE_AHEAD)]);
  }

  const ratio = plan && today ? today.ratio : 0;
  const result = composePage(fromPool, toPool, ratio, pageSizeFor(plan), { page: session.page, from: 0, to: 0 });

  session.page += 1;
  session.served.push(...result.entries.map((e) => e.item.id));
  saveSession(session);

  return {
    sessionId: session.id,
    items: result.entries.map((e) => ({ ...e.item, bucket: (plan ? e.bucket : "neutral") as Bucket })),
    caughtUp: result.caughtUp || result.entries.length === 0,
  };
}

/** The account's own feed, in the platform's order, like opening the app itself. */
export async function accountPage(account: Account, offset: number, bucket: Bucket) {
  if (offset === 0 && needsRefresh(account.id)) await fetchPage(account, true);
  await ensureDepth(account, offset + ACCOUNT_PAGE);
  const rows = all<ItemRow>("SELECT * FROM items WHERE account_id = ? ORDER BY seq LIMIT ? OFFSET ?", account.id, ACCOUNT_PAGE + 1, offset);
  const hasMore = rows.length > ACCOUNT_PAGE;
  return {
    items: rows.slice(0, ACCOUNT_PAGE).map((r) => ({ ...toItem(r), bucket })),
    nextOffset: hasMore ? offset + ACCOUNT_PAGE : null,
  };
}

export function itemOwner(userId: string, itemId: string): { accountId: string } | undefined {
  return get<{ accountId: string }>("SELECT account_id AS accountId FROM items WHERE id = ? AND user_id = ?", itemId, userId as SQLInputValue);
}

export function savedItems(userId: string): FeedItem[] {
  return all<ItemRow>(
    `SELECT i.* FROM saved_items s JOIN items i ON i.id = s.item_id WHERE s.user_id = ? ORDER BY s.saved_at DESC LIMIT 200`,
    userId,
  ).map(toItem);
}

export function savedIds(userId: string, itemIds: string[]): Set<string> {
  if (itemIds.length === 0) return new Set();
  return new Set(
    all<{ item_id: string }>(
      `SELECT item_id FROM saved_items WHERE user_id = ? AND item_id IN (${itemIds.map(() => "?").join(",")})`,
      userId,
      ...itemIds,
    ).map((r) => r.item_id),
  );
}
