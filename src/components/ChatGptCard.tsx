"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { ChatGptStatus } from "@/lib/chatgpt/store";

interface State {
  available: boolean;
  status: ChatGptStatus | null;
  models: { slug: string; name: string }[];
  modelsError: string | null;
}

export const CHATGPT_ERRORS: Record<string, string> = {
  denied: "ChatGPT sign-in was cancelled.",
  hosted:
    "Sign in with ChatGPT plan usage works when Mindclean runs on your own computer (http://127.0.0.1). Hosted apps need OpenAI's approval first.",
  registration: "ChatGPT didn't finish registering Mindclean. Please try again.",
  account_in_use: "That ChatGPT account is already linked to a different Mindclean account.",
  expired: "That sign-in took too long. Please try again.",
  exchange: "We couldn't complete the ChatGPT sign-in. Please try again.",
  oauth: "ChatGPT returned an error during sign-in.",
};

export function ChatGptLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.52 2.9A5.98 5.98 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.07Zm-9.02 12.61a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.8.8 0 0 0 .39-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.49 4.5ZM3.6 18.3a4.47 4.47 0 0 1-.53-3.01l.14.08 4.78 2.76a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06l-4.83 2.79a4.5 4.5 0 0 1-6.14-1.64ZM2.34 7.9a4.49 4.49 0 0 1 2.37-1.97V11.6a.77.77 0 0 0 .39.68l5.81 3.35-2.02 1.17a.08.08 0 0 1-.07 0l-4.83-2.79A4.5 4.5 0 0 1 2.34 7.87Zm16.6 3.86-5.84-3.39 2.02-1.16a.08.08 0 0 1 .07 0l4.83 2.79a4.49 4.49 0 0 1-.68 8.1v-5.68a.79.79 0 0 0-.4-.66Zm2.01-3.02-.14-.09-4.77-2.78a.78.78 0 0 0-.79 0L9.41 9.23V6.9a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66ZM8.31 12.86 6.29 11.7a.08.08 0 0 1-.04-.06V6.07a4.5 4.5 0 0 1 7.37-3.45l-.14.08-4.78 2.76a.8.8 0 0 0-.39.68Zm1.1-2.37 2.6-1.5 2.61 1.5v3l-2.6 1.5-2.6-1.5Z" />
    </svg>
  );
}

/** Connect / manage the ChatGPT plan that powers Mindclean's AI. */
export function ChatGptCard({ next, flash }: { next: string; flash?: { connected?: boolean; error?: string } }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = () => api<State>("/api/chatgpt").then(setState).catch(() => setState(null));
  useEffect(() => {
    load();
  }, []);

  const startUrl = `/api/chatgpt/start?mode=connect&next=${encodeURIComponent(next)}`;
  const s = state?.status;

  async function disconnect() {
    setBusy(true);
    const res = await api<{ revoked: boolean }>("/api/chatgpt", { method: "DELETE" });
    setNote(res.revoked ? "Disconnected from ChatGPT." : "Signed out locally, but ChatGPT didn't confirm the revocation. You can also disconnect Mindclean in ChatGPT → Settings → Security.");
    await load();
    setBusy(false);
  }

  async function chooseModel(model: string) {
    await api("/api/chatgpt", { method: "PATCH", body: JSON.stringify({ model }) });
    await load();
  }

  return (
    <section className="card p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-bg">
          <ChatGptLogo />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">AI powered by your ChatGPT plan</h2>
          <p className="mt-0.5 text-sm text-muted">
            Sign in with ChatGPT and Mindclean uses your Plus or Pro plan to design your plan and pick the best posts. No API key needed, and you
            control how much of your plan it can use.
          </p>
        </div>
      </div>

      {flash?.error && <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-danger">{CHATGPT_ERRORS[flash.error] ?? "ChatGPT sign-in failed."}</p>}
      {flash?.connected && s?.sharing && <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm">ChatGPT connected 🎉</p>}
      {note && <p className="mt-3 text-sm text-muted">{note}</p>}

      <div className="mt-4">
        {!state ? (
          <p className="text-sm text-muted">Checking connection…</p>
        ) : !state.available && !s?.connected ? (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">{CHATGPT_ERRORS.hosted}</p>
        ) : !s?.connected ? (
          <div className="space-y-2">
            {s?.error && <p className="text-sm text-danger">{s.error}</p>}
            <a href={startUrl} className="btn inline-flex bg-ink px-5 py-2.5 text-bg hover:opacity-90">
              <ChatGptLogo className="h-4 w-4" /> Sign in with ChatGPT
            </a>
          </div>
        ) : !s.sharing ? (
          <div className="space-y-2">
            <p className="text-sm">
              Signed in as <strong>{s.email ?? s.name}</strong>, but plan usage wasn&apos;t allowed, so Mindclean can&apos;t use your ChatGPT plan yet.
            </p>
            <div className="flex flex-wrap gap-2">
              <a href={startUrl} className="btn-primary">
                Allow plan usage
              </a>
              <button className="btn-ghost" disabled={busy} onClick={disconnect}>
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {s.picture && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.picture} alt="" className="h-7 w-7 rounded-full" />
              )}
              <span className="text-sm">
                <strong>{s.name ?? s.email}</strong>
                {s.name && s.email && <span className="text-muted"> · {s.email}</span>}
              </span>
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">Using ChatGPT plan</span>
            </div>

            {s.limitedUntil && (
              <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
                {s.error} Mindclean is using keyword ranking for now.{" "}
                <a className="text-accent underline" href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer">
                  Manage usage
                </a>
              </p>
            )}
            {!s.limitedUntil && s.status !== "ok" && s.error && <p className="text-sm text-danger">{s.error}</p>}

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-muted" htmlFor="cgpt-model">
                Model
              </label>
              <select
                id="cgpt-model"
                className="input w-auto py-1.5"
                value={s.model ?? state.models[0]?.slug ?? ""}
                onChange={(e) => chooseModel(e.target.value)}
                disabled={state.models.length === 0}
              >
                {state.models.length === 0 && <option value="">{state.modelsError ?? "Default"}</option>}
                {state.models.map((m) => (
                  <option key={m.slug} value={m.slug}>
                    {m.name}
                  </option>
                ))}
              </select>
              <a className="btn-ghost" href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer">
                Manage usage ↗
              </a>
              <button className="btn-ghost text-danger" disabled={busy} onClick={disconnect}>
                Disconnect
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
