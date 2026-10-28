"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Account, Plan, PlanDay } from "@/lib/types";
import { PLATFORM_BY_ID } from "@/lib/platforms";
import { api, localDay } from "@/lib/client";
import { projectSchedule } from "@/lib/engine/schedule";
import { PostCard, type FeedPost } from "./PostCard";
import { PlatformAvatar } from "./PlatformAvatar";
import { MixBar, mixLabels } from "./PlanTimeline";
import { useTracker } from "./useTracker";
import { LogoMark } from "./Logo";
import { CheckIcon, FlameIcon, SparkIcon } from "./Icons";

interface FeedResponse {
  items: FeedPost[];
  today: PlanDay | null;
  goal: number | null;
  sessionId?: string;
  caughtUp?: boolean;
  nextOffset?: number | null;
}

interface Props {
  accounts: Account[];
  plan: Plan | null;
  userName: string;
  started: boolean;
}

export function Feed({ accounts, plan, userName, started }: Props) {
  const [view, setView] = useState<string>("mix");
  const [items, setItems] = useState<FeedPost[]>([]);
  const [today, setToday] = useState<PlanDay | null>(null);
  const [goal, setGoal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engagedToday, setEngagedToday] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const paging = useRef<{ session?: string; offset?: number }>({});
  const generation = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<FeedPost[]>([]);
  itemsRef.current = items;
  const counted = useRef(new Set<string>());

  // Live goal progress: count meaningful posts the user actually engaged with.
  const onEngaged = useCallback((id: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (item?.bucket === "to" && !counted.current.has(id)) {
      counted.current.add(id);
      setEngagedToday((n) => n + 1);
    }
  }, []);
  const { track, engage, skip } = useTracker(onEngaged);

  const load = useCallback(
    async (reset: boolean) => {
      if (reset) {
        generation.current += 1;
        paging.current = {};
        setItems([]);
        setDone(false);
        setError(null);
        window.scrollTo({ top: 0 });
      }
      const gen = generation.current;
      setLoading(true);
      const params = new URLSearchParams({ view, day: localDay() });
      if (view === "mix" && paging.current.session) params.set("session", paging.current.session);
      if (view !== "mix") params.set("offset", String(paging.current.offset ?? 0));
      try {
        const data = await api<FeedResponse>(`/api/feed?${params}`);
        if (gen !== generation.current) return;
        setToday(data.today);
        setGoal(data.goal);
        if (data.today && reset) setEngagedToday((n) => Math.max(n, data.today!.engagedTo));
        setItems((prev) => {
          const ids = new Set(prev.map((i) => i.id));
          return [...prev, ...data.items.filter((i) => !ids.has(i.id))];
        });
        if (view === "mix") {
          paging.current.session = data.sessionId;
          setDone(Boolean(data.caughtUp));
        } else {
          paging.current.offset = data.nextOffset ?? undefined;
          setDone(data.nextOffset == null);
        }
      } catch (err) {
        if (gen === generation.current) setError(err instanceof Error ? err.message : "Couldn't load your feed");
      } finally {
        if (gen === generation.current) setLoading(false);
      }
    },
    [view],
  );

  useEffect(() => {
    load(true);
  }, [load]);

  useEffect(() => {
    if (!started || !plan) return;
    const first = projectSchedule(plan)[0];
    const { fromLabel } = mixLabels(plan.reduceHabits);
    setToast(`Your plan has started. Day 1: ${first.fromPerPage} ${fromLabel} + ${first.toPerPage} meaningful in every 10.`);
    window.history.replaceState(null, "", "/app");
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [started, plan]);

  // Infinite scroll
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && !done && !error && items.length > 0) load(false);
      },
      { rootMargin: "1200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [load, loading, done, error, items.length]);

  const save = useCallback((id: string, saved: boolean) => {
    api("/api/saved", { method: "POST", body: JSON.stringify({ itemId: id, saved }) }).catch(() => {});
  }, []);

  const goalPct = goal ? Math.min(1, engagedToday / goal) : 0;
  const labels = plan ? mixLabels(plan.reduceHabits) : { fromLabel: "entertainment", toLabel: "meaningful" };
  const toPer10 = today ? Math.round(today.ratio * 10) : 0;
  const seenTo = items.filter((i) => i.bucket === "to").length;

  return (
    <div className="flex justify-center gap-16 md:pt-6 lg:px-8">
      <div className="w-full max-w-[470px]">
        <Stories
          accounts={accounts}
          plan={plan}
          view={view}
          setView={setView}
          goal={goal}
          engaged={engagedToday}
          goalPct={goalPct}
        />

        {view === "mix" && plan && today && (
          <Link href="/app/focus" className="mx-3 mt-1 mb-3 block rounded-xl bg-surface-2 px-3.5 py-3 transition hover:bg-surface-3 md:mx-0">
            <div className="mb-2 flex items-center justify-between gap-2 text-[13px]">
              <span className="font-semibold">
                {plan.status === "completed" ? "Program complete" : `Day ${today.level + 1} of ${plan.durationDays}`}
                {plan.status === "paused" && " · paused"}
              </span>
              <span className="text-muted">
                {10 - toPer10} {labels.fromLabel} + {toPer10} {labels.toLabel}
              </span>
            </div>
            <MixBar toPerPage={toPer10} className="h-1.5" />
            {today.held && (
              <p className="mt-2 text-xs text-muted">We kept today&apos;s mix steady. It shifts again once the new content starts landing.</p>
            )}
          </Link>
        )}
        {view !== "mix" && <SourceHeader account={accounts.find((a) => a.id === view)} onBack={() => setView("mix")} />}
        {view === "mix" && !plan && (
          <div className="mx-3 mb-4 rounded-xl bg-accent-soft p-4 text-sm md:mx-0">
            <p className="font-semibold">Your feed isn&apos;t shifting yet</p>
            <p className="mt-0.5 text-muted">Set a focus to start your gradual transition.</p>
            <Link href="/app/focus" className="btn-primary mt-3">
              Set my focus
            </Link>
          </div>
        )}

        <div>
          {items.map((item) => (
            <PostCard
              key={item.id}
              item={item}
              showBucket={Boolean(plan)}
              trackRef={track(item.id)}
              onEngage={() => engage(item.id)}
              onSkip={() => skip(item.id)}
              onSave={(s) => save(item.id, s)}
            />
          ))}
        </div>

        {error && (
          <div className="mx-3 my-6 rounded-xl border border-line-soft p-5 text-center text-sm md:mx-0">
            <p className="text-danger">{error}</p>
            <button className="btn-ghost mt-3" onClick={() => load(false)}>
              Try again
            </button>
          </div>
        )}
        {loading && <Skeleton count={items.length === 0 ? 2 : 1} />}
        {done && !loading && !error && (
          <CaughtUp
            mix={view === "mix"}
            seen={items.length}
            seenTo={seenTo}
            engaged={engagedToday}
            goal={goal}
            onRefresh={() => load(true)}
          />
        )}
        <div ref={sentinel} className="h-px" />
      </div>

      <RightRail userName={userName} plan={plan} today={today} goal={goal} engaged={engagedToday} goalPct={goalPct} accounts={accounts} />

      {toast && (
        <div className="animate-in fixed inset-x-4 bottom-20 z-50 mx-auto max-w-sm rounded-xl bg-ink px-4 py-3 text-sm text-bg shadow-2xl md:bottom-6" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function Ring({ pct, size = 66, children, gradient }: { pct: number; size?: number; children: React.ReactNode; gradient: string }) {
  return (
    <span
      className="relative flex items-center justify-center rounded-full"
      style={{ width: size, height: size, background: `conic-gradient(${gradient} ${pct * 360}deg, var(--surface-3) 0deg)` }}
    >
      <span className="absolute inset-[3px] flex items-center justify-center rounded-full bg-bg">{children}</span>
    </span>
  );
}

function Stories({
  accounts,
  plan,
  view,
  setView,
  goal,
  engaged,
  goalPct,
}: {
  accounts: Account[];
  plan: Plan | null;
  view: string;
  setView: (v: string) => void;
  goal: number | null;
  engaged: number;
  goalPct: number;
}) {
  const order = (a: Account) => (plan?.toAccountIds.includes(a.id) ? 0 : plan?.fromAccountIds.includes(a.id) ? 1 : 2);
  const sorted = [...accounts].sort((a, b) => order(a) - order(b));
  return (
    <div className="no-scrollbar flex gap-3.5 overflow-x-auto px-3 pt-3 pb-3 md:px-0" role="tablist" aria-label="Feeds">
      {plan && (
        <Link href="/app/progress" className="flex w-[70px] shrink-0 flex-col items-center gap-1.5" aria-label={`Today's goal: ${engaged} of ${goal ?? "…"}`}>
          <Ring pct={goalPct} gradient="#2a78d6, #22c1c3">
            <span className="text-center leading-none">
              <span className="block text-[15px] font-bold tabular-nums">{engaged}</span>
              <span className="block text-[10px] text-muted">of {goal ?? "–"}</span>
            </span>
          </Ring>
          <span className="text-xs">Your day</span>
        </Link>
      )}
      <StoryButton active={view === "mix"} onClick={() => setView("mix")} label="For you" ring="ring-story">
        <LogoMark className="h-9 w-9" />
      </StoryButton>
      {sorted.map((a) => {
        const meaningful = plan?.toAccountIds.includes(a.id);
        return (
          <StoryButton
            key={a.id}
            active={view === a.id}
            onClick={() => setView(view === a.id ? "mix" : a.id)}
            label={a.mode === "live" && a.platform !== "youtube" && a.platform !== "reddit" ? a.displayName.replace(/^Google News · /, "") : PLATFORM_BY_ID[a.platform].name}
            ring={meaningful ? "ring-meaningful" : plan?.fromAccountIds.includes(a.id) ? "ring-story" : "bg-line"}
          >
            <PlatformAvatar platform={a.platform} size={52} className="!rounded-full" />
          </StoryButton>
        );
      })}
    </div>
  );
}

function StoryButton({ active, onClick, label, ring, children }: { active: boolean; onClick: () => void; label: string; ring: string; children: React.ReactNode }) {
  return (
    <button role="tab" aria-selected={active} onClick={onClick} className="flex w-[70px] shrink-0 flex-col items-center gap-1.5">
      <span className={`rounded-full p-[2.5px] transition ${active ? ring : "bg-transparent"} ${active ? "scale-105" : ""}`}>
        <span className={`flex h-[61px] w-[61px] items-center justify-center rounded-full border-2 ${active ? "border-bg" : "border-line-soft"} bg-bg`}>{children}</span>
      </span>
      <span className={`w-full truncate text-center text-xs ${active ? "font-semibold" : "text-muted"}`}>{label}</span>
    </button>
  );
}

function SourceHeader({ account, onBack }: { account?: Account; onBack: () => void }) {
  if (!account) return null;
  const p = PLATFORM_BY_ID[account.platform];
  return (
    <div className="mx-3 mb-3 flex items-center gap-3 rounded-xl bg-surface-2 px-3.5 py-3 md:mx-0">
      <PlatformAvatar platform={account.platform} size={36} />
      <div className="min-w-0 flex-1 text-[13px]">
        <p className="truncate font-semibold">{account.displayName}</p>
        <p className="text-muted">
          {account.mode === "demo" ? "Sample feed · " : account.mode === "device" ? "Your real feed · " : ""}
          {p.name} in its own order
          {account.status === "error" && <span className="text-danger"> · {account.error}</span>}
        </p>
      </div>
      <button className="btn-link" onClick={onBack}>
        For you
      </button>
    </div>
  );
}

function CaughtUp({ mix, seen, seenTo, engaged, goal, onRefresh }: { mix: boolean; seen: number; seenTo: number; engaged: number; goal: number | null; onRefresh: () => void }) {
  return (
    <div className="animate-in flex flex-col items-center px-6 py-14 text-center">
      <span className="ring-story flex h-20 w-20 items-center justify-center rounded-full p-[3px]">
        <span className="flex h-full w-full items-center justify-center rounded-full bg-bg">
          <CheckIcon className="h-9 w-9" />
        </span>
      </span>
      <h3 className="mt-5 text-xl font-semibold">You&apos;re all caught up</h3>
      <p className="mt-1.5 max-w-xs text-sm text-muted">
        {mix && goal
          ? `You've seen ${seen} posts, ${seenTo} of them meaningful. Today's goal: ${Math.min(engaged, goal)}/${goal}.`
          : "You've seen everything new here."}
      </p>
      <p className="mt-1 text-sm text-muted">A good moment to put the phone down.</p>
      <div className="mt-5 flex gap-2">
        <Link href="/app/progress" className="btn-primary">
          See progress
        </Link>
        <button className="btn-ghost" onClick={onRefresh}>
          Refresh
        </button>
      </div>
    </div>
  );
}

function Skeleton({ count }: { count: number }) {
  return (
    <div aria-label="Loading" className="space-y-8 px-3 py-4 md:px-0">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <div className="mb-3 flex items-center gap-3">
            <div className="skeleton h-9 w-9 rounded-full" />
            <div className="skeleton h-3 w-32 rounded" />
          </div>
          <div className="skeleton aspect-[4/5] w-full rounded" />
          <div className="skeleton mt-3 h-3 w-2/3 rounded" />
        </div>
      ))}
    </div>
  );
}

function RightRail({
  userName,
  plan,
  today,
  goal,
  engaged,
  goalPct,
  accounts,
}: {
  userName: string;
  plan: Plan | null;
  today: PlanDay | null;
  goal: number | null;
  engaged: number;
  goalPct: number;
  accounts: Account[];
}) {
  const connected = new Set(accounts.map((a) => a.platform));
  const suggestions = (["linkedin", "googlenews", "news", "inshorts", "youtube"] as const).filter((p) => !connected.has(p)).slice(0, 3);
  const next = plan ? projectSchedule(plan).slice(today ? today.level + 1 : 1, (today ? today.level + 1 : 1) + 3) : [];

  return (
    <aside className="sticky top-6 hidden h-fit w-[320px] shrink-0 pt-2 lg:block">
      <div className="mb-6 flex items-center gap-3">
        <span className="ring-story rounded-full p-[2px]">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-bg bg-surface-3 text-sm font-bold">
            {userName.slice(0, 1).toUpperCase()}
          </span>
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="truncate font-semibold">{userName}</p>
          <p className="truncate text-muted">{plan ? plan.goalProfile.summary : "No focus set yet"}</p>
        </div>
        <Link href="/app/profile" className="text-xs font-semibold text-accent">
          Profile
        </Link>
      </div>

      {goal !== null && (
        <Link href="/app/progress" className="mb-6 flex items-center gap-4 rounded-2xl border border-line-soft p-4 transition hover:bg-surface-2">
          <Ring pct={goalPct} size={56} gradient="#2a78d6, #22c1c3">
            <span className="text-xs font-bold tabular-nums">{Math.round(goalPct * 100)}%</span>
          </Ring>
          <div className="text-sm">
            <p className="font-semibold">Today&apos;s goal</p>
            <p className="text-muted">
              {engaged} of {goal} meaningful posts
            </p>
            {goalPct >= 1 && (
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-to">
                <FlameIcon className="h-3.5 w-3.5" /> Goal reached
              </p>
            )}
          </div>
        </Link>
      )}

      {next.length > 0 && (
        <div className="mb-6">
          <p className="mb-3 text-sm font-semibold text-muted">Coming up</p>
          <ul className="space-y-3">
            {next.map((d) => (
              <li key={d.day} className="flex items-center gap-3 text-[13px]">
                <span className="w-12 shrink-0 font-semibold">Day {d.day}</span>
                <MixBar toPerPage={d.toPerPage} className="h-1.5" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mb-6">
          <p className="mb-3 text-sm font-semibold text-muted">Suggested for you</p>
          <ul className="space-y-3">
            {suggestions.map((p) => (
              <li key={p} className="flex items-center gap-3">
                <PlatformAvatar platform={p} size={36} className="!rounded-full" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold">{PLATFORM_BY_ID[p].name}</p>
                  <p className="truncate text-xs text-muted">{PLATFORM_BY_ID[p].tagline}</p>
                </div>
                <Link href="/app/sources" className="text-xs font-semibold text-accent">
                  Connect
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="flex items-center gap-1 text-[11px] text-muted">
        <SparkIcon className="h-3 w-3" /> Mindclean · Change what you scroll, not whether you scroll.
      </p>
    </aside>
  );
}
