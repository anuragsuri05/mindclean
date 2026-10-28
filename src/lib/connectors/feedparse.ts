import "server-only";
import { XMLParser } from "fast-xml-parser";
import type { Platform } from "../types";
import type { RawItem } from "./types";
import { clip, decodeEntities, stripHtml } from "./http";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  processEntities: false,
  htmlEntities: false,
});

type Node = Record<string, unknown> | string | undefined;

const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function text(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return decodeEntities(String(node));
  if (typeof node === "object" && "#text" in (node as Record<string, unknown>)) return text((node as Record<string, unknown>)["#text"]);
  return "";
}

function attr(node: Node, name: string): string | undefined {
  if (node && typeof node === "object") {
    const v = node[`@${name}`];
    return typeof v === "string" ? v : undefined;
  }
  return undefined;
}

export function favicon(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`;
  } catch {
    return undefined;
  }
}

function firstImage(html: string): string | undefined {
  return html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
}

export interface ParsedFeed {
  title: string;
  items: RawItem[];
}

/** Parses RSS 2.0 and Atom (including YouTube channel feeds) into RawItems. */
export function parseFeed(xml: string, platform: Platform, fallbackAuthor: string): ParsedFeed {
  const doc = parser.parse(xml) as Record<string, Record<string, unknown>>;

  if (doc.rss) {
    const channel = doc.rss.channel as Record<string, unknown>;
    const feedTitle = text(channel.title) || fallbackAuthor;
    const items = arr(channel.item as Record<string, unknown>[]).map((it): RawItem => {
      const html = text(it["content:encoded"]) || text(it.description);
      const enclosure = it.enclosure as Node;
      const thumb =
        attr(it["media:thumbnail"] as Node, "url") ??
        attr(arr(it["media:content"] as Node[])[0], "url") ??
        (attr(enclosure, "type")?.startsWith("image") ? attr(enclosure, "url") : undefined) ??
        firstImage(html);
      const link = text(it.link);
      // Google News style: <source url="https://publisher">Publisher</source>, title "Headline - Publisher".
      const source = text(it.source);
      const sourceUrl = attr(it.source as Node, "url");
      let title = text(it.title);
      if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
      let body = stripHtml(html);
      if (body.replace(/\s+/g, " ").startsWith(title.slice(0, 40))) body = "";
      return {
        platform,
        externalId: text(it.guid) || link || text(it.title),
        authorName: source || text(it["dc:creator"]) || feedTitle,
        authorHandle: source ? undefined : text(it["dc:creator"]) || undefined,
        authorAvatar: favicon(sourceUrl ?? link),
        title: clip(title, 200),
        text: clip(body, 600),
        url: link || undefined,
        media: thumb ? [{ kind: "image", url: thumb, aspect: "landscape" }] : [],
        createdAt: new Date(text(it.pubDate) || Date.now()).toISOString(),
      };
    });
    return { title: feedTitle, items };
  }

  if (doc.feed) {
    const feed = doc.feed;
    const feedTitle = text(feed.title) || fallbackAuthor;
    const items = arr(feed.entry as Record<string, unknown>[]).map((e): RawItem => {
      const links = arr(e.link as Node[]);
      const link = attr(links.find((l) => attr(l, "rel") === "alternate") ?? links[0], "href");
      const group = e["media:group"] as Record<string, unknown> | undefined;
      const videoId = text(e["yt:videoId"]);
      const html = text(e.content) || text(e.summary) || text(group?.["media:description"]);
      const thumb = attr(group?.["media:thumbnail"] as Node, "url") ?? firstImage(html);
      const author = (e.author as Record<string, unknown> | undefined)?.name;
      return {
        platform,
        externalId: text(e.id) || link || text(e.title),
        authorName: text(author) || feedTitle,
        title: clip(text(e.title), 200),
        text: clip(stripHtml(html), 600),
        url: link,
        media: videoId
          ? [{ kind: "video", thumbnail: thumb, aspect: "landscape", embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}` }]
          : thumb
            ? [{ kind: "image", url: thumb, aspect: "landscape" }]
            : [],
        createdAt: new Date(text(e.published) || text(e.updated) || Date.now()).toISOString(),
      };
    });
    return { title: feedTitle, items };
  }

  throw new Error("Not an RSS or Atom feed");
}
