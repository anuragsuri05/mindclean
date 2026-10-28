import "server-only";
import type { Platform } from "../types";
import type { FormConnector, Profile } from "./types";
import { assertPublicUrl, ConnectorError, fetchText } from "./http";
import { favicon, parseFeed } from "./feedparse";

export interface FeedCreds {
  url: string;
  name: string;
}

/** Any RSS/Atom feed. `describe` turns form fields into a feed URL + profile. */
export function feedConnector(
  platform: Platform,
  describe: (fields: Record<string, string>) => { url: string; name?: string; handle?: string },
): FormConnector<FeedCreds> {
  return {
    async connect(fields) {
      const target = describe(fields);
      const url = await assertPublicUrl(target.url);
      let feed;
      try {
        feed = parseFeed(await fetchText(url.href), platform, url.hostname);
      } catch {
        throw new ConnectorError("Couldn't read a news feed at that address.");
      }
      if (feed.items.length === 0) throw new ConnectorError("That feed has no stories right now.");
      const name = target.name || feed.title;
      const profile: Profile = { displayName: name, handle: target.handle ?? url.hostname, avatarUrl: favicon(url.href) ?? null };
      return { credentials: { url: url.href, name }, profile };
    },

    async fetchPage(creds) {
      await assertPublicUrl(creds.url);
      const feed = parseFeed(await fetchText(creds.url), platform, creds.name);
      // Google News items carry their own publisher; other feeds are attributed to the
      // publication, with the writer (if any) as the handle.
      const items =
        platform === "googlenews"
          ? feed.items
          : feed.items.map((i) => ({
              ...i,
              authorName: creds.name,
              authorHandle: i.authorName && i.authorName !== creds.name ? i.authorName : undefined,
              authorAvatar: favicon(creds.url),
            }));
      return { items, nextCursor: null };
    },
  };
}

export const rss = feedConnector("rss", (f) => ({ url: f.url ?? "", name: f.name?.trim() }));
