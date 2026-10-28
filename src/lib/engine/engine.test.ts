import { test } from "node:test";
import assert from "node:assert/strict";
import { composePage, slotPattern, toCountForPage, rankByAlignment, START_CURSOR } from "./mixer.ts";
import { nextLevel, projectSchedule, ratioForLevel, isComplete, dailyGoal, streak } from "./schedule.ts";

test("default 7-day plan matches 8+2 → 7+3 → 6+4 → 5+5 … → 2+8", () => {
  const schedule = projectSchedule({ startRatio: 0.2, endRatio: 0.8, durationDays: 7 });
  assert.deepEqual(
    schedule.map((d) => [d.fromPerPage, d.toPerPage]),
    [[8, 2], [7, 3], [6, 4], [5, 5], [4, 6], [3, 7], [2, 8]],
  );
});

test("longer plans snap to whole posts per 10 and hit the end ratio on the last day", () => {
  const p = { startRatio: 0.2, endRatio: 0.9, durationDays: 14 };
  const s = projectSchedule(p);
  assert.equal(s.length, 14);
  assert.equal(s[0].toPerPage, 2);
  assert.equal(s.at(-1)!.toPerPage, 9);
  assert.ok(s.every((d, i) => i === 0 || d.toPerPage >= s[i - 1].toPerPage), "never goes backwards");
  assert.ok(s.every((d) => Number.isInteger(d.ratio * 10)));
});

test("ratio holds at the end ratio after the program", () => {
  const p = { startRatio: 0.2, endRatio: 1, durationDays: 7 };
  assert.equal(ratioForLevel(p, 100), 1);
  assert.equal(ratioForLevel(p, 0), 0.2);
});

test("daily goal is the plan's share of a typical day", () => {
  assert.equal(dailyGoal(0.3, 100), 30);
  assert.equal(dailyGoal(0, 100), 1);
});

test("streak counts consecutive active days", () => {
  assert.equal(streak(["2026-10-19", "2026-10-20", "2026-10-21"], "2026-10-21"), 3);
  assert.equal(streak(["2026-10-19", "2026-10-20"], "2026-10-21"), 2);
  assert.equal(streak(["2026-10-18", "2026-10-20"], "2026-10-21"), 1);
  assert.equal(streak([], "2026-10-21"), 0);
});

test("slot pattern spreads new-habit items evenly", () => {
  assert.deepEqual(
    slotPattern(10, 2).map((x) => (x ? "T" : "f")).join(""),
    "ffffTffffT",
  );
  assert.equal(slotPattern(10, 0).filter(Boolean).length, 0);
  assert.equal(slotPattern(10, 10).filter(Boolean).length, 10);
});

test("cumulative page counts average out to the exact ratio", () => {
  const counts = Array.from({ length: 8 }, (_, p) => toCountForPage(0.25, 10, p));
  assert.equal(counts.reduce((a, b) => a + b, 0), 20);
  assert.ok(counts.every((c) => c === 2 || c === 3));
});

test("composePage interleaves at the plan ratio", () => {
  const from = Array.from({ length: 50 }, (_, i) => `f${i}`);
  const to = Array.from({ length: 50 }, (_, i) => `t${i}`);
  const page = composePage(from, to, 0.3, 10, START_CURSOR);
  assert.equal(page.entries.length, 10);
  assert.equal(page.entries.filter((e) => e.bucket === "to").length, 3);
  assert.deepEqual(page.cursor, { page: 1, from: 7, to: 3 });
  assert.equal(page.caughtUp, false);

  const next = composePage(from, to, 0.3, 10, page.cursor);
  assert.equal(next.entries[0].item, "f7");
});

test("feed stops instead of backfilling when new-habit content runs out", () => {
  const from = Array.from({ length: 50 }, (_, i) => `f${i}`);
  const page = composePage(from, ["t0"], 0.5, 10);
  assert.equal(page.caughtUp, true);
  assert.equal(page.entries.filter((e) => e.bucket === "to").length, 1);
  assert.ok(page.entries.length < 10);
});

test("new-habit content fills in when old-habit content runs out", () => {
  const to = Array.from({ length: 20 }, (_, i) => `t${i}`);
  const page = composePage([], to, 0.2, 10);
  assert.equal(page.entries.length, 10);
  assert.ok(page.entries.every((e) => e.bucket === "to"));
});

test("adaptive plans hold the level when new content isn't landing", () => {
  assert.deepEqual(nextLevel(null, true), { level: 0, held: false });
  const landing = { level: 2, ratio: 0.3, shownTo: 10, engagedTo: 6 };
  const skipped = { level: 2, ratio: 0.3, shownTo: 10, engagedTo: 1 };
  assert.deepEqual(nextLevel(landing, true), { level: 3, held: false });
  assert.deepEqual(nextLevel(skipped, true), { level: 2, held: true });
  assert.deepEqual(nextLevel(skipped, false), { level: 3, held: false });
  // Too little data to judge: advance.
  assert.deepEqual(nextLevel({ level: 2, ratio: 0.3, shownTo: 2, engagedTo: 0 }, true), { level: 3, held: false });
});

test("plan completes once the final day's level is reached", () => {
  assert.equal(isComplete([{ level: 0 }, { level: 5 }], 7), false);
  assert.equal(isComplete([{ level: 6 }], 7), true);
});

test("rankByAlignment prefers aligned items, then recency", () => {
  const items = [
    { id: "low", alignment: 0.1, createdAt: "2026-10-20T10:00:00Z" },
    { id: "high", alignment: 0.9, createdAt: "2026-10-01T10:00:00Z" },
    { id: "unscored-new", alignment: null, createdAt: "2026-10-21T10:00:00Z" },
    { id: "unscored-old", alignment: null, createdAt: "2026-10-02T10:00:00Z" },
  ];
  assert.deepEqual(
    rankByAlignment(items).map((i) => i.id),
    ["high", "unscored-new", "unscored-old", "low"],
  );
});

test("rankByAlignment never puts a lower band ahead of a higher one", () => {
  // Regression: a threshold-based comparator was non-transitive and could sort low scores first.
  const items = Array.from({ length: 40 }, (_, i) => ({
    alignment: (i % 10) / 10,
    createdAt: new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString(),
  }));
  const ranked = rankByAlignment(items).map((i) => Math.floor(i.alignment * 5));
  for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i - 1] >= ranked[i], `band order broken at ${i}`);
  assert.equal(rankByAlignment(items)[0].alignment, 0.9);
});
