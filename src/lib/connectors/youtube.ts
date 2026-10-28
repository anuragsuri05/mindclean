import "server-only";
import type { OAuthConnector, RawItem } from "./types";
import { ConnectorError, fetchJson, fetchText } from "./http";
import { parseFeed } from "./feedparse";

interface YouTubeCreds {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  channelIds?: string[];
  channelsFetchedAt?: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

const MAX_CHANNELS = 40;
const CHANNEL_REFRESH_MS = 24 * 3_600_000;

async function token(body: Record<string, string>) {
  return fetchJson<TokenResponse>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...body,
    }).toString(),
  });
}

const api = <T>(path: string, accessToken: string) =>
  fetchJson<T>(`https://www.googleapis.com/youtube/v3/${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });

/**
 * Subscriptions come from the Data API (1 quota unit per call); videos come from
 * each channel's public RSS feed, which costs no quota at all.
 */
async function subscriptionChannelIds(accessToken: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken = "";
  do {
    const page = await api<{ nextPageToken?: string; items: { snippet: { resourceId: { channelId: string } } }[] }>(
      `subscriptions?part=snippet&mine=true&maxResults=50&order=relevance${pageToken ? `&pageToken=${pageToken}` : ""}`,
      accessToken,
    );
    ids.push(...page.items.map((i) => i.snippet.resourceId.channelId));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken && ids.length < MAX_CHANNELS);
  return ids.slice(0, MAX_CHANNELS);
}

export const youtube: OAuthConnector<YouTubeCreds> = {
  configured: () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),

  authorizeUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/youtube.readonly",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const t = await token({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
    if (!t.refresh_token) throw new ConnectorError("Google did not return a refresh token. Remove Mindclean's access in your Google account and try again.");
    const me = await api<{ items?: { snippet: { title: string; customUrl?: string; thumbnails: { default: { url: string } } } }[] }>(
      "channels?part=snippet&mine=true",
      t.access_token,
    );
    const channel = me.items?.[0]?.snippet;
    return {
      credentials: { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: Date.now() + t.expires_in * 1000 },
      profile: {
        displayName: channel?.title ?? "YouTube",
        handle: channel?.customUrl ?? null,
        avatarUrl: channel?.thumbnails.default.url ?? null,
      },
    };
  },

  async fetchPage(creds) {
    let current = { ...creds };
    let changed = false;
    if (Date.now() > current.expiresAt - 60_000) {
      const t = await token({ grant_type: "refresh_token", refresh_token: current.refreshToken });
      current = { ...current, accessToken: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
      changed = true;
    }
    if (!current.channelIds || Date.now() - (current.channelsFetchedAt ?? 0) > CHANNEL_REFRESH_MS) {
      current.channelIds = await subscriptionChannelIds(current.accessToken);
      current.channelsFetchedAt = Date.now();
      changed = true;
    }

    const feeds = await Promise.allSettled(
      current.channelIds.map(async (id) =>
        parseFeed(await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`), "youtube", "YouTube").items,
      ),
    );
    const items: RawItem[] = feeds
      .flatMap((f) => (f.status === "fulfilled" ? f.value : []))
      // Shorts show up in channel feeds too; tag them so the UI renders them vertically.
      .map((i) => (i.url?.includes("/shorts/") ? { ...i, media: i.media.map((m) => ({ ...m, kind: "reel" as const, aspect: "portrait" as const })) } : i))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 200);

    return { items, nextCursor: null, credentials: changed ? current : undefined };
  },
};
