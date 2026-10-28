import type { ScheduleDay } from "@/lib/engine/schedule";
import { CheckIcon } from "./Icons";

export function MixBar({ toPerPage, className = "h-2" }: { toPerPage: number; className?: string }) {
  return (
    <div className="flex flex-1 gap-[3px]" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={`flex-1 rounded-full transition-colors duration-500 ${className} ${i >= 10 - toPerPage ? "bg-to" : "bg-from/75"}`} />
      ))}
    </div>
  );
}

/**
 * The day-by-day transition plan. `currentDay` (1-based) highlights today and
 * ticks off earlier days.
 */
export function PlanTimeline({
  schedule,
  fromLabel,
  toLabel,
  currentDay,
  maxRows,
}: {
  schedule: ScheduleDay[];
  fromLabel: string;
  toLabel: string;
  currentDay?: number;
  maxRows?: number;
}) {
  // Long programs: show changes in the mix rather than every identical day.
  const rows = maxRows && schedule.length > maxRows ? schedule.filter((d, i) => i === 0 || i === schedule.length - 1 || d.toPerPage !== schedule[i - 1].toPerPage || d.day === currentDay) : schedule;

  return (
    <ol className="space-y-1">
      {rows.map((d) => {
        const done = currentDay !== undefined && d.day < currentDay;
        const today = d.day === currentDay;
        return (
          <li
            key={d.day}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${today ? "bg-accent-soft ring-1 ring-accent/30" : ""}`}
            aria-current={today ? "step" : undefined}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                done ? "bg-ink text-bg" : today ? "bg-accent text-white" : "bg-surface-3 text-muted"
              }`}
            >
              {done ? <CheckIcon className="h-3.5 w-3.5" /> : d.day}
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px]">
                <span className={today ? "font-bold" : "font-semibold"}>
                  Day {d.day}
                  {today && <span className="ml-1.5 text-accent">· Today</span>}
                </span>
                <span className="truncate text-muted">
                  {d.fromPerPage} {fromLabel} + {d.toPerPage} {toLabel}
                </span>
              </div>
              <MixBar toPerPage={d.toPerPage} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function MixLegend({ fromLabel, toLabel }: { fromLabel: string; toLabel: string }) {
  return (
    <div className="flex gap-4 text-xs text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-from/75" /> {fromLabel}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-to" /> {toLabel}
      </span>
    </div>
  );
}

/** Wording for the two sides of the mix, based on the chosen habits. */
export function mixLabels(reduceHabits: string[]): { fromLabel: string; toLabel: string } {
  return { fromLabel: reduceHabits.includes("reels") ? "Reels" : "entertainment", toLabel: "meaningful" };
}
