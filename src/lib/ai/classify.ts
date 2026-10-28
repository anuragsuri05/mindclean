import "server-only";
import { z } from "zod";
import type { ContentCategory, FeedItem, GoalProfile } from "../types";
import { generate } from "./llm";
import { keywords } from "./goal";

export interface Score {
  id: string;
  topic: string;
  category: ContentCategory;
  alignment: number;
}

const CATEGORIES = ["educational", "career", "news", "creative", "wellbeing", "social", "entertainment", "other"] as const;

const ScoresSchema = z.object({
  scores: z.array(
    z.object({
      n: z.number().int().describe("The item number"),
      topic: z.string().describe("2-4 word topic"),
      category: z.enum(CATEGORIES),
      alignment: z.number().describe("0.0-1.0: how well this item serves the user's goal"),
    }),
  ),
});

const SYSTEM = `You score social media posts for Mindclean, an app that gradually shifts a user's feed toward the content they want more of.

For every numbered item, return its topic, a category, and an alignment score from 0.0 to 1.0:
- 1.0: directly serves the user's target topics with substance (teaches, informs, or builds a skill)
- 0.5: loosely related or mixed
- 0.0: unrelated, or matches a topic the user wants less of
Judge substance, not just keyword overlap: clickbait mentioning a target topic scores low. Score every item.`;

const BATCH = 30;

export async function scoreItems(userId: string, goal: GoalProfile, items: FeedItem[]): Promise<Score[]> {
  if (items.length === 0) return [];
  const batches: FeedItem[][] = [];
  for (let i = 0; i < items.length; i += BATCH) batches.push(items.slice(i, i + BATCH));

  const results = await Promise.all(
    batches.map(async (batch) => {
      const listing = batch
        .map((it, n) => `[${n}] (${it.platform}) ${it.authorName}: ${[it.title, it.text].filter(Boolean).join(" — ").slice(0, 500)}`)
        .join("\n");
      const result = await generate(userId, {
        name: "scoreItems",
        instructions: SYSTEM,
        input: `<goal>\n${goal.summary}\nMore of: ${goal.targetTopics.join(", ") || "(unspecified)"}\nLess of: ${goal.avoidTopics.join(", ") || "(unspecified)"}\n</goal>\n\n<items>\n${listing}\n</items>`,
        schema: ScoresSchema,
        maxTokens: 8000,
      });
      const byN = new Map((result?.data.scores ?? []).map((s) => [s.n, s]));
      return batch.map((it, n): Score => {
        const s = byN.get(n);
        return s
          ? { id: it.id, topic: s.topic, category: s.category, alignment: Math.min(1, Math.max(0, s.alignment)) }
          : heuristicScore(goal, it);
      });
    }),
  );
  return results.flat();
}

const CATEGORY_BASE: Record<ContentCategory, number> = {
  educational: 0.6,
  career: 0.6,
  news: 0.5,
  creative: 0.45,
  wellbeing: 0.45,
  social: 0.3,
  entertainment: 0.2,
  other: 0.35,
};

export function heuristicScore(goal: GoalProfile, item: FeedItem): Score {
  const text = `${item.title ?? ""} ${item.text}`.toLowerCase();
  const hits = (topics: string[]) => topics.flatMap((t) => keywords(t)).filter((w) => text.includes(w)).length;
  const category = item.categoryHint ?? "other";
  const alignment = Math.min(1, Math.max(0, CATEGORY_BASE[category] + 0.15 * hits(goal.targetTopics) - 0.2 * hits(goal.avoidTopics)));
  return { id: item.id, topic: category, category, alignment: Math.round(alignment * 100) / 100 };
}
