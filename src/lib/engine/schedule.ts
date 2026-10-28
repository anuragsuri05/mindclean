/**
 * The content transition schedule.
 *
 * A plan moves a user's feed from "from" sources (entertainment they want less
 * of) to "to" sources (meaningful content they want more of) over a chosen
 * number of days. The share of meaningful content rises linearly from
 * `startRatio` to `endRatio`, snapped to whole posts per 10 so every day reads
 * like "7 Reels + 3 posts".
 *
 * Each *active day* (a day the user opens their feed) advances one level, so
 * the plan follows behaviour rather than the calendar. With `adaptive` on, a
 * day where the user mostly skipped the meaningful content holds the level
 * instead of pushing harder.
 */

export interface ScheduleParams {
  startRatio: number;
  endRatio: number;
  durationDays: number;
}

export const DURATIONS = [7, 14, 21, 30] as const;

/** Minimum meaningful items shown before an adaptive hold can trigger. */
export const HOLD_MIN_SHOWN = 3;
/** Below this engagement rate on meaningful items, adaptive plans hold the level. */
export const HOLD_ENGAGE_RATE = 0.25;

export function ratioForLevel(p: ScheduleParams, level: number): number {
  const span = Math.max(1, p.durationDays - 1);
  const t = Math.min(Math.max(level, 0), span) / span;
  const per10 = Math.round((p.startRatio + (p.endRatio - p.startRatio) * t) * 10);
  return Math.min(10, Math.max(0, per10)) / 10;
}

export interface ScheduleDay {
  day: number;
  ratio: number;
  toPerPage: number;
  fromPerPage: number;
}

/** The full planned schedule, one entry per day of the program. */
export function projectSchedule(p: ScheduleParams, pageSize = 10): ScheduleDay[] {
  return Array.from({ length: p.durationDays }, (_, level) => {
    const ratio = ratioForLevel(p, level);
    const toPerPage = Math.round(ratio * pageSize);
    return { day: level + 1, ratio, toPerPage, fromPerPage: pageSize - toPerPage };
  });
}

/** Meaningful posts to read today: the plan's share of a typical day's scrolling. */
export function dailyGoal(ratio: number, dailyBudget: number): number {
  return Math.max(1, Math.round(ratio * dailyBudget));
}

export interface DayRecord {
  level: number;
  ratio: number;
  shownTo: number;
  engagedTo: number;
}

export function shouldHold(prev: DayRecord, adaptive: boolean): boolean {
  if (!adaptive || prev.ratio >= 1) return false;
  if (prev.shownTo < HOLD_MIN_SHOWN) return false;
  return prev.engagedTo / prev.shownTo < HOLD_ENGAGE_RATE;
}

/** Level for a new active day, given the most recent previous active day. */
export function nextLevel(prev: DayRecord | null, adaptive: boolean): { level: number; held: boolean } {
  if (!prev) return { level: 0, held: false };
  const held = shouldHold(prev, adaptive);
  return { level: held ? prev.level : prev.level + 1, held };
}

/** The program is complete once the user has had an active day at every level. */
export function isComplete(days: Pick<DayRecord, "level">[], durationDays: number): boolean {
  return days.some((d) => d.level >= durationDays - 1);
}

/** Consecutive active days ending today (or yesterday, if today hasn't started). */
export function streak(activeDays: string[], today: string): number {
  const set = new Set(activeDays);
  const cursor = new Date(`${today}T12:00:00Z`);
  if (!set.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let n = 0;
  while (set.has(cursor.toISOString().slice(0, 10))) {
    n++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return n;
}
