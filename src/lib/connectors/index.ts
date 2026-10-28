import "server-only";
import type { Platform } from "../types";
import type { Connector, FormConnector, OAuthConnector } from "./types";
import { bluesky } from "./bluesky";
import { mastodon } from "./mastodon";
import { rss } from "./rss";
import { googleNews, publications } from "./news";
import { reddit } from "./reddit";
import { youtube } from "./youtube";
import { demo } from "./demo";

export const formConnectors: Partial<Record<Platform, FormConnector<unknown>>> = {
  bluesky: bluesky as FormConnector<unknown>,
  mastodon: mastodon as FormConnector<unknown>,
  rss: rss as FormConnector<unknown>,
  googlenews: googleNews as FormConnector<unknown>,
  news: publications as FormConnector<unknown>,
};

export const oauthConnectors: Partial<Record<Platform, OAuthConnector<unknown>>> = {
  reddit: reddit as OAuthConnector<unknown>,
  youtube: youtube as OAuthConnector<unknown>,
};

export function connectorFor(platform: Platform, mode: "live" | "demo" | "device"): Connector<unknown> {
  if (mode === "demo") return demo as Connector<unknown>;
  if (mode === "device") return { fetchPage: async () => ({ items: [], nextCursor: null }) };
  const c = formConnectors[platform] ?? oauthConnectors[platform];
  if (!c) throw new Error(`No live connector for ${platform}`);
  return c;
}

export { demoProfile } from "./demo";
export { ConnectorError } from "./http";
