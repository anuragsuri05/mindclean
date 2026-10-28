"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DEVICE_PLATFORMS } from "@/lib/appBridge";
import type { Account } from "@/lib/types";
import { GROUPS, PLATFORMS, type PlatformInfo } from "@/lib/platforms";
import { BUILD_HABITS } from "@/lib/habits";
import { api, timeAgo } from "@/lib/client";
import { PlatformAvatar } from "./PlatformAvatar";
import { CheckIcon } from "./Icons";
import { AppPanel } from "./AppPanel";
import { useDevice } from "./useDevice";

interface Props {
  accounts: Account[];
  oauthReady: Record<string, boolean>;
  mode: "onboarding" | "manage";
  flash: { kind: "ok" | "error"; text: string } | null;
}

const MEANINGFUL = new Set(BUILD_HABITS.flatMap((h) => h.platforms));
const VIA_APP = new Set<string>(DEVICE_PLATFORMS);

export function ConnectSources({ accounts, oauthReady, mode, flash }: Props) {
  const router = useRouter();
  const [dialog, setDialog] = useState<PlatformInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waitingLogin, setWaitingLogin] = useState<string | null>(null);
  const returnTo = mode === "onboarding" ? "/welcome/connect" : "/app/sources";

  const device = useDevice();
  const byPlatform = (id: string) => accounts.filter((a) => a.platform === id);
  // Platforms without a usable official API get the user's real feed through the mobile app.
  const usesApp = (p: PlatformInfo) => VIA_APP.has(p.id) && (p.connect === "demo" || (p.connect === "oauth" && !oauthReady[p.id]));
  const inApp = device.where === "app";

  /**
   * Sign in on the platform's own login screen (opened by the app), then
   * wait for the first sync to land.
   */
  async function connectViaApp(p: PlatformInfo) {
    setBusy(p.id);
    setError(null);
    setWaitingLogin(p.id);
    const res = await device.connect(p.id);
    // Start waiting for the first sync only once the login is done: logins can take minutes.
    const started = Date.now();
    setWaitingLogin(null);
    if (!res.connected) {
      setError(
        res.reason === "closed"
          ? `You closed the ${p.name} login before finishing.`
          : res.reason === "unavailable"
            ? `${p.name} isn't available in your region.`
          : res.reason === "timeout"
            ? `Didn't see a ${p.name} login within 5 minutes. Try again when you're ready.`
            : `Couldn't connect ${p.name}${res.error ? `: ${res.error}` : "."}`,
      );
      setBusy(null);
      return;
    }
    while (Date.now() - started < 90_000) {
      await new Promise((r) => setTimeout(r, 2500));
      const status = await api<{ accounts: Account[] }>("/api/device/status").catch(() => null);
      const synced = status?.accounts.find((a) => a.platform === p.id && a.lastSyncedAt && Date.parse(a.lastSyncedAt) >= started - 1000);
      if (synced) break;
    }
    router.refresh();
    await device.refresh();
    setBusy(null);
  }

  // While the phone is still reading a feed, keep this screen fresh so results show up on their own.
  const anySyncing = Object.values(device.hello?.status ?? {}).some((s) => s.state === "syncing");
  const refreshDevice = device.refresh;
  useEffect(() => {
    if (!anySyncing) return;
    const t = setInterval(async () => {
      await refreshDevice();
      router.refresh();
    }, 4000);
    return () => clearInterval(t);
  }, [anySyncing, refreshDevice, router]);

  async function disconnectAppFeed(a: Account) {
    setBusy(a.id);
    await device.disconnect(a.platform);
    router.refresh();
    setBusy(null);
  }
  const hasMeaningful = accounts.some((a) => MEANINGFUL.has(a.platform));

  async function addSample(p: PlatformInfo) {
    setBusy(p.id);
    setError(null);
    try {
      await api("/api/accounts", { method: "POST", body: JSON.stringify({ platform: p.id, mode: "demo" }) });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't connect");
    } finally {
      setBusy(null);
    }
  }

  async function remove(a: Account) {
    setBusy(a.id);
    await api(`/api/accounts/${a.id}`, { method: "DELETE" }).catch(() => {});
    router.refresh();
    setBusy(null);
  }

  function connect(p: PlatformInfo) {
    if (usesApp(p) && inApp) connectViaApp(p);
    else if (p.connect === "form") setDialog(p);
    else if (p.connect === "oauth" && oauthReady[p.id]) window.location.href = `/api/oauth/${p.id}/start?next=${encodeURIComponent(returnTo)}`;
    else addSample(p);
  }

  return (
    <div className="mx-auto w-full max-w-[600px] pb-32">
      <div className="px-4 pt-8 pb-4 sm:px-0">
        {mode === "onboarding" && <p className="mb-2 text-xs font-bold tracking-widest text-accent uppercase">Step 1 of 2</p>}
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{mode === "onboarding" ? "Connect your platforms" : "Sources"}</h1>
        <p className="mt-1.5 text-[15px] text-muted">
          {mode === "onboarding"
            ? "Add where you scroll today and where you'd like to spend more time. You can change these anytime."
            : "Everything that feeds your daily mix."}
        </p>
      </div>

      {flash && (
        <p role="status" className={`mx-4 mb-4 rounded-lg px-4 py-3 text-sm sm:mx-0 ${flash.kind === "error" ? "bg-danger/10 text-danger" : "bg-accent-soft text-ink"}`}>
          {flash.text}
        </p>
      )}
      {error && <p className="mx-4 mb-4 text-sm text-danger sm:mx-0">{error}</p>}

      <AppPanel device={device} />

      {GROUPS.map((group) => (
        <section key={group.id} className="mb-6">
          <div className="px-4 pb-2 sm:px-0">
            <h2 className="text-[15px] font-bold">{group.title}</h2>
            <p className="text-xs text-muted">{group.subtitle}</p>
          </div>
          <ul className="divide-y divide-line-soft border-y border-line-soft sm:rounded-xl sm:border">
            {PLATFORMS.filter((p) => p.group === group.id).map((p) => {
              const connected = byPlatform(p.id);
              const isConnected = connected.length > 0;
              const viaExt = usesApp(p);
              const sampleOnly = viaExt ? !inApp : p.connect === "demo" || (p.connect === "oauth" && !oauthReady[p.id]);
              const appAccount = connected.find((a) => a.mode === "device");
              const syncing = busy === p.id || (viaExt && device.hello?.status[p.id]?.state === "syncing");
              const upgradeToReal = viaExt && inApp && isConnected && !appAccount;
              return (
                <li key={p.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <PlatformAvatar platform={p.id} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[15px] font-semibold">
                        {p.name}
                        {!sampleOnly && <span className="rounded bg-accent-soft px-1.5 py-px text-[10px] font-bold text-accent uppercase">Live</span>}
                      </div>
                      <div className="truncate text-[13px] text-muted" title={p.note}>
                        {p.tagline}
                      </div>
                    </div>
                    {upgradeToReal ? (
                      <button className="btn-primary min-w-[104px]" disabled={syncing} onClick={() => connectViaApp(p)}>
                        {waitingLogin === p.id ? "Logging in…" : syncing ? "Syncing…" : "Use my feed"}
                      </button>
                    ) : isConnected && !p.multiple ? (
                      <button
                        className="btn-ghost min-w-[104px]"
                        disabled={busy === connected[0].id}
                        onClick={() => (appAccount ? disconnectAppFeed(appAccount) : remove(connected[0]))}
                        title="Disconnect"
                      >
                        <CheckIcon className="h-4 w-4" /> Connected
                      </button>
                    ) : syncing ? (
                      <button className="btn-primary min-w-[104px]" disabled>
                        {waitingLogin === p.id ? "Logging in…" : "Syncing…"}
                      </button>
                    ) : (
                      <button className="btn-primary min-w-[104px]" disabled={busy === p.id} onClick={() => connect(p)}>
                        {busy === p.id ? "…" : isConnected ? "Add more" : "Connect"}
                      </button>
                    )}
                  </div>
                  {p.multiple && connected.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-2 pl-14">
                      {connected.map((a) => (
                        <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 py-1 pr-1.5 pl-3 text-xs font-medium">
                          {a.displayName}
                          <button
                            className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-line hover:text-ink"
                            onClick={() => remove(a)}
                            aria-label={`Remove ${a.displayName}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {waitingLogin === p.id && (
                    <p className="mt-1.5 pl-14 text-xs text-accent">
                      Log in to {p.name} on the screen that just opened. Your password goes to {p.name}, never to Mindclean.
                    </p>
                  )}
                  {isConnected && waitingLogin !== p.id && (
                    <AccountNote
                      account={connected.find((a) => a.status === "error") ?? appAccount ?? connected[0]}
                      platformNote={p.note}
                      viaExt={viaExt}
                      inApp={inApp}
                      syncing={syncing}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {mode === "onboarding" && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line-soft bg-bg/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-[600px] items-center gap-3">
            <p className="flex-1 text-[13px] text-muted">
              {accounts.length === 0
                ? "Connect at least one platform to continue."
                : hasMeaningful
                  ? `${accounts.length} connected. Looking good!`
                  : "Add LinkedIn or a news source so there's something meaningful to shift toward."}
            </p>
            <Link
              href="/welcome/focus"
              aria-disabled={accounts.length === 0}
              className={`btn-primary px-6 py-2.5 ${accounts.length === 0 ? "pointer-events-none opacity-40" : ""}`}
            >
              Continue
            </Link>
          </div>
        </div>
      )}

      {dialog && <ConnectDialog platform={dialog} onClose={() => setDialog(null)} onDone={() => router.refresh()} />}
    </div>
  );
}

function ConnectDialog({ platform, onClose, onDone }: { platform: PlatformInfo; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fields = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      await api("/api/accounts", { method: "POST", body: JSON.stringify({ platform: platform.id, mode: "live", fields }) });
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't connect");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="animate-in w-full max-w-[400px] rounded-t-2xl bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-title"
      >
        <div className="mb-5 flex items-center gap-3">
          <PlatformAvatar platform={platform.id} size={40} />
          <div>
            <h2 id="connect-title" className="text-lg font-bold">
              {platform.name}
            </h2>
            <p className="text-xs text-muted">{platform.note}</p>
          </div>
        </div>
        <div className="space-y-4">
          {platform.fields?.map((f) => (
            <div key={f.name}>
              <label className="label" htmlFor={f.name}>
                {f.label}
              </label>
              {f.type === "select" ? (
                <select id={f.name} name={f.name} className="input" defaultValue={f.options?.[0]?.value}>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input id={f.name} name={f.name} type={f.type} placeholder={f.placeholder} required={f.required} className="input" autoComplete="off" />
              )}
              {f.help && <p className="mt-1 text-xs text-muted">{f.help}</p>}
            </div>
          ))}
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-6 flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary flex-1" disabled={busy}>
            {busy ? "Connecting…" : "Connect"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AccountNote({ account, platformNote, viaExt, inApp, syncing }: { account: Account; platformNote: string; viaExt: boolean; inApp: boolean; syncing: boolean }) {
  let text = "";
  let tone = "text-muted";
  if (syncing) text = "Reading your feed from your browser…";
  else if (account.status === "error" && account.error) {
    text = account.error;
    tone = "text-danger";
  } else if (account.mode === "device") {
    text = inApp
      ? `Your real feed${account.lastSyncedAt ? ` · synced ${timeAgo(account.lastSyncedAt)} ago` : ""}`
      : "Your real feed · open the Mindclean app to keep it fresh";
  } else if (account.mode === "demo") {
    text = viaExt ? (inApp ? "Sample feed. Tap “Use my feed” to log in and switch to your real one." : "Sample feed. Connect it in the Mindclean app to see your real feed.") : `Sample feed. ${platformNote.split(".")[0]}.`;
  }
  return text ? <p className={`mt-1.5 pl-14 text-xs ${tone}`}>{text}</p> : null;
}
