"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Insights } from "@/lib/insights";
import { api, localDay } from "@/lib/client";
import { CategoryBars, ChartCard, DataTable, ShiftChart, UsageChart, pct } from "./Charts";
import { MixBar, mixLabels } from "./PlanTimeline";
import { FlameIcon, SparkIcon } from "./Icons";

export function ProgressDashboard() {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Insights>(`/api/progress?day=${localDay()}`).then(setData, (e) => setError(e.message));
  }, []);

  if (error) return <p className="p-8 text-danger">{error}</p>;
  if (!data) return <DashboardSkeleton />;

  const { plan, days, today, usage, last7, habitChange, streak } = data;
  if (!plan) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-2xl font-bold">No program yet</h1>
        <p className="mt-2 text-muted">Set a focus and your progress will show up here.</p>
        <Link href="/app/focus" className="btn-primary mt-6">
          Set my focus
        </Link>
      </div>
    );
  }

  const labels = mixLabels(plan.reduceHabits);
  const dayNumber = (days.at(-1)?.level ?? 0) + 1;
  const programPct = Math.min(1, (days.at(-1)?.level ?? 0) / Math.max(1, plan.durationDays - 1));
  const goalPct = today ? Math.min(1, today.engagedTo / today.goal) : 0;
  const todayUsage = usage.at(-1)!;
  const toPer10 = today ? Math.round(today.ratio * 10) : 0;

  return (
    <div className="mx-auto w-full max-w-[935px] px-4 pt-8 pb-16 md:px-8">
      <header className="mb-8">
        <p className="text-xs font-bold tracking-widest text-accent uppercase">Progress</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-[28px]">{plan.goalProfile.summary}</h1>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Program">
          <p className="text-2xl font-bold tabular-nums">
            {plan.status === "completed" ? "Done" : `Day ${dayNumber}`}
            <span className="text-base font-medium text-muted"> / {plan.durationDays}</span>
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-gradient-to-r from-from to-to" style={{ width: `${Math.round(programPct * 100)}%` }} />
          </div>
        </Tile>
        <Tile label="Streak">
          <p className="flex items-center gap-1.5 text-2xl font-bold tabular-nums">
            <FlameIcon className={`h-6 w-6 ${streak > 0 ? "text-[#fa7e1e]" : "text-muted"}`} /> {streak}
          </p>
          <p className="mt-1 text-xs text-muted">{streak === 1 ? "day in a row" : "days in a row"}</p>
        </Tile>
        <Tile label="Today's goal">
          <div className="flex items-center gap-3">
            <GoalRing pct={goalPct} />
            <div>
              <p className="text-2xl font-bold tabular-nums">
                {today?.engagedTo ?? 0}
                <span className="text-base font-medium text-muted">/{today?.goal ?? 0}</span>
              </p>
              <p className="text-xs text-muted">meaningful posts</p>
            </div>
          </div>
        </Tile>
        <Tile label="Meaningful share">
          {habitChange.start === null ? (
            <p className="text-sm text-muted">Starts after your first session</p>
          ) : (
            <>
              <p className="text-2xl font-bold tabular-nums">
                {pct(habitChange.recent ?? habitChange.start)}
                {habitChange.recent !== null && (
                  <span className={`ml-1.5 text-sm font-semibold ${habitChange.recent >= habitChange.start ? "text-to" : "text-from"}`}>
                    {habitChange.recent >= habitChange.start ? "↑" : "↓"} from {pct(habitChange.start)}
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-muted">{habitChange.recent === null ? "of what you saw so far" : "last 3 days vs first 3"}</p>
            </>
          )}
        </Tile>
      </div>

      <section className="mt-3 rounded-2xl border border-line-soft p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Today</h2>
          <p className="text-sm text-muted">
            {10 - toPer10} {labels.fromLabel} + {toPer10} {labels.toLabel} in every 10
          </p>
        </div>
        <MixBar toPerPage={toPer10} />
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <Mini value={todayUsage.viewsTo + todayUsage.viewsFrom + todayUsage.viewsNeutral} label="posts seen" />
          <Mini value={`${todayUsage.minutesTo}m`} label="on meaningful" tone="to" />
          <Mini value={`${todayUsage.minutesFrom}m`} label={`on ${labels.fromLabel}`} tone="from" />
        </div>
        {today?.held && <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">Your mix is holding steady today so the new habit can catch up. No pressure.</p>}
        {goalPct >= 1 && (
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent-soft px-3 py-2 text-sm font-semibold">
            <SparkIcon className="h-4 w-4 text-accent" /> Daily goal reached. Nicely done.
          </p>
        )}
      </section>

      <div className="mt-3 space-y-3">
        <ChartCard
          title="Your shift"
          subtitle="Planned vs. actual share of meaningful content, across your whole program."
          table={
            <DataTable
              head={["Day", "Date", "Planned", "Actual", "Meaningful", "Entertainment", "Held"]}
              rows={days.map((d, i) => [
                i + 1,
                d.day,
                pct(d.ratio),
                d.shownFrom + d.shownTo ? pct(d.shownTo / (d.shownFrom + d.shownTo)) : "–",
                d.shownTo,
                d.shownFrom,
                d.held ? "yes" : "",
              ])}
            />
          }
        >
          <ShiftChart days={days} projected={data.projected} />
        </ChartCard>

        <ChartCard
          title="Daily consumption"
          subtitle="Posts seen per day over the last two weeks."
          table={
            <DataTable
              head={["Day", "Meaningful", "Entertainment", "Other", "Min meaningful", "Min entertainment"]}
              rows={usage.map((u) => [u.day, u.viewsTo, u.viewsFrom, u.viewsNeutral, u.minutesTo, u.minutesFrom])}
            />
          }
        >
          <UsageChart usage={usage} />
        </ChartCard>

        <div className="grid gap-3 md:grid-cols-2">
          <ChartCard title="By source" subtitle="Last 7 days." table={<DataTable head={["Source", "Side", "Posts"]} rows={data.platforms.map((p) => [p.name, p.bucket, p.n])} />}>
            <SourceBars platforms={data.platforms} />
          </ChartCard>
          <ChartCard title="By content type" subtitle="Last 7 days." table={<DataTable head={["Type", "Posts"]} rows={data.categories.map((c) => [c.category, c.n])} />}>
            {data.categories.length ? <CategoryBars categories={data.categories} /> : <Empty />}
          </ChartCard>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Mini value={last7.views} label="seen this week" boxed />
          <Mini value={last7.engaged} label="engaged" boxed />
          <Mini value={last7.saved} label="saved" boxed />
        </div>
      </div>
    </div>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line-soft p-4">
      <p className="mb-2 text-xs font-semibold text-muted">{label}</p>
      {children}
    </div>
  );
}

function Mini({ value, label, tone, boxed }: { value: string | number; label: string; tone?: "to" | "from"; boxed?: boolean }) {
  return (
    <div className={boxed ? "rounded-2xl border border-line-soft p-4 text-center" : ""}>
      <p className={`text-xl font-bold tabular-nums ${tone === "to" ? "text-to" : tone === "from" ? "text-from" : ""}`}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function GoalRing({ pct: p }: { pct: number }) {
  return (
    <span className="relative flex h-11 w-11 items-center justify-center rounded-full" style={{ background: `conic-gradient(#2a78d6, #22c1c3 ${p * 360}deg, var(--surface-3) 0deg)` }}>
      <span className="absolute inset-[4px] rounded-full bg-bg" />
    </span>
  );
}

function SourceBars({ platforms }: { platforms: Insights["platforms"] }) {
  if (!platforms.length) return <Empty />;
  const max = Math.max(...platforms.map((p) => p.n));
  return (
    <ul className="space-y-2.5">
      {platforms.slice(0, 8).map((p) => (
        <li key={`${p.platform}-${p.bucket}`} className="flex items-center gap-3 text-sm">
          <span className="w-28 shrink-0 truncate">{p.name}</span>
          <span className="h-2.5 flex-1">
            <span
              className={`block h-2.5 rounded-r-full ${p.bucket === "to" ? "bg-to" : p.bucket === "from" ? "bg-from/80" : "bg-ink/40"}`}
              style={{ width: `${(p.n / max) * 100}%` }}
            />
          </span>
          <span className="w-8 text-right text-xs text-muted tabular-nums">{p.n}</span>
        </li>
      ))}
    </ul>
  );
}

function Empty() {
  return <p className="py-6 text-center text-sm text-muted">Nothing yet. Check back after a session.</p>;
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[935px] px-4 pt-8 md:px-8" aria-label="Loading">
      <div className="skeleton mb-3 h-4 w-24 rounded" />
      <div className="skeleton mb-8 h-8 w-3/4 rounded" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-28 rounded-2xl" />
        ))}
      </div>
      <div className="skeleton mt-3 h-64 rounded-2xl" />
    </div>
  );
}
