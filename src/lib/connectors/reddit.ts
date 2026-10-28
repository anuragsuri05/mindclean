import "server-only";
import type { Media } from "../types";
import type { OAuthConnector, RawItem } from "./types";
import { ConnectorError, decodeEntities, fetchJson } from "./http";

interface RedditCreds {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  error?: string;
}

interface Post {
  name: string;
  title: string;
  selftext: string;
  author: string;
  subreddit_name_prefixed: string;
  permalink: string;
  url: string;
  created_utc: number;
  over_18: boolean;
  is_video: boolean;
  thumbnail?: string;
  preview?: { images: { source: { url: string; width: number; height: number } }[] };
}

interface Listing {
  data: { after: string | null; children: { kind: string; data: Post }[] };
}

const basicAuth = () =>
  `Basic ${Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString("base64")}`;

async function token(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetchJson<TokenResponse>("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  if (res.error) throw new ConnectorError(`Reddit OAuth error: ${res.error}`, true);
  return res;
}

async function fresh(creds: RedditCreds): Promise<RedditCreds | null> {
  if (Date.now() < creds.expiresAt - 60_000) return null;
  const t = await token({ grant_type: "refresh_token", refresh_token: creds.refreshToken });
  return { accessToken: t.access_token, refreshToken: t.refresh_token ?? creds.refreshToken, expiresAt: Date.now() + t.expires_in * 1000 };
}

function media(post: Post): Media[] {
  const src = post.preview?.images[0]?.source;
  if (!src) return [];
  const aspect = src.height > src.width * 1.15 ? "portrait" : src.width > src.height * 1.15 ? "landscape" : "square";
  return [{ kind: post.is_video ? "video" : "image", url: decodeEntities(src.url), thumbnail: decodeEntities(src.url), aspect }];
}

function toItem(post: Post): RawItem {
  return {
    platform: "reddit",
    externalId: post.name,
    authorName: post.subreddit_name_prefixed,
    authorHandle: `u/${post.author}`,
    title: decodeEntities(post.title),
    text: decodeEntities(post.selftext).slice(0, 600),
    url: `https://www.reddit.com${post.permalink}`,
    media: media(post),
    createdAt: new Date(post.created_utc * 1000).toISOString(),
  };
}

export const reddit: OAuthConnector<RedditCreds> = {
  configured: () => Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET),

  authorizeUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: process.env.REDDIT_CLIENT_ID!,
      response_type: "code",
      state,
      redirect_uri: redirectUri,
      duration: "permanent",
      scope: "identity read mysubreddits",
    });
    return `https://www.reddit.com/api/v1/authorize?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const t = await token({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
    if (!t.refresh_token) throw new ConnectorError("Reddit did not return a refresh token.");
    const creds: RedditCreds = { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: Date.now() + t.expires_in * 1000 };
    const me = await fetchJson<{ name: string; icon_img?: string }>("https://oauth.reddit.com/api/v1/me", {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    });
    return {
      credentials: creds,
      profile: { displayName: `u/${me.name}`, handle: `u/${me.name}`, avatarUrl: me.icon_img ? decodeEntities(me.icon_img) : null },
    };
  },

  async fetchPage(creds, cursor) {
    const updated = await fresh(creds);
    const current = updated ?? creds;
    const listing = await fetchJson<Listing>(`https://oauth.reddit.com/best?limit=50&raw_json=1${cursor ? `&after=${cursor}` : ""}`, {
      headers: { Authorization: `Bearer ${current.accessToken}` },
    });
    return {
      items: listing.data.children.filter((c) => c.kind === "t3" && !c.data.over_18).map((c) => toItem(c.data)),
      nextCursor: listing.data.after,
      credentials: updated ?? undefined,
    };
  },
};
