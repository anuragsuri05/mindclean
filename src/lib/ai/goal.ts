import "server-only";
import { z } from "zod";
import type { Account, GoalProfile } from "../types";
import { PLATFORM_BY_ID } from "../platforms";
import { assignAccounts, BUILD_BY_ID, REDUCE_BY_ID } from "../habits";
import { generate, type AiSource } from "./llm";

export interface FocusInput {
  reduceHabits: string[];
  buildHabits: string[];
  interests: string[];
  note: string;
}

export interface GeneratedPlan extends GoalProfile {
  fromAccountIds: string[];
  toAccountIds: string[];
  /** A short, encouraging line shown with the plan. */
  coaching: string;
  source: AiSource;
}

const PlanSchema = z.object({
  summary: z.string().describe("One short sentence in second person describing the shift, e.g. 'Trade Reels for career-building posts and daily tech news.'"),
  target_topics: z.array(z.string()).describe("4-10 concrete topics to rank meaningful posts by, based on their interests and build habits"),
  avoid_topics: z.array(z.string()).describe("2-6 kinds of content they want less of"),
  coaching: z.string().describe("One warm, specific sentence of encouragement. No moralising about screen time."),
});

const SYSTEM = `You are the planning coach inside Mindclean, an app that gradually shifts people from mindless short-form scrolling toward meaningful content (professional posts, news, learning) by changing the mix of their feed day by day. Nothing is ever blocked.

From the habits they want to reduce and build, their interests, and any note they wrote, produce:
- a one-sentence summary of their shift,
- concrete topics to favour when ranking posts (specific enough to score a single post against, e.g. "machine learning", "Indian startups", "personal finance"),
- kinds of content to de-emphasise,
- one sentence of coaching.
Be warm and concrete. Never lecture about screen time.`;

export async function generateFocusPlan(userId: string, input: FocusInput, accounts: Account[]): Promise<GeneratedPlan> {
  const { from, to } = assignAccounts(accounts, input.reduceHabits, input.buildHabits);
  const reduceLabels = input.reduceHabits.map((id) => REDUCE_BY_ID[id]?.label).filter(Boolean);
  const buildLabels = input.buildHabits.map((id) => BUILD_BY_ID[id]?.label).filter(Boolean);

  const result = await generate(userId, {
    name: "focusPlan",
    instructions: SYSTEM,
    input: [
      `Reduce: ${reduceLabels.join(", ") || "(not specified)"}`,
      `Build: ${buildLabels.join(", ") || "(not specified)"}`,
      `Interests: ${input.interests.join(", ") || "(not specified)"}`,
      `Connected sources: ${accounts.map((a) => PLATFORM_BY_ID[a.platform].name).join(", ")}`,
      input.note ? `<their_words>\n${input.note}\n</their_words>` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    schema: PlanSchema,
    maxTokens: 2000,
  });

  const base = { fromAccountIds: from.map((a) => a.id), toAccountIds: to.map((a) => a.id) };
  if (result) {
    return {
      ...base,
      summary: result.data.summary,
      targetTopics: dedupeTopics(result.data.target_topics),
      avoidTopics: result.data.avoid_topics,
      coaching: result.data.coaching,
      source: result.source,
    };
  }
  return { ...base, ...heuristicProfile(input), source: "heuristic" };
}

const REDUCE_PHRASE: Record<string, string> = { reels: "Reels", memes: "memes", gossip: "celebrity gossip", browsing: "mindless browsing" };
const BUILD_PHRASE: Record<string, string> = { professional: "LinkedIn insights", news: "daily news", industry: "industry updates", learning: "learning" };
const BUILD_TOPIC: Record<string, string> = { professional: "career growth", news: "current affairs", industry: "industry trends", learning: "explainers" };

const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/** Case-insensitive de-dupe that also drops near-duplicates like "Careers"/"career". */
export function dedupeTopics(topics: string[]): string[] {
  const seen: string[] = [];
  for (const t of topics) {
    const k = t.toLowerCase().replace(/s\b/g, "");
    if (!seen.some((s) => s.toLowerCase().replace(/s\b/g, "").includes(k) || k.includes(s.toLowerCase().replace(/s\b/g, "")))) seen.push(t);
  }
  return seen;
}

function heuristicProfile(input: FocusInput) {
  const reduce = input.reduceHabits.map((id) => REDUCE_PHRASE[id]).filter(Boolean);
  const build = input.buildHabits.map((id) => BUILD_PHRASE[id]).filter(Boolean);
  return {
    summary: `Trade ${list(reduce) || "short-form entertainment"} for ${list(build) || "meaningful content"}.`,
    targetTopics: dedupeTopics([...input.interests, ...input.buildHabits.map((id) => BUILD_TOPIC[id]).filter(Boolean)]),
    avoidTopics: ["memes", "viral trends", "celebrity gossip"].slice(0, Math.max(1, input.reduceHabits.length)),
    coaching: "Small daily shifts add up. You'll barely notice the change until it's a habit.",
  };
}

const STOPWORDS = new Set(
  `i me my we want wanna would like to more less the a an and or of on in for from with into toward towards about get be is am are was so that this
  it its just really lot lots spend spending spent time times instead content posts post reels reel stories feed scroll scrolling scrolled too many
  much way hours hour day days fewer stop start shift move slowly gradually quickly got also some any things stuff thing other than then
  watch watching see seeing app apps social media platform platforms it's i'm im do doing go by at as if no not up us`.split(/\s+/),
);

export function keywords(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z][a-z0-9+#-]+/g) ?? [])].filter((w) => !STOPWORDS.has(w));
}
