"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { CHATGPT_ERRORS, ChatGptLogo } from "./ChatGptCard";

type Mode = "login" | "signup";

/** The one entry point: log in or sign up, Instagram-web style. */
export function AuthScreen({ chatgptError }: { chatgptError?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signup");
  const [error, setError] = useState<string | null>(chatgptError ? (CHATGPT_ERRORS[chatgptError] ?? "ChatGPT sign-in failed.") : null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) {
      router.replace("/app");
      router.refresh();
    } else {
      setError((await res.json().catch(() => null))?.error ?? "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-[880px] items-center justify-center gap-10">
        <PhonePreview />

        <div className="w-full max-w-[350px] space-y-3">
          <div className="border-line px-6 pt-10 pb-6 sm:border sm:px-10">
            <div className="mb-3 flex justify-center">
              <Logo className="scale-125" />
            </div>
            <p className="mb-6 text-center text-[15px] font-semibold text-muted">Scroll with intention. Grow a little every day.</p>

            <a href="/api/chatgpt/start?mode=login" className="btn-dark w-full py-2.5">
              <ChatGptLogo className="h-4 w-4" /> Continue with ChatGPT
            </a>

            <div className="my-5 flex items-center gap-4 text-[13px] font-semibold text-muted">
              <span className="h-px flex-1 bg-line" /> OR <span className="h-px flex-1 bg-line" />
            </div>

            <form onSubmit={submit} className="space-y-2" key={mode}>
              {mode === "signup" && <input name="name" className="input" placeholder="Full name" required autoComplete="name" aria-label="Full name" />}
              <input name="email" type="email" className="input" placeholder="Email" required autoComplete="email" aria-label="Email" />
              <input
                name="password"
                type="password"
                className="input"
                placeholder="Password"
                required
                minLength={mode === "signup" ? 8 : undefined}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                aria-label="Password"
              />
              <button className="btn-primary !mt-4 w-full" disabled={busy}>
                {busy ? "One moment…" : mode === "signup" ? "Sign up" : "Log in"}
              </button>
            </form>

            {error && (
              <p role="alert" className="mt-4 text-center text-sm text-danger">
                {error}
              </p>
            )}
            {mode === "signup" && (
              <p className="mt-5 text-center text-xs leading-relaxed text-muted">
                Mindclean reads your feeds; it never posts, likes or messages for you. Nothing is ever blocked.
              </p>
            )}
          </div>

          <div className="border-line py-5 text-center text-sm sm:border">
            {mode === "signup" ? "Have an account? " : "Don't have an account? "}
            <button
              className="btn-link"
              onClick={() => {
                setMode(mode === "signup" ? "login" : "signup");
                setError(null);
              }}
            >
              {mode === "signup" ? "Log in" : "Sign up"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

const DEMO = [
  { kind: "reel", emoji: "😂", bg: "linear-gradient(135deg,#f97316,#ec4899)", label: "Reel" },
  { kind: "post", emoji: "💼", bg: "linear-gradient(135deg,#0a66c2,#14b8a6)", label: "LinkedIn" },
  { kind: "reel", emoji: "💃", bg: "linear-gradient(135deg,#a855f7,#f472b6)", label: "Reel" },
  { kind: "post", emoji: "📰", bg: "linear-gradient(135deg,#334155,#0f172a)", label: "News" },
];

/** A phone that shows the daily mix shifting from Reels to meaningful posts. */
function PhonePreview() {
  const [day, setDay] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDay((d) => (d + 1) % 7), 1600);
    return () => clearInterval(t);
  }, []);
  const meaningful = day + 2;

  return (
    <div className="relative hidden h-[580px] w-[300px] shrink-0 rounded-[44px] border-[10px] border-ink bg-bg p-3 shadow-2xl lg:block" aria-hidden>
      <div className="absolute top-2 left-1/2 h-5 w-24 -translate-x-1/2 rounded-full bg-ink" />
      <div className="mt-6 flex items-center justify-between px-1">
        <span className="font-display text-lg font-semibold italic">mindclean</span>
        <span className="text-[11px] font-semibold text-muted">Day {day + 1} of 7</span>
      </div>
      <div className="mt-3 flex gap-[3px] px-1">
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${i >= 10 - meaningful ? "bg-to" : "bg-from/70"}`}
          />
        ))}
      </div>
      <p className="mt-1.5 px-1 text-[11px] text-muted transition-all">
        {10 - meaningful} Reels · {meaningful} meaningful in every 10
      </p>
      <div className="mt-3 space-y-2.5 overflow-hidden">
        {DEMO.map((d, i) => {
          const isTo = d.kind === "post";
          const visible = isTo || i < Math.max(1, 3 - Math.floor(day / 2));
          return (
            <div
              key={i}
              className={`flex items-center gap-3 rounded-2xl border border-line-soft p-2.5 transition-all duration-700 ${visible ? "opacity-100" : "opacity-30 grayscale"}`}
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-2xl" style={{ background: d.bg }}>
                {d.emoji}
              </span>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${isTo ? "bg-to/15 text-to" : "bg-from/15 text-from"}`}>{d.label}</span>
                </div>
                <div className="h-2 w-full rounded bg-surface-3" />
                <div className="h-2 w-2/3 rounded bg-surface-3" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
