import "server-only";
import { all, get } from "./db";
import { currentPlan, planDays } from "./plans";
import { dailyGoal, projectSchedule, streak } from "./engine/schedule";
import { listAccounts } from "./accounts";
import { PLATFORM_BY_ID } from "./platforms";

export interface DailyUsage {
  day: string;
  viewsFrom: number;
  viewsTo: number;
  viewsNeutral: number;
  minutesFrom: number;
  minutesTo: number;
}

function lastNDays(today: string, n: number): string[] {
  const base = new Date(`${today}T12:00:00Z`);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() - (n - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

const share = (to: number, from: number) => (to + from > 0 ? to / (to + from) : null);

export function insights(userId: string, today: string) {
  const plan = currentPlan(userId);
  const days = plan ? planDays(plan.id) : [];
  const window = lastNDays(today, 14);

  const rows = all<{ day: string; bucket: string; type: string; n: number; dwell: number }>(
    `SELECT day, bucket, type, COUNT(*) AS n, SUM(dwell_ms) AS dwell FROM events
     WHERE user_id = ? AND day >= ? GROUP BY day, bucket, type`,
    userId,
    window[0],
  );
  const usage: DailyUsage[] = window.map((day) => {
    const pick = (bucket: string, type: string, field: "n" | "dwell") =>
      rows.filter((r) => r.day === day && r.bucket === bucket && r.type === type).reduce((s, r) => s + r[field], 0);
    return {
      day,
      viewsFrom: pick("from", "view", "n"),
      viewsTo: pick("to", "view", "n"),
      viewsNeutral: pick("neutral", "view", "n"),
      minutesFrom: Math.round((pick("from", "dwell", "dwell") / 60_000) * 10) / 10,
      minutesTo: Math.round((pick("to", "dwell", "dwell") / 60_000) * 10) / 10,
    };
  });

  const categories = all<{ category: string; n: number }>(
    `SELECT COALESCE(i.category, i.category_hint, 'other') AS category, COUNT(*) AS n
     FROM events e JOIN items i ON i.id = e.item_id
     WHERE e.user_id = ? AND e.type = 'view' AND e.day >= ?
     GROUP BY 1 ORDER BY n DESC`,
    userId,
    window[7],
  );

  const platforms = all<{ platform: string; bucket: string; n: number }>(
    `SELECT i.platform, e.bucket, COUNT(*) AS n FROM events e JOIN items i ON i.id = e.item_id
     WHERE e.user_id = ? AND e.type = 'view' AND e.day >= ? GROUP BY 1, 2 ORDER BY n DESC`,
    userId,
    window[7],
  ).map((r) => ({ ...r, name: PLATFORM_BY_ID[r.platform as keyof typeof PLATFORM_BY_ID]?.name ?? r.platform }));

  const totals = get<{ views: number; engaged: number; skipped: number }>(
    `SELECT SUM(type = 'view') AS views, SUM(type = 'engage') AS engaged, SUM(type = 'skip') AS skipped
     FROM events WHERE user_id = ? AND day >= ?`,
    userId,
    window[7],
  );
  const savedCount = get<{ n: number }>("SELECT COUNT(*) AS n FROM saved_items WHERE user_id = ?", userId)!.n;

  const accounts = listAccounts(userId);
  const name = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    return a ? `${PLATFORM_BY_ID[a.platform].name}` : "Removed source";
  };

  const todayRecord = days.find((d) => d.day === today) ?? null;
  // Habit change: meaningful share of what you actually saw, first active days vs most recent.
  const withViews = days.filter((d) => d.shownFrom + d.shownTo > 0);
  const avgShare = (list: typeof days) => {
    const to = list.reduce((s, d) => s + d.shownTo, 0);
    const from = list.reduce((s, d) => s + d.shownFrom, 0);
    return share(to, from);
  };

  return {
    plan: plan && {
      ...plan,
      fromNames: [...new Set(plan.fromAccountIds.map(name))],
      toNames: [...new Set(plan.toAccountIds.map(name))],
    },
    days,
    projected: plan ? projectSchedule(plan, plan.pageSize) : [],
    today: todayRecord && plan
      ? {
          ...todayRecord,
          goal: dailyGoal(todayRecord.ratio, plan.dailyBudget),
          dayNumber: days.indexOf(todayRecord) + 1,
        }
      : null,
    streak: streak(days.filter((d) => d.shownFrom + d.shownTo > 0).map((d) => d.day), today),
    habitChange: {
      start: avgShare(withViews.slice(0, 3)),
      recent: withViews.length > 3 ? avgShare(withViews.slice(-3)) : null,
    },
    usage,
    categories,
    platforms,
    last7: { views: totals?.views ?? 0, engaged: totals?.engaged ?? 0, skipped: totals?.skipped ?? 0, saved: savedCount },
  };
}

export type Insights = ReturnType<typeof insights>;
