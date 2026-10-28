import "server-only";
import type { Bucket, GoalProfile, Plan, PlanDay } from "./types";
import { all, get, run, transaction } from "./db";
import { newId } from "./crypto";
import { isComplete, nextLevel, ratioForLevel } from "./engine/schedule";

interface PlanRow {
  id: string;
  user_id: string;
  goal_text: string;
  goal_profile: string;
  reduce_habits: string;
  build_habits: string;
  from_accounts: string;
  to_accounts: string;
  start_ratio: number;
  end_ratio: number;
  duration_days: number;
  daily_budget: number;
  adaptive: number;
  page_size: number;
  status: Plan["status"];
  created_at: string;
}

interface DayRow {
  plan_id: string;
  day: string;
  level: number;
  ratio: number;
  held: number;
  shown_from: number;
  shown_to: number;
  engaged_from: number;
  engaged_to: number;
}

const toPlan = (r: PlanRow): Plan => ({
  id: r.id,
  userId: r.user_id,
  goalText: r.goal_text,
  goalProfile: JSON.parse(r.goal_profile),
  reduceHabits: JSON.parse(r.reduce_habits),
  buildHabits: JSON.parse(r.build_habits),
  fromAccountIds: JSON.parse(r.from_accounts),
  toAccountIds: JSON.parse(r.to_accounts),
  startRatio: r.start_ratio,
  endRatio: r.end_ratio,
  durationDays: r.duration_days,
  dailyBudget: r.daily_budget,
  adaptive: Boolean(r.adaptive),
  pageSize: r.page_size,
  status: r.status,
  createdAt: r.created_at,
});

const toDay = (r: DayRow): PlanDay => ({
  planId: r.plan_id,
  day: r.day,
  level: r.level,
  ratio: r.ratio,
  held: Boolean(r.held),
  shownFrom: r.shown_from,
  shownTo: r.shown_to,
  engagedFrom: r.engaged_from,
  engagedTo: r.engaged_to,
});

/** The user's current plan (active, paused or completed), if any. */
export function currentPlan(userId: string): Plan | null {
  const row = get<PlanRow>(
    "SELECT * FROM plans WHERE user_id = ? AND status IN ('active', 'paused', 'completed') ORDER BY created_at DESC LIMIT 1",
    userId,
  );
  return row ? toPlan(row) : null;
}

export interface NewPlan {
  goalText: string;
  goalProfile: GoalProfile;
  reduceHabits: string[];
  buildHabits: string[];
  fromAccountIds: string[];
  toAccountIds: string[];
  startRatio: number;
  endRatio: number;
  durationDays: number;
  dailyBudget: number;
  adaptive: boolean;
}

export function createPlan(userId: string, input: NewPlan): Plan {
  transaction(() => {
    run("UPDATE plans SET status = 'ended' WHERE user_id = ? AND status IN ('active', 'paused', 'completed')", userId);
    run(
      `INSERT INTO plans (id, user_id, goal_text, goal_profile, reduce_habits, build_habits, from_accounts, to_accounts,
         start_ratio, end_ratio, duration_days, daily_budget, adaptive, page_size, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 10, 'active', ?)`,
      newId(),
      userId,
      input.goalText,
      JSON.stringify(input.goalProfile),
      JSON.stringify(input.reduceHabits),
      JSON.stringify(input.buildHabits),
      JSON.stringify(input.fromAccountIds),
      JSON.stringify(input.toAccountIds),
      input.startRatio,
      input.endRatio,
      input.durationDays,
      input.dailyBudget,
      input.adaptive ? 1 : 0,
      new Date().toISOString(),
    );
  });
  return currentPlan(userId)!;
}

export function setPlanStatus(userId: string, planId: string, status: Plan["status"]) {
  run("UPDATE plans SET status = ? WHERE id = ? AND user_id = ?", status, planId, userId);
}

export function planDays(planId: string): PlanDay[] {
  return all<DayRow>("SELECT * FROM plan_days WHERE plan_id = ? ORDER BY day", planId).map(toDay);
}

/**
 * Today's record, created on the first visit of the day. The level advances
 * from the most recent *active* day (or holds, for adaptive plans).
 */
export function ensureToday(plan: Plan, day: string): PlanDay {
  return transaction(() => {
    const existing = get<DayRow>("SELECT * FROM plan_days WHERE plan_id = ? AND day = ?", plan.id, day);
    if (existing) return toDay(existing);

    const prevRow = get<DayRow>("SELECT * FROM plan_days WHERE plan_id = ? AND day < ? ORDER BY day DESC LIMIT 1", plan.id, day);
    const prev = prevRow ? toDay(prevRow) : null;
    // Paused plans keep yesterday's mix; completed plans stay at the end ratio.
    const { level, held } = plan.status === "active" ? nextLevel(prev, plan.adaptive) : { level: prev?.level ?? 0, held: false };
    const ratio = ratioForLevel(plan, level);
    run("INSERT INTO plan_days (plan_id, day, level, ratio, held) VALUES (?, ?, ?, ?, ?)", plan.id, day, level, ratio, held ? 1 : 0);

    if (plan.status === "active" && isComplete([{ level }], plan.durationDays)) {
      run("UPDATE plans SET status = 'completed' WHERE id = ?", plan.id);
    }
    return toDay(get<DayRow>("SELECT * FROM plan_days WHERE plan_id = ? AND day = ?", plan.id, day)!);
  });
}

export function bucketFor(plan: Plan | null, accountId: string): Bucket {
  if (!plan) return "neutral";
  if (plan.toAccountIds.includes(accountId)) return "to";
  if (plan.fromAccountIds.includes(accountId)) return "from";
  return "neutral";
}

export function bumpDayCounter(planId: string, day: string, column: "shown_from" | "shown_to" | "engaged_from" | "engaged_to") {
  run(`UPDATE plan_days SET ${column} = ${column} + 1 WHERE plan_id = ? AND day = ?`, planId, day);
}
