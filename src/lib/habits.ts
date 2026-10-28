import type { Platform } from "./types";

/**
 * The habits a user can choose on Focus Setup. Each maps to the platforms
 * where that habit lives, which is how a plan decides which connected accounts
 * are "from" (less of) and which are "to" (more of).
 */

export interface Habit {
  id: string;
  label: string;
  emoji: string;
  hint: string;
  platforms: Platform[];
}

export const REDUCE_HABITS: Habit[] = [
  { id: "reels", label: "Reels & short videos", emoji: "🎬", hint: "Instagram Reels, TikTok, Shorts, Spotlight", platforms: ["instagram", "tiktok", "youtube", "snapchat"] },
  { id: "memes", label: "Memes & viral posts", emoji: "😂", hint: "Endless funny and trending content", platforms: ["instagram", "facebook", "x", "threads", "reddit"] },
  { id: "gossip", label: "Celebrity & gossip", emoji: "✨", hint: "Influencer, celebrity and drama content", platforms: ["instagram", "snapchat", "x", "tiktok"] },
  { id: "browsing", label: "Mindless browsing", emoji: "🌀", hint: "Scrolling feeds without a reason", platforms: ["facebook", "x", "threads", "pinterest", "wechat"] },
];

export const BUILD_HABITS: Habit[] = [
  { id: "professional", label: "LinkedIn & professional", emoji: "💼", hint: "Career insights, industry voices", platforms: ["linkedin"] },
  { id: "news", label: "News & current affairs", emoji: "📰", hint: "Google News, Inshorts, trusted publications", platforms: ["googlenews", "news", "inshorts"] },
  { id: "industry", label: "Industry updates", emoji: "📈", hint: "Tech, business and markets", platforms: ["news", "googlenews", "linkedin", "rss", "reddit"] },
  { id: "learning", label: "Learning & education", emoji: "🧠", hint: "Explainers, long-form, newsletters", platforms: ["youtube", "rss", "reddit", "mastodon", "bluesky"] },
];

export const INTERESTS = [
  "AI",
  "Startups",
  "Technology",
  "Business",
  "Finance & markets",
  "Product management",
  "Design",
  "Marketing",
  "Careers",
  "Leadership",
  "Science",
  "Health",
  "Climate",
  "Politics",
  "World news",
  "India",
  "Sports",
  "Productivity",
] as const;

export const ENDPOINTS = [
  { ratio: 0.7, label: "Balanced", hint: "7 meaningful in every 10" },
  { ratio: 0.8, label: "Mostly meaningful", hint: "8 in every 10" },
  { ratio: 1, label: "All in", hint: "Only meaningful content" },
] as const;

export const BUDGETS = [
  { value: 50, label: "Under an hour" },
  { value: 100, label: "1–2 hours" },
  { value: 200, label: "2–4 hours" },
  { value: 300, label: "4+ hours" },
] as const;

const byId = (list: Habit[]) => Object.fromEntries(list.map((h) => [h.id, h]));
export const REDUCE_BY_ID = byId(REDUCE_HABITS);
export const BUILD_BY_ID = byId(BUILD_HABITS);

/**
 * Split connected accounts into "from" and "to" for the chosen habits.
 * A platform wanted for a build habit (e.g. YouTube for learning) wins over a
 * reduce habit, so useful sources are never treated as the thing to cut.
 */
export function assignAccounts<A extends { id: string; platform: Platform }>(
  accounts: A[],
  reduce: string[],
  build: string[],
): { from: A[]; to: A[] } {
  const toPlatforms = new Set(build.flatMap((id) => BUILD_BY_ID[id]?.platforms ?? []));
  const fromPlatforms = new Set(reduce.flatMap((id) => REDUCE_BY_ID[id]?.platforms ?? []));
  const to = accounts.filter((a) => toPlatforms.has(a.platform));
  const from = accounts.filter((a) => fromPlatforms.has(a.platform) && !toPlatforms.has(a.platform));
  return { from, to };
}
