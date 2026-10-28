import "server-only";
import { GOOGLE_NEWS_REGIONS, GOOGLE_NEWS_TOPICS, PUBLICATIONS } from "../platforms";
import { ConnectorError } from "./http";
import { feedConnector } from "./rss";

/** Google News public RSS: a section, or any search, in a chosen edition. */
export const googleNews = feedConnector("googlenews", (f) => {
  const region = GOOGLE_NEWS_REGIONS.find((r) => r.value === f.region) ?? GOOGLE_NEWS_REGIONS[0];
  const edition = `hl=en-${region.value}&gl=${region.value}&ceid=${region.value}:en`;
  const query = f.query?.trim();
  if (query) {
    return { url: `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&${edition}`, name: `Google News · ${query}`, handle: region.label };
  }
  const topic = GOOGLE_NEWS_TOPICS.find((t) => t.value === f.topic) ?? GOOGLE_NEWS_TOPICS[0];
  const url =
    topic.value === "TOP"
      ? `https://news.google.com/rss?${edition}`
      : `https://news.google.com/rss/headlines/section/topic/${topic.value}?${edition}`;
  return { url, name: `Google News · ${topic.label}`, handle: region.label };
});

/** Curated publications with verified public feeds. */
export const publications = feedConnector("news", (f) => {
  const pub = PUBLICATIONS.find((p) => p.value === f.publication);
  if (!pub) throw new ConnectorError("Pick a publication.");
  return { url: pub.url, name: pub.label, handle: pub.domain };
});
