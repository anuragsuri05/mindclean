export type Platform =
  | "instagram"
  | "threads"
  | "facebook"
  | "tiktok"
  | "snapchat"
  | "pinterest"
  | "reddit"
  | "linkedin"
  | "wechat"
  | "x"
  | "youtube"
  | "bluesky"
  | "mastodon"
  | "rss"
  | "googlenews"
  | "news"
  | "inshorts";

export type ContentCategory =
  | "educational"
  | "career"
  | "news"
  | "creative"
  | "wellbeing"
  | "social"
  | "entertainment"
  | "other";

export type MediaKind = "image" | "video" | "reel";

export interface Media {
  kind: MediaKind;
  url?: string;
  thumbnail?: string;
  /** Demo items render a gradient card instead of a remote image. */
  gradient?: string;
  emoji?: string;
  aspect?: "square" | "portrait" | "landscape";
  embedUrl?: string;
}

/** A normalized post from any platform. */
export interface FeedItem {
  id: string;
  accountId: string;
  platform: Platform;
  externalId: string;
  authorName: string;
  authorHandle?: string;
  authorAvatar?: string;
  title?: string;
  text: string;
  url?: string;
  media: Media[];
  createdAt: string;
  /** Hint supplied by connectors that know the content type (demo + some APIs). */
  categoryHint?: ContentCategory;
  topic?: string | null;
  category?: ContentCategory | null;
  alignment?: number | null;
}

export type Bucket = "from" | "to" | "neutral";

export interface MixedFeedItem extends FeedItem {
  bucket: Bucket;
}

export interface Account {
  id: string;
  userId: string;
  platform: Platform;
  /** live: official API · demo: sample feed · device: read on the user's phone by the Mindclean app */
  mode: "live" | "demo" | "device";
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  status: "ok" | "error";
  error: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

export interface GoalProfile {
  summary: string;
  targetTopics: string[];
  avoidTopics: string[];
}

export interface Plan {
  id: string;
  userId: string;
  goalText: string;
  goalProfile: GoalProfile;
  /** Habit ids from lib/habits.ts */
  reduceHabits: string[];
  buildHabits: string[];
  fromAccountIds: string[];
  toAccountIds: string[];
  /** Share of meaningful content on day 1 and on the final day (0–1, in tenths). */
  startRatio: number;
  endRatio: number;
  durationDays: number;
  /** Roughly how many posts the user consumes per day; sets the daily goal. */
  dailyBudget: number;
  adaptive: boolean;
  pageSize: number;
  status: "active" | "paused" | "completed" | "ended";
  createdAt: string;
}

export interface PlanDay {
  planId: string;
  day: string;
  level: number;
  ratio: number;
  held: boolean;
  shownFrom: number;
  shownTo: number;
  engagedFrom: number;
  engagedTo: number;
}
