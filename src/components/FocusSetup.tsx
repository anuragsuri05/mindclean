"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Account } from "@/lib/types";
import { BUDGETS, BUILD_HABITS, ENDPOINTS, INTERESTS, REDUCE_HABITS, assignAccounts, type Habit } from "@/lib/habits";
import { DURATIONS, dailyGoal, projectSchedule } from "@/lib/engine/schedule";
import { PLATFORM_BY_ID } from "@/lib/platforms";
import { api } from "@/lib/client";
import { CheckIcon, ChevronLeft, SparkIcon } from "./Icons";
import { PlanTimeline, mixLabels } from "./PlanTimeline";
import { PlatformAvatar } from "./PlatformAvatar";

interface Generated {
  summary: string;
  targetTopics: string[];
  avoidTopics: string[];
  fromAccountIds: string[];
  toAccountIds: string[];
  coaching: string;
  source: "chatgpt" | "claude" | "heuristic";
}

const STEPS = ["Less of", "More of", "Interests", "Program"] as const;

/**
 * Focus Setup: four quick choices, then a personalised, day-by-day transition
 * plan to review and start.
 */
const DRAFT_KEY = "mindclean.focusDraft";
type Draft = { step: number; reduce: string[]; build: string[]; interests: string[]; note: string; duration: number; endRatio: number; startRatio: number; budget: number; adaptive: boolean };

/** Choices survive a detour to connect a source (per browser tab; storage may be unavailable). */
function loadDraft(): Partial<Draft> {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "{}") as Partial<Draft>;
  } catch {
    return {};
  }
}

export function FocusSetup({ accounts, mode }: { accounts: Account[]; mode: "onboarding" | "new" }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [reduce, setReduce] = useState<string[]>(["reels"]);
  const [build, setBuild] = useState<string[]>(["professional", "news"]);
  const [interests, setInterests] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [duration, setDuration] = useState<number>(7);
  const [endRatio, setEndRatio] = useState(0.8);
  const [startRatio, setStartRatio] = useState(0.2);
  const [budget, setBudget] = useState(100);
  const [adaptive, setAdaptive] = useState(true);
  const [restored, setRestored] = useState(false);
  // Restore after mount (not during render) so server and client HTML match.
  useEffect(() => {
    const d = loadDraft();
    if (d.step !== undefined) setStep(d.step);
    if (d.reduce) setReduce(d.reduce);
    if (d.build) setBuild(d.build);
    if (d.interests) setInterests(d.interests);
    if (d.note !== undefined) setNote(d.note);
    if (d.duration) setDuration(d.duration);
    if (d.endRatio) setEndRatio(d.endRatio);
    if (d.startRatio) setStartRatio(d.startRatio);
    if (d.budget) setBudget(d.budget);
    if (d.adaptive !== undefined) setAdaptive(d.adaptive);
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step, reduce, build, interests, note, duration, endRatio, startRatio, budget, adaptive }));
    } catch {
      /* storage unavailable: choices just won't be restored */
    }
  }, [restored, step, reduce, build, interests, note, duration, endRatio, startRatio, budget, adaptive]);
  const [plan, setPlan] = useState<Generated | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schedule = useMemo(() => projectSchedule({ startRatio, endRatio, durationDays: duration }), [startRatio, endRatio, duration]);
  const { fromLabel, toLabel } = mixLabels(reduce);
  const preview = assignAccounts(accounts, reduce, build);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const canNext = [reduce.length > 0, build.length > 0, true, true][step];

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const { plan } = await api<{ plan: Generated }>("/api/plan/generate", {
        method: "POST",
        body: JSON.stringify({ reduceHabits: reduce, buildHabits: build, interests, note }),
      });
      setPlan(plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't generate a plan");
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/plan", {
        method: "POST",
        body: JSON.stringify({
          reduceHabits: reduce,
          buildHabits: build,
          note,
          goalProfile: { summary: plan.summary, targetTopics: plan.targetTopics, avoidTopics: plan.avoidTopics },
          fromAccountIds: plan.fromAccountIds,
          toAccountIds: plan.toAccountIds,
          startRatio,
          endRatio,
          durationDays: duration,
          dailyBudget: budget,
          adaptive,
        }),
      });
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      router.push("/app?started=1");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the plan");
      setBusy(false);
    }
  }

  if (plan) {
    const names = (ids: string[]) => ids.map((id) => accounts.find((a) => a.id === id)).filter((a): a is Account => Boolean(a));
    return (
      <div className="animate-in mx-auto w-full max-w-[600px] px-4 pt-8 pb-32 sm:px-0">
        <button className="mb-4 flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink" onClick={() => setPlan(null)}>
          <ChevronLeft className="h-4 w-4" /> Adjust
        </button>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-widest text-accent uppercase">
          <SparkIcon className="h-3.5 w-3.5" /> Your {duration}-day plan
        </p>
        <h1 className="text-2xl leading-snug font-bold tracking-tight sm:text-[28px]">{plan.summary}</h1>
        <p className="mt-2 text-[15px] text-muted">{plan.coaching}</p>
        <p className="mt-1 text-xs text-muted">
          {plan.source === "chatgpt" ? "Personalised with your ChatGPT plan" : plan.source === "claude" ? "Personalised with Claude" : "Built from your choices"}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <SourceGroup title="Less of" tone="from" accounts={names(plan.fromAccountIds)} />
          <SourceGroup title="More of" tone="to" accounts={names(plan.toAccountIds)} />
        </div>

        {plan.targetTopics.length > 0 && (
          <div className="mt-5">
            <p className="label">We&apos;ll prioritise</p>
            <div className="flex flex-wrap gap-1.5">
              {plan.targetTopics.map((t) => (
                <span key={t} className="rounded-full bg-surface-3 px-3 py-1 text-[13px] font-medium">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-line-soft p-2 sm:p-3">
          <div className="flex items-center justify-between px-3 pt-2 pb-3">
            <p className="text-[15px] font-bold">Every 10 posts, day by day</p>
            <p className="text-xs text-muted">Day 1 goal: {dailyGoal(schedule[0].ratio, budget)} meaningful</p>
          </div>
          <PlanTimeline schedule={schedule} fromLabel={fromLabel} toLabel={toLabel} maxRows={12} />
        </div>

        {error && <p className="mt-4 text-sm text-danger">{error}</p>}
        <StickyFooter>
          <button className="btn-primary w-full py-3 text-[15px]" disabled={busy} onClick={start}>
            {busy ? "Starting…" : "Start my plan"}
          </button>
        </StickyFooter>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[600px] px-4 pt-6 pb-32 sm:px-0">
      {mode === "onboarding" && <p className="mb-3 text-xs font-bold tracking-widest text-accent uppercase">Step 2 of 2 · Focus setup</p>}
      <div className="mb-6 flex gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <span key={s} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-ink" : "bg-surface-3"}`} />
        ))}
      </div>

      <div key={step} className="animate-in">
        {step === 0 && (
          <Section title="What do you want to scroll less?" subtitle="Pick what pulls you into endless scrolling.">
            <HabitList habits={REDUCE_HABITS} selected={reduce} onToggle={(id) => toggle(reduce, setReduce, id)} accounts={accounts} />
          </Section>
        )}
        {step === 1 && (
          <Section title="What do you want more of?" subtitle="We'll gradually make room for these in your feed.">
            <HabitList habits={BUILD_HABITS} selected={build} onToggle={(id) => toggle(build, setBuild, id)} accounts={accounts} />
            {preview.to.length === 0 && build.length > 0 && (
              <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2.5 text-[13px] text-muted">
                None of your connected sources fit these yet.{" "}
                <Link className="btn-link" href={mode === "onboarding" ? "/welcome/connect" : "/app/sources"}>
                  Connect LinkedIn or a news source
                </Link>
              </p>
            )}
          </Section>
        )}
        {step === 2 && (
          <Section title="What are you into?" subtitle="We use this to pick the best posts and articles for you.">
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((t) => {
                const on = interests.includes(t);
                return (
                  <button
                    key={t}
                    className={`chip ${on ? "border-ink bg-ink text-bg" : "hover:bg-surface-2"}`}
                    onClick={() => toggle(interests, setInterests, t)}
                    aria-pressed={on}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            <label className="label mt-6" htmlFor="note">
              Anything else? (optional)
            </label>
            <textarea
              id="note"
              className="input min-h-24 resize-none"
              placeholder="e.g. I'm preparing for product manager interviews and want to follow AI startups."
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
            />
          </Section>
        )}
        {step === 3 && (
          <Section title="Design your program" subtitle="A gentle, steady shift. Nothing gets blocked.">
            <Field label="How long?">
              <Segmented options={DURATIONS.map((d) => ({ value: d, label: `${d} days` }))} value={duration} onChange={setDuration} />
            </Field>
            <Field label="Where do you want to end up?">
              <Segmented options={ENDPOINTS.map((e) => ({ value: e.ratio, label: e.label, hint: e.hint }))} value={endRatio} onChange={setEndRatio} />
            </Field>
            <Field label="How much do you scroll on a typical day?">
              <Segmented options={BUDGETS.map((b) => ({ value: b.value, label: b.label }))} value={budget} onChange={setBudget} />
            </Field>
            <Field label="Starting mix">
              <Segmented
                options={[
                  { value: 0.1, label: "Gentle", hint: "9 + 1" },
                  { value: 0.2, label: "Standard", hint: "8 + 2" },
                  { value: 0.3, label: "Eager", hint: "7 + 3" },
                ]}
                value={startRatio}
                onChange={setStartRatio}
              />
            </Field>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line-soft p-4">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={adaptive} onChange={(e) => setAdaptive(e.target.checked)} />
              <span>
                <span className="block text-sm font-semibold">Adapt to me</span>
                <span className="block text-[13px] text-muted">If the new content isn&apos;t landing on a given day, we hold the mix instead of pushing harder.</span>
              </span>
            </label>
            {preview.to.length === 0 && (
              <p role="alert" className="mt-5 rounded-xl border border-from/40 bg-from/10 px-4 py-3 text-[13px]">
                <strong>Almost there.</strong> Your plan needs at least one source of the content you want more of, like{" "}
                {build.map((id) => BUILD_HABITS.find((h) => h.id === id)?.label).filter(Boolean).join(", ") || "LinkedIn or news"}. Right now you&apos;ve
                only connected {[...new Set(accounts.map((a) => PLATFORM_BY_ID[a.platform].name))].join(", ")}. Connect LinkedIn, Google News, a
                publication or Inshorts, then come back. Your choices here are kept.
              </p>
            )}
            <div className="mt-5 rounded-2xl bg-surface-2 p-4">
              <p className="mb-3 text-[13px] font-semibold">Preview</p>
              <PlanTimeline schedule={schedule} fromLabel={fromLabel} toLabel={toLabel} maxRows={5} />
            </div>
          </Section>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      <StickyFooter>
        <div className="flex gap-2">
          {step > 0 && (
            <button className="btn-ghost px-5 py-3" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button className="btn-primary flex-1 py-3 text-[15px]" disabled={!canNext} onClick={() => setStep(step + 1)}>
              Next
            </button>
          ) : preview.to.length === 0 ? (
            // Nothing connected matches the habits to build: say so and offer the fix.
            <Link className="btn-primary flex-1 py-3 text-[15px]" href={mode === "onboarding" ? "/welcome/connect" : "/app/sources"}>
              Connect something to shift toward
            </Link>
          ) : (
            <button className="btn-primary flex-1 py-3 text-[15px]" disabled={busy} onClick={generate}>
              {busy ? (
                "Creating your plan…"
              ) : (
                <>
                  <SparkIcon className="h-4 w-4" /> Generate my plan
                </>
              )}
            </button>
          )}
        </div>
      </StickyFooter>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section>
      <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h1>
      <p className="mt-1.5 mb-6 text-[15px] text-muted">{subtitle}</p>
      {children}
    </section>
  );
}

function HabitList({ habits, selected, onToggle, accounts }: { habits: Habit[]; selected: string[]; onToggle: (id: string) => void; accounts: Account[] }) {
  return (
    <div className="space-y-2.5">
      {habits.map((h) => {
        const on = selected.includes(h.id);
        const connected = [...new Set(accounts.filter((a) => h.platforms.includes(a.platform)).map((a) => a.platform))];
        return (
          <button
            key={h.id}
            onClick={() => onToggle(h.id)}
            aria-pressed={on}
            className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition active:scale-[0.99] ${
              on ? "border-ink bg-surface-2" : "border-line-soft hover:bg-surface-2"
            }`}
          >
            <span className="text-3xl" aria-hidden>
              {h.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">{h.label}</span>
              <span className="block truncate text-[13px] text-muted">{h.hint}</span>
              {connected.length > 0 && (
                <span className="mt-1.5 flex items-center gap-1">
                  {connected.map((p) => (
                    <PlatformAvatar key={p} platform={p} size={18} />
                  ))}
                  <span className="ml-1 text-[11px] text-muted">connected</span>
                </span>
              )}
            </span>
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${on ? "border-accent bg-accent text-white" : "border-line"}`}
            >
              {on && <CheckIcon className="h-3.5 w-3.5" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SourceGroup({ title, tone, accounts }: { title: string; tone: "from" | "to"; accounts: Account[] }) {
  return (
    <div className="rounded-2xl border border-line-soft p-4">
      <p className={`mb-2.5 text-xs font-bold tracking-wide uppercase ${tone === "to" ? "text-to" : "text-from"}`}>
        {tone === "to" ? "↑" : "↓"} {title}
      </p>
      {accounts.length === 0 ? (
        <p className="text-[13px] text-muted">Nothing connected</p>
      ) : (
        <ul className="space-y-2">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-[13px] font-medium">
              <PlatformAvatar platform={a.platform} size={22} />
              <span className="truncate">{a.mode === "live" ? a.displayName : PLATFORM_BY_ID[a.platform].name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="label">{label}</p>
      {children}
    </div>
  );
}

function Segmented<T extends number>({ options, value, onChange }: { options: { value: T; label: string; hint?: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 4)}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            className={`rounded-xl border px-2 py-3 text-center transition active:scale-[0.98] ${on ? "border-ink bg-ink text-bg" : "border-line-soft hover:bg-surface-2"}`}
          >
            <span className="block text-[13px] font-semibold">{o.label}</span>
            {o.hint && <span className={`block text-[11px] ${on ? "opacity-70" : "text-muted"}`}>{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

function StickyFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-14 z-30 border-t border-line-soft bg-bg/95 px-4 py-3 backdrop-blur md:bottom-0 md:pl-[88px] xl:pl-[260px] [.welcome_&]:bottom-0 [.welcome_&]:md:pl-4">
      <div className="mx-auto max-w-[600px]">{children}</div>
    </div>
  );
}
