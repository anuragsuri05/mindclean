"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FeedItem } from "@/lib/types";
import { BookmarkIcon, PlayIcon } from "./Icons";
import { ChatGptCard } from "./ChatGptCard";
import { PlatformAvatar } from "./PlatformAvatar";
import { mediaSrc } from "@/lib/media";

interface Props {
  user: { name: string; email: string };
  sources: number;
  activeDays: number;
  streak: number;
  saved: FeedItem[];
  planSummary: string | null;
  chatgptFlash: { connected?: boolean; error?: string };
}

export function ProfileView({ user, sources, activeDays, streak, saved, planSummary, chatgptFlash }: Props) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-[935px] px-4 pt-8 pb-16 md:px-8">
      <header className="flex items-center gap-6 border-b border-line-soft pb-8 sm:gap-16 sm:px-8">
        <span className="ring-story shrink-0 rounded-full p-[3px]">
          <span className="flex h-20 w-20 items-center justify-center rounded-full border-[3px] border-bg bg-surface-3 text-3xl font-bold sm:h-36 sm:w-36 sm:text-5xl">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-xl font-semibold">{user.name}</h1>
            <Link href="/app/focus" className="btn-ghost py-1.5">
              Edit focus
            </Link>
            <button className="btn-ghost py-1.5" onClick={logout}>
              Log out
            </button>
          </div>
          <ul className="mt-4 flex gap-6 text-[15px] sm:gap-10">
            <li>
              <strong>{activeDays}</strong> <span className="text-muted">days</span>
            </li>
            <li>
              <strong>{streak}</strong> <span className="text-muted">streak</span>
            </li>
            <li>
              <Link href="/app/sources">
                <strong>{sources}</strong> <span className="text-muted">sources</span>
              </Link>
            </li>
          </ul>
          <p className="mt-3 truncate text-sm text-muted">{user.email}</p>
          {planSummary && <p className="mt-1 text-sm">{planSummary}</p>}
        </div>
      </header>

      <div className="mx-auto mt-8 max-w-[600px]">
        <ChatGptCard next="/app/profile" flash={chatgptFlash} />
      </div>

      <section className="mt-10">
        <h2 className="flex items-center justify-center gap-1.5 border-t border-ink pt-4 text-xs font-semibold tracking-widest uppercase sm:mx-auto sm:w-fit">
          <BookmarkIcon className="h-3.5 w-3.5" /> Saved
        </h2>
        {saved.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-lg font-semibold">Save what&apos;s worth keeping</p>
            <p className="mt-1 text-sm text-muted">Tap the bookmark on any post to save it here.</p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-1">
            {saved.map((item) => (
              <SavedTile key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SavedTile({ item }: { item: FeedItem }) {
  const m = item.media[0];
  const inner = m?.gradient ? (
    <span className="flex h-full w-full items-center justify-center text-5xl" style={{ background: m.gradient }}>
      {m.emoji}
    </span>
  ) : m && (m.url || m.thumbnail) ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={mediaSrc(m.url ?? m.thumbnail)} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
  ) : (
    <span className="flex h-full w-full flex-col justify-between bg-surface-2 p-3 text-left">
      <span className="line-clamp-4 text-xs leading-snug font-semibold sm:text-sm">{item.title ?? item.text}</span>
      <PlatformAvatar platform={item.platform} size={20} />
    </span>
  );
  const content = (
    <span className="relative block aspect-square overflow-hidden bg-surface-3">
      {inner}
      {m && m.kind !== "image" && (
        <span className="absolute top-2 right-2 text-white drop-shadow">
          <PlayIcon className="h-4 w-4" />
        </span>
      )}
    </span>
  );
  return item.url ? (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="transition hover:opacity-85" title={item.title ?? item.text}>
      {content}
    </a>
  ) : (
    <div title={item.title ?? item.text}>{content}</div>
  );
}
