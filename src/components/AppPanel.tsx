"use client";

import type { useDevice } from "./useDevice";
import { LogoMark } from "./Logo";
import { CheckIcon } from "./Icons";
import { timeAgo } from "@/lib/client";

type Device = ReturnType<typeof useDevice>;

/** In the app: sync status. On the web: how to get real feeds (use the app). */
export function AppPanel({ device }: { device: Device }) {
  if (device.where === "checking") return null;

  if (device.where === "app") {
    const active = Object.values(device.hello?.enabled ?? {}).filter(Boolean).length;
    const last = device.hello?.lastSyncAt;
    return (
      <div className="mx-4 mb-6 flex items-center gap-3 rounded-2xl border border-line-soft px-4 py-3 sm:mx-0">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <CheckIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">Your feeds sync from this phone</p>
          <p className="text-[13px] text-muted">
            {active ? `${active} account${active > 1 ? "s" : ""} connected` : "Tap Connect to log in to an account"}
            {last ? ` · synced ${timeAgo(new Date(last).toISOString())} ago` : ""}
          </p>
        </div>
        {active > 0 && (
          <button className="btn-ghost py-1.5" onClick={() => device.syncNow()}>
            Sync now
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mx-4 mb-6 overflow-hidden rounded-2xl border border-line-soft sm:mx-0">
      <div className="flex gap-4 bg-gradient-to-br from-[#fa7e1e]/10 via-[#d62976]/10 to-[#2a78d6]/10 p-5">
        <LogoMark className="h-11 w-11" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold">Your real Instagram, TikTok & LinkedIn feeds live in the Mindclean app</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Open Mindclean on your phone and tap Connect to log in to your accounts right inside the app. Your feeds are read on your phone and show up here
            too. Your passwords go only to Instagram, TikTok or LinkedIn.
          </p>
        </div>
      </div>
      <p className="px-5 py-3 text-center text-xs text-muted">On this website, these platforms show a sample feed.</p>
    </div>
  );
}
