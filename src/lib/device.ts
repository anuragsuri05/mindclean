import "server-only";
import { z } from "zod";
import type { Account } from "./types";
import { run } from "./db";
import { createAccount, listAccounts, markSynced } from "./accounts";
import { storeItems } from "./feed";
import { PLATFORM_BY_ID } from "./platforms";
import type { RawItem } from "./connectors/types";

/**
 * The Mindclean mobile app reads feeds on the user's phone (users log in to
 * Instagram, TikTok, LinkedIn… inside the app) and pushes the posts here over
 * the user's normal Mindclean session. Platform passwords never reach Mindclean.
 */

export const DEVICE_PLATFORMS = ["instagram", "tiktok", "linkedin", "x", "facebook", "threads", "pinterest", "youtube", "inshorts"] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];
export const isDevicePlatform = (p: string): p is DevicePlatform => (DEVICE_PLATFORMS as readonly string[]).includes(p);

const httpsUrl = z
  .string()
  .max(2000)
  .refine((u) => {
    try {
      return new URL(u).protocol === "https:";
    } catch {
      return false;
    }
  }, "https URL required");

const Item = z.object({
  externalId: z.string().min(1).max(300),
  authorName: z.string().max(200).default(""),
  authorHandle: z.string().max(200).optional(),
  authorAvatar: httpsUrl.optional().catch(undefined),
  title: z.string().max(400).optional(),
  text: z.string().max(4000).default(""),
  url: httpsUrl.optional().catch(undefined),
  media: z
    .array(
      z.object({
        kind: z.enum(["image", "video", "reel"]),
        url: httpsUrl.optional().catch(undefined),
        thumbnail: httpsUrl.optional().catch(undefined),
        embedUrl: httpsUrl.optional().catch(undefined),
        aspect: z.enum(["square", "portrait", "landscape"]).optional(),
      }),
    )
    .max(4)
    .default([]),
  createdAt: z.string().max(40).optional(),
});

export const IngestBody = z.object({
  platform: z.string(),
  status: z.enum(["ok", "needs_login", "error"]),
  error: z.string().max(300).optional(),
  items: z.array(z.unknown()).max(80).default([]),
});

/**
 * The account a phone-synced platform lands in. A sample (demo) account for the
 * same platform is upgraded in place, so plans that reference it keep working.
 */
function deviceAccount(userId: string, platform: DevicePlatform): Account {
  const accounts = listAccounts(userId).filter((a) => a.platform === platform);
  const existing = accounts.find((a) => a.mode === "device");
  if (existing) return existing;
  const name = `${PLATFORM_BY_ID[platform].name} · your feed`;
  const demo = accounts.find((a) => a.mode === "demo");
  if (demo) {
    run("DELETE FROM items WHERE account_id = ?", demo.id);
    run("DELETE FROM feed_cursors WHERE account_id = ?", demo.id);
    run("UPDATE accounts SET mode = 'device', display_name = ?, handle = 'via the Mindclean app', credentials_enc = NULL WHERE id = ?", name, demo.id);
    return { ...demo, mode: "device", displayName: name, handle: "via the Mindclean app" };
  }
  return createAccount(userId, platform, "device", { displayName: name, handle: "via the Mindclean app", avatarUrl: null }, null);
}

export function ingest(userId: string, body: z.infer<typeof IngestBody>): { accepted: number; rejected: number } {
  if (!isDevicePlatform(body.platform)) throw new Error("unsupported_platform");
  const platform = body.platform;
  const account = deviceAccount(userId, platform);

  if (body.status === "needs_login") {
    markSynced(account.id, `Log in to ${PLATFORM_BY_ID[platform].name} in the Mindclean app so it can read your feed.`);
    return { accepted: 0, rejected: 0 };
  }
  if (body.status === "error") {
    markSynced(account.id, body.error ? `Couldn't read your ${PLATFORM_BY_ID[platform].name} feed: ${body.error}` : `Couldn't read your ${PLATFORM_BY_ID[platform].name} feed.`);
    return { accepted: 0, rejected: 0 };
  }

  const items: RawItem[] = [];
  let rejected = 0;
  for (const raw of body.items) {
    const parsed = Item.safeParse(raw);
    if (!parsed.success) {
      rejected++;
      continue;
    }
    const it = parsed.data;
    const created = it.createdAt && !Number.isNaN(Date.parse(it.createdAt)) ? new Date(it.createdAt).toISOString() : new Date().toISOString();
    if (!it.text && !it.title && it.media.length === 0) {
      rejected++;
      continue;
    }
    items.push({
      platform,
      externalId: it.externalId,
      authorName: it.authorName || PLATFORM_BY_ID[platform].name,
      authorHandle: it.authorHandle,
      authorAvatar: it.authorAvatar,
      title: it.title,
      text: it.text,
      url: it.url,
      media: it.media,
      createdAt: created,
    });
  }
  if (items.length > 0) storeItems(account, items, { fresh: true, nextCursor: null });
  markSynced(account.id, items.length > 0 ? null : `No posts found on your ${PLATFORM_BY_ID[platform].name} feed this time.`);
  return { accepted: items.length, rejected };
}

/** Disconnect: drop the account and its cached posts. */
export function removeDeviceAccount(userId: string, platform: DevicePlatform) {
  run("DELETE FROM accounts WHERE user_id = ? AND platform = ? AND mode = 'device'", userId, platform);
}
