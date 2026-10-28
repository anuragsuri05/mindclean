import type { Platform } from "./types";

export type ConnectKind = "oauth" | "form" | "demo";
export type PlatformGroup = "social" | "professional" | "news";

export interface FormField {
  name: string;
  label: string;
  type: "text" | "password" | "url" | "select";
  placeholder?: string;
  help?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
}

export interface PlatformInfo {
  id: Platform;
  name: string;
  color: string;
  group: PlatformGroup;
  /** One-line description on the Connect page. */
  tagline: string;
  /** How a user can connect today. "demo" = no official API for reading a personal feed. */
  connect: ConnectKind;
  fields?: FormField[];
  /** Can be connected more than once (e.g. several publications). */
  multiple?: boolean;
  /** Why it works the way it does. */
  note: string;
}

/** Curated publications with public RSS feeds (verified Oct 2026). */
export const PUBLICATIONS = [
  { value: "bbc", label: "BBC News", url: "https://feeds.bbci.co.uk/news/rss.xml", domain: "bbc.com" },
  { value: "guardian", label: "The Guardian", url: "https://www.theguardian.com/international/rss", domain: "theguardian.com" },
  { value: "npr", label: "NPR", url: "https://feeds.npr.org/1001/rss.xml", domain: "npr.org" },
  { value: "techcrunch", label: "TechCrunch", url: "https://techcrunch.com/feed/", domain: "techcrunch.com" },
  { value: "verge", label: "The Verge", url: "https://www.theverge.com/rss/index.xml", domain: "theverge.com" },
  { value: "wired", label: "Wired", url: "https://www.wired.com/feed/rss", domain: "wired.com" },
  { value: "hn", label: "Hacker News", url: "https://hnrss.org/frontpage", domain: "news.ycombinator.com" },
  { value: "bloomberg", label: "Bloomberg Markets", url: "https://feeds.bloomberg.com/markets/news.rss", domain: "bloomberg.com" },
  { value: "hindu", label: "The Hindu", url: "https://www.thehindu.com/news/national/feeder/default.rss", domain: "thehindu.com" },
  { value: "et", label: "The Economic Times", url: "https://economictimes.indiatimes.com/rssfeedstopstories.cms", domain: "economictimes.indiatimes.com" },
  { value: "mint", label: "Mint", url: "https://www.livemint.com/rss/news", domain: "livemint.com" },
  { value: "indianexpress", label: "The Indian Express", url: "https://indianexpress.com/feed/", domain: "indianexpress.com" },
] as const;

export const GOOGLE_NEWS_TOPICS = [
  { value: "TOP", label: "Top stories" },
  { value: "WORLD", label: "World" },
  { value: "NATION", label: "Your country" },
  { value: "BUSINESS", label: "Business" },
  { value: "TECHNOLOGY", label: "Technology" },
  { value: "SCIENCE", label: "Science" },
  { value: "HEALTH", label: "Health" },
  { value: "ENTERTAINMENT", label: "Entertainment" },
  { value: "SPORTS", label: "Sports" },
] as const;

export const GOOGLE_NEWS_REGIONS = [
  { value: "IN", label: "India" },
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "AU", label: "Australia" },
  { value: "CA", label: "Canada" },
  { value: "SG", label: "Singapore" },
] as const;

const demoNote = (why: string) => `${why} Log in to it in the Mindclean app to see your real feed; on the website it shows a sample feed.`;

export const PLATFORMS: PlatformInfo[] = [
  // Social & entertainment
  {
    id: "instagram",
    name: "Instagram",
    color: "#e1306c",
    group: "social",
    tagline: "Reels, posts and stories",
    connect: "demo",
    note: demoNote("Instagram's API doesn't give apps access to your home feed or Reels."),
  },
  {
    id: "tiktok",
    name: "TikTok",
    color: "#111111",
    group: "social",
    tagline: "Short videos",
    connect: "demo",
    note: demoNote("TikTok's API only returns your own videos, not your For You feed."),
  },
  {
    id: "youtube",
    name: "YouTube",
    color: "#ff0000",
    group: "social",
    tagline: "Subscriptions, Shorts and long-form",
    connect: "oauth",
    note: "Live: latest videos from your subscriptions, read-only via Google sign-in.",
  },
  {
    id: "snapchat",
    name: "Snapchat",
    color: "#f7d000",
    group: "social",
    tagline: "Spotlight and Stories",
    connect: "demo",
    note: demoNote("Snapchat has no public API for Stories or Spotlight."),
  },
  {
    id: "facebook",
    name: "Facebook",
    color: "#1877f2",
    group: "social",
    tagline: "Feed, groups and videos",
    connect: "demo",
    note: demoNote("Facebook removed News Feed API access in 2018."),
  },
  {
    id: "x",
    name: "X",
    color: "#111111",
    group: "social",
    tagline: "Posts and trends",
    connect: "demo",
    note: demoNote("X's home-timeline API requires a paid tier."),
  },
  {
    id: "threads",
    name: "Threads",
    color: "#111111",
    group: "social",
    tagline: "Conversations",
    connect: "demo",
    note: demoNote("The Threads API covers your own posts, not your home feed."),
  },
  {
    id: "pinterest",
    name: "Pinterest",
    color: "#e60023",
    group: "social",
    tagline: "Ideas and inspiration",
    connect: "demo",
    note: demoNote("Pinterest's API covers your own boards, not your home feed."),
  },
  {
    id: "wechat",
    name: "WeChat",
    color: "#07c160",
    group: "social",
    tagline: "Moments and Channels",
    connect: "demo",
    note: demoNote("WeChat has no consumer API for Moments or Channels."),
  },

  // Professional & learning
  {
    id: "linkedin",
    name: "LinkedIn",
    color: "#0a66c2",
    group: "professional",
    tagline: "Professional posts and insights",
    connect: "demo",
    note: demoNote("LinkedIn doesn't offer a member feed API."),
  },
  {
    id: "reddit",
    name: "Reddit",
    color: "#ff4500",
    group: "professional",
    tagline: "Your communities",
    connect: "oauth",
    note: "Live: your home feed, read-only via Reddit sign-in.",
  },
  {
    id: "rss",
    name: "Newsletters & blogs",
    color: "#f97316",
    group: "professional",
    tagline: "Substack, Medium, any RSS feed",
    connect: "form",
    multiple: true,
    fields: [
      { name: "url", label: "Feed URL", type: "url", placeholder: "https://example.substack.com/feed", required: true, help: "Works with Substack, Medium, blogs, podcasts and YouTube channels." },
      { name: "name", label: "Name (optional)", type: "text", placeholder: "My favourite newsletter" },
    ],
    note: "Live: any RSS or Atom feed.",
  },
  {
    id: "bluesky",
    name: "Bluesky",
    color: "#1185fe",
    group: "professional",
    tagline: "Your Following timeline",
    connect: "form",
    fields: [
      { name: "identifier", label: "Handle or email", type: "text", placeholder: "you.bsky.social", required: true },
      {
        name: "password",
        label: "App password",
        type: "password",
        placeholder: "xxxx-xxxx-xxxx-xxxx",
        help: "Create one in Bluesky → Settings → Privacy and security → App passwords. Never use your main password.",
        required: true,
      },
    ],
    note: "Live: your timeline via the AT Protocol, using a revocable app password.",
  },
  {
    id: "mastodon",
    name: "Mastodon",
    color: "#6364ff",
    group: "professional",
    tagline: "Your home timeline",
    connect: "form",
    fields: [
      { name: "instance", label: "Instance URL", type: "url", placeholder: "https://mastodon.social", required: true },
      { name: "token", label: "Access token", type: "password", help: "Preferences → Development → New application (read scope) → copy your access token.", required: true },
    ],
    note: "Live: your home timeline (read scope only).",
  },

  // News
  {
    id: "googlenews",
    name: "Google News",
    color: "#4285f4",
    group: "news",
    tagline: "Top stories, topics or any search",
    connect: "form",
    multiple: true,
    fields: [
      { name: "topic", label: "Section", type: "select", options: GOOGLE_NEWS_TOPICS.map(({ value, label }) => ({ value, label })) },
      { name: "query", label: "Or follow a search (optional)", type: "text", placeholder: "e.g. artificial intelligence" },
      { name: "region", label: "Edition", type: "select", options: GOOGLE_NEWS_REGIONS.map(({ value, label }) => ({ value, label })) },
    ],
    note: "Live: Google News public feeds. No sign-in needed.",
  },
  {
    id: "news",
    name: "Top publications",
    color: "#111111",
    group: "news",
    tagline: "BBC, The Guardian, TechCrunch, The Hindu…",
    connect: "form",
    multiple: true,
    fields: [{ name: "publication", label: "Publication", type: "select", options: PUBLICATIONS.map(({ value, label }) => ({ value, label })) }],
    note: "Live: the publication's public RSS feed.",
  },
  {
    id: "inshorts",
    name: "Inshorts",
    color: "#c9161d",
    group: "news",
    tagline: "News in 60 words",
    connect: "demo",
    note: demoNote("Inshorts doesn't offer a public API."),
  },
];

export const PLATFORM_BY_ID = Object.fromEntries(PLATFORMS.map((p) => [p.id, p])) as Record<Platform, PlatformInfo>;

export const GROUPS: { id: PlatformGroup; title: string; subtitle: string }[] = [
  { id: "social", title: "Social & entertainment", subtitle: "Where your scrolling happens today" },
  { id: "professional", title: "Professional & learning", subtitle: "Content that builds you up" },
  { id: "news", title: "News", subtitle: "Stay informed, not overwhelmed" },
];

export function isPlatform(value: string): value is Platform {
  return value in PLATFORM_BY_ID;
}
