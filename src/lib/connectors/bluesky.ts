import "server-only";
import type { Media } from "../types";
import type { FormConnector, RawItem } from "./types";
import { assertPublicUrl, ConnectorError, fetchJson } from "./http";

interface BlueskyCreds {
  service: string;
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}

interface Session {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}

interface ProfileView {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

interface PostView {
  uri: string;
  author: ProfileView;
  record: { text?: string; createdAt?: string };
  embed?: {
    $type: string;
    images?: { thumb: string; fullsize: string; alt?: string }[];
    external?: { uri: string; title: string; description: string; thumb?: string };
    thumbnail?: string;
    media?: PostView["embed"];
  };
  indexedAt: string;
}

interface Timeline {
  cursor?: string;
  feed: { post: PostView }[];
}

function media(embed: PostView["embed"]): Media[] {
  if (!embed) return [];
  if (embed.media) return media(embed.media);
  if (embed.images) return embed.images.slice(0, 4).map((i) => ({ kind: "image", url: i.fullsize, thumbnail: i.thumb }));
  if (embed.$type.startsWith("app.bsky.embed.video") && embed.thumbnail) return [{ kind: "video", thumbnail: embed.thumbnail, aspect: "landscape" }];
  if (embed.external?.thumb) return [{ kind: "image", url: embed.external.thumb, aspect: "landscape" }];
  return [];
}

function toItem(post: PostView): RawItem {
  const rkey = post.uri.split("/").pop();
  return {
    platform: "bluesky",
    externalId: post.uri,
    authorName: post.author.displayName || post.author.handle,
    authorHandle: `@${post.author.handle}`,
    authorAvatar: post.author.avatar,
    title: post.embed?.external?.title,
    text: post.record.text ?? "",
    url: `https://bsky.app/profile/${post.author.handle}/post/${rkey}`,
    media: media(post.embed),
    createdAt: post.record.createdAt ?? post.indexedAt,
  };
}

async function xrpc<T>(creds: Pick<BlueskyCreds, "service">, method: string, token: string, init: RequestInit = {}) {
  return fetchJson<T>(`${creds.service}/xrpc/${method}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
}

async function refresh(creds: BlueskyCreds): Promise<BlueskyCreds> {
  const s = await xrpc<Session>(creds, "com.atproto.server.refreshSession", creds.refreshJwt, { method: "POST" });
  return { ...creds, accessJwt: s.accessJwt, refreshJwt: s.refreshJwt };
}

export const bluesky: FormConnector<BlueskyCreds> = {
  async connect(fields) {
    const service = (fields.service || "https://bsky.social").replace(/\/$/, "");
    await assertPublicUrl(service);
    if (!fields.identifier || !fields.password) throw new ConnectorError("Handle and app password are required.");
    let session: Session;
    try {
      session = await fetchJson<Session>(`${service}/xrpc/com.atproto.server.createSession`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: fields.identifier.replace(/^@/, ""), password: fields.password }),
      });
    } catch {
      throw new ConnectorError("Bluesky rejected those credentials. Double-check the handle and app password.");
    }
    const creds: BlueskyCreds = { service, ...session };
    const profile = await xrpc<ProfileView>(creds, `app.bsky.actor.getProfile?actor=${encodeURIComponent(session.did)}`, session.accessJwt);
    return {
      credentials: creds,
      profile: { displayName: profile.displayName || profile.handle, handle: `@${profile.handle}`, avatarUrl: profile.avatar ?? null },
    };
  },

  async fetchPage(creds, cursor) {
    const query = `app.bsky.feed.getTimeline?limit=40${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    let current = creds;
    let refreshed = false;
    let timeline: Timeline;
    try {
      timeline = await xrpc<Timeline>(current, query, current.accessJwt);
    } catch (err) {
      // Access tokens are short-lived; refresh once and retry.
      if (!(err instanceof ConnectorError)) throw err;
      current = await refresh(current);
      refreshed = true;
      timeline = await xrpc<Timeline>(current, query, current.accessJwt);
    }
    return {
      items: timeline.feed.map((f) => toItem(f.post)),
      nextCursor: timeline.cursor ?? null,
      credentials: refreshed ? current : undefined,
    };
  },
};
