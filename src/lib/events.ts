import "server-only";
import { z } from "zod";
import { run, transaction } from "./db";
import { itemOwner } from "./feed";
import { bucketFor, bumpDayCounter, currentPlan, ensureToday } from "./plans";

export const DayParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const EventInput = z.object({
  itemId: z.string().min(1).max(500),
  /**
   * view   - the card was on screen for at least a moment (once per item)
   * engage - dwelled 3s+, opened, or marked useful (once per item)
   * skip   - "not for me" (once per item)
   * dwell  - additional on-screen milliseconds (repeatable)
   */
  type: z.enum(["view", "engage", "skip", "dwell"]),
  dwellMs: z.number().int().min(0).max(600_000).default(0),
});

export const EventsBody = z.object({ day: DayParam, events: z.array(EventInput).max(200) });

export function recordEvents(userId: string, body: z.infer<typeof EventsBody>) {
  const plan = currentPlan(userId);
  const tracking = plan && plan.status !== "ended";
  if (tracking) ensureToday(plan, body.day);
  const ts = new Date().toISOString();

  transaction(() => {
    for (const ev of body.events) {
      const owner = itemOwner(userId, ev.itemId);
      if (!owner) continue;
      const bucket = bucketFor(plan, owner.accountId);
      const result = run(
        `INSERT OR IGNORE INTO events (user_id, item_id, account_id, plan_id, bucket, type, dwell_ms, day, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        userId,
        ev.itemId,
        owner.accountId,
        plan?.id ?? null,
        bucket,
        ev.type,
        ev.dwellMs,
        body.day,
        ts,
      );
      if (!tracking || bucket === "neutral" || Number(result.changes) === 0) continue;
      if (ev.type === "view") bumpDayCounter(plan.id, body.day, bucket === "to" ? "shown_to" : "shown_from");
      if (ev.type === "engage") bumpDayCounter(plan.id, body.day, bucket === "to" ? "engaged_to" : "engaged_from");
    }
  });
}
