"use client";

import { memo, useRef, useState } from "react";
import type { Media, MixedFeedItem } from "@/lib/types";
import { PLATFORM_BY_ID } from "@/lib/platforms";
import { timeAgo } from "@/lib/client";
import { ArrowUpRight, BookmarkIcon, HeartIcon, MoreIcon, PlayIcon, ShareIcon, SparkIcon } from "./Icons";
import { PlatformAvatar } from "./PlatformAvatar";
import { mediaSrc } from "@/lib/media";

export interface FeedPost extends MixedFeedItem {
  saved?: boolean;
}

interface Props {
  item: FeedPost;
  showBucket: boolean;
  trackRef: (el: HTMLElement | null) => void;
  onEngage: () => void;
  onSkip: () => void;
  onSave: (saved: boolean) => void;
}

const isNews = (p: string) => p === "googlenews" || p === "news" || p === "inshorts" || p === "rss";

function kindLabel(item: FeedPost): string {
  const m = item.media[0];
  if (m?.kind === "reel") return "Reel";
  if (m?.kind === "video") return "Video";
  if (isNews(item.platform)) return item.platform === "rss" ? "Article" : "News";
  return "Post";
}

/** One post, Instagram style: header, media (double-tap to like), actions, caption. */
export const PostCard = memo(function PostCard({ item, showBucket, trackRef, onEngage, onSkip, onSave }: Props) {
  const platform = PLATFORM_BY_ID[item.platform];
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(Boolean(item.saved));
  const [hidden, setHidden] = useState(false);
  const [burst, setBurst] = useState(0);
  const [menu, setMenu] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const lastTap = useRef(0);
  const meaningful = item.bucket === "to";
  const media = item.media[0];
  // Posts without media (LinkedIn text posts, headlines) render as a readable card.
  const textHeavy = !media;

  const like = () => {
    setLiked(true);
    setBurst((b) => b + 1);
    onEngage();
  };
  const onMediaTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) like();
    lastTap.current = now;
  };
  const toggleSave = () => {
    setSaved(!saved);
    onSave(!saved);
    if (!saved) onEngage();
  };
  const share = async () => {
    onEngage();
    if (!item.url) return;
    if (navigator.share) await navigator.share({ title: item.title ?? item.authorName, url: item.url }).catch(() => {});
    else window.open(item.url, "_blank", "noopener");
  };

  if (hidden) {
    return (
      <div className="feed-item mb-4 flex items-center justify-between rounded-lg bg-surface-2 px-4 py-4 text-sm md:mx-0">
        <span className="text-muted">Got it. You&apos;ll see less like this.</span>
        <button className="btn-link" onClick={() => setHidden(false)}>
          Undo
        </button>
      </div>
    );
  }

  return (
    <article ref={trackRef} className="feed-item animate-in border-b border-line-soft pb-4 md:mb-5 md:border-b-0 md:pb-5">
      {/* Header */}
      <header className="flex items-center gap-3 px-3 py-2.5 md:px-0">
        <span className={`rounded-full p-[2px] ${meaningful && showBucket ? "ring-meaningful" : "ring-story"}`}>
          <span className="block rounded-full bg-bg p-[2px]">
            <Avatar src={item.authorAvatar} platform={item.platform} />
          </span>
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-1 text-sm">
            <span className="truncate font-semibold">{item.authorName}</span>
            <span className="shrink-0 text-muted">• {timeAgo(item.createdAt)}</span>
          </div>
          <div className="truncate text-xs text-muted">
            {platform.name}
            {item.authorHandle ? ` · ${item.authorHandle}` : ""}
          </div>
        </div>
        {showBucket && meaningful && (
          <span className="hidden shrink-0 items-center gap-1 rounded-full bg-to/10 px-2 py-0.5 text-[11px] font-semibold text-to sm:inline-flex" title="Helps the habit you're building">
            <SparkIcon className="h-3 w-3" /> Meaningful
          </span>
        )}
        <div className="relative">
          <button className="rounded-full p-1.5 hover:bg-surface-2" onClick={() => setMenu(!menu)} aria-label="More options" aria-expanded={menu}>
            <MoreIcon className="h-5 w-5" />
          </button>
          {menu && (
            <div className="animate-in absolute top-9 right-0 z-20 w-52 overflow-hidden rounded-xl border border-line-soft bg-surface text-sm shadow-xl" onMouseLeave={() => setMenu(false)}>
              <button
                className="block w-full px-4 py-3 text-left font-semibold text-danger hover:bg-surface-2"
                onClick={() => {
                  setHidden(true);
                  onSkip();
                }}
              >
                Not interested
              </button>
              {item.url && (
                <a className="block border-t border-line-soft px-4 py-3 hover:bg-surface-2" href={item.url} target="_blank" rel="noopener noreferrer" onClick={onEngage}>
                  Open on {platform.name}
                </a>
              )}
              <button className="block w-full border-t border-line-soft px-4 py-3 text-left hover:bg-surface-2" onClick={() => setMenu(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      {media ? (
        <div className="relative select-none md:overflow-hidden md:rounded-[4px] md:border md:border-line-soft" onClick={onMediaTap} onDoubleClick={(e) => e.preventDefault()}>
          <MediaView media={media} kind={kindLabel(item)} onPlay={onEngage} />
          {burst > 0 && (
            <span key={burst} className="pointer-events-none absolute inset-0 flex items-center justify-center text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.35)]">
              <HeartIcon className="animate-heart h-24 w-24" filled />
            </span>
          )}
        </div>
      ) : textHeavy ? (
        <ArticleBlock item={item} onOpen={onEngage} />
      ) : null}

      {/* Actions */}
      <div className="flex items-center gap-1 px-1.5 pt-1.5 md:px-0">
        <button
          className={`rounded-full p-2 transition active:scale-90 ${liked ? "text-like" : "hover:opacity-60"}`}
          onClick={() => (liked ? setLiked(false) : like())}
          aria-label={liked ? "Unlike" : "Like"}
          aria-pressed={liked}
        >
          <HeartIcon className="h-6 w-6" filled={liked} />
        </button>
        {item.url && (
          <button className="rounded-full p-2 transition hover:opacity-60 active:scale-90" onClick={share} aria-label="Share">
            <ShareIcon className="h-6 w-6" />
          </button>
        )}
        <span className="flex-1" />
        {showBucket && meaningful && (
          <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-semibold text-to sm:hidden">
            <SparkIcon className="h-3 w-3" /> Meaningful
          </span>
        )}
        <button className="rounded-full p-2 transition hover:opacity-60 active:scale-90" onClick={toggleSave} aria-label={saved ? "Remove from saved" : "Save"} aria-pressed={saved}>
          <BookmarkIcon className="h-6 w-6" filled={saved} />
        </button>
      </div>

      {/* Caption */}
      {(media || !textHeavy) && (item.text || item.title) && (
        <div className="px-3 pt-0.5 text-sm leading-[1.45] md:px-0">
          {item.title && media && <p className="mb-0.5 font-semibold">{item.title}</p>}
          {item.text && (
            <p className={expanded ? "whitespace-pre-line" : "line-clamp-2"}>
              <span className="mr-1.5 font-semibold">{item.authorName}</span>
              {item.text}
            </p>
          )}
          {item.text && item.text.length > 120 && !expanded && (
            <button className="text-muted" onClick={() => setExpanded(true)}>
              more
            </button>
          )}
        </div>
      )}
      {item.topic && item.topic !== item.category && showBucket && meaningful && <p className="px-3 pt-1 text-xs text-muted md:px-0">#{item.topic.replace(/\s+/g, "")}</p>}
    </article>
  );
});

function Avatar({ src, platform }: { src?: string; platform: FeedPost["platform"] }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={mediaSrc(src)} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full bg-surface-3 object-cover" onError={() => setBroken(true)} />;
  }
  return <PlatformAvatar platform={platform} size={32} className="!rounded-full" />;
}

/** News and text-first posts: a clean, readable card. */
function ArticleBlock({ item, onOpen }: { item: FeedPost; onOpen: () => void }) {
  const news = isNews(item.platform);
  return (
    <div className="mx-3 rounded-2xl border border-line-soft bg-surface-2 p-5 md:mx-0">
      {item.title && <h3 className={`leading-snug font-semibold tracking-tight ${news ? "text-xl" : "text-[17px]"}`}>{item.title}</h3>}
      {item.text && <p className={`text-[15px] leading-relaxed whitespace-pre-line ${item.title ? "mt-2 line-clamp-4 text-muted" : "line-clamp-[9]"}`}>{item.text}</p>}
      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onOpen}
          className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:opacity-80"
        >
          {news ? "Read article" : "Open post"} <ArrowUpRight className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

function MediaView({ media, kind, onPlay }: { media: Media; kind: string; onPlay: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const aspect = media.kind === "reel" || media.aspect === "portrait" ? "aspect-[4/5]" : media.aspect === "square" ? "aspect-square" : "aspect-[1.91/1]";

  if (media.gradient) {
    return (
      <div className={`relative flex w-full items-center justify-center ${aspect}`} style={{ background: media.gradient }}>
        <span className="text-[88px] drop-shadow-xl" aria-hidden>
          {media.emoji}
        </span>
        {media.kind === "reel" && (
          <span className="absolute top-3 right-3 flex items-center gap-1 rounded-md bg-black/40 px-2 py-1 text-xs font-semibold text-white backdrop-blur">
            <PlayIcon className="h-3 w-3" /> {kind}
          </span>
        )}
        <span className="absolute bottom-3 left-3 rounded bg-black/30 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white/90 uppercase backdrop-blur">
          Sample
        </span>
      </div>
    );
  }

  if (media.embedUrl) {
    return playing ? (
      <iframe
        src={`${media.embedUrl}?autoplay=1&playsinline=1`}
        className={`w-full ${media.kind === "reel" ? "aspect-[9/16] max-h-[680px]" : "aspect-video"}`}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        title="Video"
      />
    ) : (
      <button
        className={`group relative block w-full bg-black ${media.kind === "reel" ? "aspect-[4/5]" : "aspect-video"}`}
        onClick={(e) => {
          e.stopPropagation();
          setPlaying(true);
          onPlay();
        }}
        aria-label="Play video"
      >
        {media.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaSrc(media.thumbnail)} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition group-hover:opacity-90" />
        )}
        <span className="absolute inset-0 m-auto flex h-16 w-16 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition group-hover:scale-105">
          <PlayIcon className="ml-1 h-7 w-7" />
        </span>
      </button>
    );
  }

  const src = media.url ?? media.thumbnail;
  if (!src) return null;
  return (
    <div className={`relative w-full bg-surface-3 ${aspect}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mediaSrc(src)}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`h-full w-full object-cover transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
      {media.kind !== "image" && (
        <span className="absolute top-3 right-3 flex items-center gap-1 rounded-md bg-black/40 px-2 py-1 text-xs font-semibold text-white backdrop-blur">
          <PlayIcon className="h-3 w-3" /> {kind}
        </span>
      )}
    </div>
  );
}
