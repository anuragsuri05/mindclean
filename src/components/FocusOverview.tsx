"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Account, Plan } from "@/lib/types";
import { BUILD_BY_ID, REDUCE_BY_ID } from "@/lib/habits";
import { projectSchedule } from "@/lib/engine/schedule";
import { PLATFORM_BY_ID } from "@/lib/platforms";
import { api } from "@/lib/client";
import { MixLegend, PlanTimeline, mixLabels } from "./PlanTimeline";
import { PlatformAvatar } from "./PlatformAvatar";

export function FocusOverview({ plan, accounts, currentLevel }: { plan: Plan; accounts: Account[]; currentLevel: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const schedule = projectSchedule(plan, plan.pageSize);
  const { fromLabel, toLabel } = mixLabels(plan.reduceHabits);
  const currentDay = Math.min(currentLevel + 1, plan.durationDays);
  const pct = Math.round((currentLevel / Math.max(1, plan.durationDays - 1)) * 100);

  async function setStatus(status: "active" | "paused" | "ended") {
    if (status === "ended" && !confirm("End this plan? Your feed goes back to showing everything you've connected.")) return;
    setBusy(true);
    await api("/api/plan", { method: "PATCH", body: JSON.stringify({ status }) });
    if (status === "ended") router.push("/app/focus?new=1");
    router.refresh();
    setBusy(false);
  }

  const group = (ids: string[]) => accounts.filter((a) => ids.includes(a.id));

  return (
    <div className="mx-auto w-full max-w-[600px] px-4 pt-8 pb-16 sm:px-0">
      <p className="text-xs font-bold tracking-widest text-accent uppercase">
        {plan.status === "completed" ? "Program complete 🎉" : plan.status === "paused" ? "Paused" : `Day ${currentDay} of ${plan.durationDays}`}
      </p>
      <h1 className="mt-2 text-2xl leading-snug font-bold tracking-tight sm:text-[28px]">{plan.goalProfile.summary}</h1>

      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-gradient-to-r from-from to-to transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-muted">{pct}% through your program</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Habits title="Scrolling less" tone="from" items={plan.reduceHabits.map((id) => REDUCE_BY_ID[id]).filter(Boolean)} sources={group(plan.fromAccountIds)} />
        <Habits title="Building" tone="to" items={plan.buildHabits.map((id) => BUILD_BY_ID[id]).filter(Boolean)} sources={group(plan.toAccountIds)} />
      </div>

      <div className="mt-6 rounded-2xl border border-line-soft p-2 sm:p-3">
        <div className="flex items-center justify-between px-3 pt-2 pb-3">
          <p className="text-[15px] font-bold">Your transition</p>
          <MixLegend fromLabel={fromLabel} toLabel={toLabel} />
        </div>
        <PlanTimeline schedule={schedule} fromLabel={fromLabel} toLabel={toLabel} currentDay={plan.status === "completed" ? plan.durationDays + 1 : currentDay} maxRows={14} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {plan.status === "active" && (
          <button className="btn-ghost" disabled={busy} onClick={() => setStatus("paused")}>
            Pause
          </button>
        )}
        {plan.status === "paused" && (
          <button className="btn-primary" disabled={busy} onClick={() => setStatus("active")}>
            Resume
          </button>
        )}
        <Link href="/app/focus?new=1" className="btn-ghost">
          {plan.status === "completed" ? "Start a new program" : "Change focus"}
        </Link>
        <button className="btn-ghost text-danger" disabled={busy} onClick={() => setStatus("ended")}>
          End plan
        </button>
      </div>
    </div>
  );
}

function Habits({
  title,
  tone,
  items,
  sources,
}: {
  title: string;
  tone: "from" | "to";
  items: { id: string; label: string; emoji: string }[];
  sources: Account[];
}) {
  return (
    <div className="rounded-2xl border border-line-soft p-4">
      <p className={`mb-3 text-xs font-bold tracking-wide uppercase ${tone === "to" ? "text-to" : "text-from"}`}>
        {tone === "to" ? "↑" : "↓"} {title}
      </p>
      <ul className="space-y-1.5 text-sm font-medium">
        {items.map((h) => (
          <li key={h.id}>
            <span className="mr-2">{h.emoji}</span>
            {h.label}
          </li>
        ))}
      </ul>
      {sources.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {sources.map((a) => (
            <span key={a.id} title={`${PLATFORM_BY_ID[a.platform].name} · ${a.displayName}`}>
              <PlatformAvatar platform={a.platform} size={22} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
