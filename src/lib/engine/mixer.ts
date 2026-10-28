/**
 * Composes the "mindful mix": a feed that interleaves items from the user's
 * "from" sources and "to" sources at the plan's current ratio.
 *
 * Counts are cumulative across pages, so a 25% ratio on 10-item pages yields
 * 3, 2, 3, 2... "to" items and averages exactly 25%. Within a page, "to" items
 * are spread evenly instead of clumped at the top or bottom.
 *
 * When the "to" supply runs out, the page stops early. We never backfill the
 * missing slots with "from" content, since that would quietly undo the plan.
 * Reaching the end is a natural, honest stopping point.
 */

import type { Bucket } from "../types";

export interface MixCursor {
  page: number;
  from: number;
  to: number;
}

export interface MixedEntry<T> {
  bucket: Exclude<Bucket, "neutral">;
  item: T;
}

export interface MixResult<T> {
  entries: MixedEntry<T>[];
  cursor: MixCursor;
  /** True when the feed ended because new-habit content ran out. */
  caughtUp: boolean;
}

export const START_CURSOR: MixCursor = { page: 0, from: 0, to: 0 };

/** How many "to" items belong on page `page` so the running total tracks `ratio`. */
export function toCountForPage(ratio: number, pageSize: number, page: number): number {
  const total = (p: number) => Math.round(ratio * pageSize * p);
  return total(page + 1) - total(page);
}

/** Even spread of `toCount` slots across `pageSize` positions. */
export function slotPattern(pageSize: number, toCount: number): boolean[] {
  return Array.from(
    { length: pageSize },
    (_, i) => Math.floor(((i + 1) * toCount) / pageSize) > Math.floor((i * toCount) / pageSize),
  );
}

/**
 * Build one page. `fromPool` / `toPool` are the full ordered candidate lists;
 * the cursor says how many of each have already been served.
 */
export function composePage<T>(
  fromPool: readonly T[],
  toPool: readonly T[],
  ratio: number,
  pageSize: number,
  cursor: MixCursor = START_CURSOR,
): MixResult<T> {
  const pattern = slotPattern(pageSize, toCountForPage(ratio, pageSize, cursor.page));
  const entries: MixedEntry<T>[] = [];
  let { from, to } = cursor;
  let caughtUp = false;

  for (const wantsTo of pattern) {
    if (wantsTo) {
      if (to >= toPool.length) {
        caughtUp = true;
        break;
      }
      entries.push({ bucket: "to", item: toPool[to++] });
    } else if (from < fromPool.length) {
      entries.push({ bucket: "from", item: fromPool[from++] });
    } else if (to < toPool.length) {
      // Old-habit content ran out: filling with new-habit content is fine.
      entries.push({ bucket: "to", item: toPool[to++] });
    } else {
      caughtUp = true;
      break;
    }
  }

  return { entries, cursor: { page: cursor.page + 1, from, to }, caughtUp };
}

/** Alignment is grouped into five bands so near-equal scores fall back to recency. */
const alignmentBand = (alignment: number | null | undefined) => Math.min(4, Math.floor((alignment ?? 0.5) * 5));

/**
 * Order "to" candidates: goal alignment band first, then recency.
 * Unscored items get a neutral 0.5 so they are neither buried nor promoted.
 */
export function rankByAlignment<T extends { alignment?: number | null; createdAt: string }>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) => alignmentBand(b.alignment) - alignmentBand(a.alignment) || Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}
