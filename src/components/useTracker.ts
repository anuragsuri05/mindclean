"use client";

import { useCallback, useEffect, useRef } from "react";
import { localDay } from "@/lib/client";

type EventType = "view" | "engage" | "skip" | "dwell";
interface QueuedEvent {
  itemId: string;
  type: EventType;
  dwellMs: number;
}

const VIEW_AFTER_MS = 800;
const ENGAGE_AFTER_MS = 3000;
const FLUSH_EVERY_MS = 4000;

interface Seen {
  since: number | null;
  total: number;
  viewed: boolean;
  engaged: boolean;
}

/**
 * Tracks what is actually on screen: a "view" after 0.8s at 60% visibility, an
 * "engage" after 3s of cumulative dwell (or an explicit action), plus dwell time.
 * These signals drive the plan's daily counters and adaptive pacing.
 */
export function useTracker(onEngaged?: (itemId: string) => void) {
  const queue = useRef<QueuedEvent[]>([]);
  const seen = useRef(new Map<string, Seen>());
  const observer = useRef<IntersectionObserver | null>(null);
  const elements = useRef(new Map<Element, string>());
  const pendingDwell = useRef(new Map<string, number>());
  const refs = useRef(new Map<string, (el: HTMLElement | null) => () => void>());

  const engagedCb = useRef(onEngaged);
  engagedCb.current = onEngaged;

  const push = useCallback((itemId: string, type: EventType, dwellMs = 0) => {
    queue.current.push({ itemId, type, dwellMs: Math.round(dwellMs) });
    if (type === "engage") engagedCb.current?.(itemId);
  }, []);

  const flush = useCallback((beacon = false) => {
    pendingDwell.current.forEach((ms, itemId) => queue.current.push({ itemId, type: "dwell", dwellMs: Math.round(ms) }));
    pendingDwell.current.clear();
    if (queue.current.length === 0) return;
    const body = JSON.stringify({ day: localDay(), events: queue.current.splice(0, 200) });
    if (beacon && navigator.sendBeacon) navigator.sendBeacon("/api/events", body);
    else fetch("/api/events", { method: "POST", body, keepalive: true }).catch(() => {});
  }, []);

  const state = (id: string) => {
    let s = seen.current.get(id);
    if (!s) seen.current.set(id, (s = { since: null, total: 0, viewed: false, engaged: false }));
    return s;
  };

  const settle = useCallback(
    (id: string, now: number) => {
      const s = state(id);
      if (s.since === null) return;
      const visibleFor = now - s.since;
      s.total += visibleFor;
      s.since = now;
      if (!s.viewed && s.total >= VIEW_AFTER_MS) {
        s.viewed = true;
        push(id, "view");
      }
      if (s.viewed && visibleFor > 0) pendingDwell.current.set(id, (pendingDwell.current.get(id) ?? 0) + visibleFor);
      if (!s.engaged && s.total >= ENGAGE_AFTER_MS) {
        s.engaged = true;
        push(id, "engage");
      }
    },
    [push],
  );

  useEffect(() => {
    observer.current = new IntersectionObserver(
      (entries) => {
        const now = performance.now();
        for (const entry of entries) {
          const id = elements.current.get(entry.target);
          if (!id) continue;
          const s = state(id);
          if (entry.isIntersecting && s.since === null) s.since = now;
          else if (!entry.isIntersecting && s.since !== null) {
            settle(id, now);
            s.since = null;
          }
        }
      },
      { threshold: 0.6 },
    );
    elements.current.forEach((_, el) => observer.current!.observe(el));

    // Settle visible items periodically so long reads count before the user scrolls away.
    const tick = setInterval(() => {
      const now = performance.now();
      seen.current.forEach((s, id) => s.since !== null && settle(id, now));
    }, 1000);
    const flusher = setInterval(() => flush(), FLUSH_EVERY_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        const now = performance.now();
        seen.current.forEach((s, id) => {
          if (s.since !== null) {
            settle(id, now);
            s.since = null;
          }
        });
        flush(true);
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(tick);
      clearInterval(flusher);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      observer.current?.disconnect();
      flush(true);
    };
  }, [flush, settle]);

  /** Stable ref callback for a card element (React 19 ref cleanup). */
  const track = useCallback((id: string) => {
    let ref = refs.current.get(id);
    if (!ref) {
      ref = (el: HTMLElement | null) => {
        if (el) {
          elements.current.set(el, id);
          observer.current?.observe(el);
        }
        return () => {
          if (!el) return;
          observer.current?.unobserve(el);
          elements.current.delete(el);
        };
      };
      refs.current.set(id, ref);
    }
    return ref;
  }, []);

  /** Explicit engagement: opened, marked useful, played a video. */
  const engage = useCallback(
    (id: string) => {
      const s = state(id);
      if (!s.viewed) {
        s.viewed = true;
        push(id, "view");
      }
      if (!s.engaged) {
        s.engaged = true;
        push(id, "engage");
      }
    },
    [push],
  );

  const skip = useCallback(
    (id: string) => {
      const s = state(id);
      if (!s.viewed) {
        s.viewed = true;
        push(id, "view");
      }
      push(id, "skip");
      flush();
    },
    [push, flush],
  );

  return { track, engage, skip };
}
