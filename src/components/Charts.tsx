"use client";

import { useState } from "react";
import type { Insights } from "@/lib/insights";

export const pct = (r: number) => `${Math.round(r * 100)}%`;

export function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}

export function ChartCard({ title, subtitle, children, table }: { title: string; subtitle: string; children: React.ReactNode; table: React.ReactNode }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
        <button className="shrink-0 text-xs text-muted underline hover:text-ink" onClick={() => setShowTable((v) => !v)}>
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>
      {showTable ? table : children}
    </section>
  );
}

export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            {head.map((h) => (
              <th key={h} className="py-2 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/60">
              {r.map((c, j) => (
                <td key={j} className="py-1.5 pr-4 tabular-nums">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Positioned above the hovered band; `at` is the band centre in viewBox units. */
function Tooltip({ at, children }: { at: number; children: React.ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface px-3 py-2 text-xs whitespace-nowrap shadow-lg"
      style={{ left: `${Math.min(85, Math.max(15, (at / W) * 100))}%` }}
    >
      {children}
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: color }} />;
}

const W = 640;
const H = 220;
const PAD = { l: 36, r: 12, t: 12, b: 28 };

/**
 * Planned share of meaningful content (dashed step line) vs what you actually
 * saw (bars), on one 0–100% axis. Future days show the rest of the program.
 */
export function ShiftChart({ days, projected }: { days: Insights["days"]; projected: Insights["projected"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const lastLevel = days.at(-1)?.level ?? -1;
  const future = projected.slice(lastLevel + 1).map((p) => ({ planned: p.ratio, actual: null as number | null, day: null as string | null, held: false, to: 0, from: 0 }));
  const past = days.map((d) => ({
    planned: d.ratio,
    actual: d.shownFrom + d.shownTo ? d.shownTo / (d.shownFrom + d.shownTo) : null,
    day: d.day as string | null,
    held: d.held,
    to: d.shownTo,
    from: d.shownFrom,
  }));
  const points = [...past, ...future];
  const n = Math.max(points.length, 1);
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const band = iw / n;
  const barW = Math.min(26, band * 0.6);
  const y = (v: number) => PAD.t + ih * (1 - v);
  const segment = (i: number) => `M${PAD.l + band * i + 2},${y(points[i].planned)} H${PAD.l + band * (i + 1) - 2}`;
  const pastPath = past.map((_, i) => segment(i)).join(" ");
  const futurePath = future.map((_, k) => segment(past.length + k)).join(" ");

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Planned versus actual share of meaningful posts per day">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line-soft)" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill="var(--muted)">
              {t * 100}%
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const cx = PAD.l + band * i + band / 2;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={PAD.l + band * i} y={PAD.t} width={band} height={ih} fill="transparent" />
              {p.actual !== null && p.actual > 0 && (
                <path
                  d={`M${cx - barW / 2},${y(0)} V${y(p.actual) + 4} q0,-4 4,-4 H${cx + barW / 2 - 4} q4,0 4,4 V${y(0)} Z`}
                  fill="var(--series-to)"
                  opacity={hover === null || hover === i ? 0.9 : 0.4}
                />
              )}
              {p.held && (
                <text x={cx} y={y(0) - 4} textAnchor="middle" fontSize={10} fill="var(--muted)">
                  ⏸
                </text>
              )}
              {(n <= 14 || i % Math.ceil(n / 14) === 0) && (
                <text x={cx} y={H - 10} textAnchor="middle" fontSize={10} fill="var(--muted)" fontWeight={i === past.length - 1 ? 700 : 400}>
                  {i + 1}
                </text>
              )}
            </g>
          );
        })}
        <path d={pastPath} stroke="var(--ink)" strokeWidth={2} fill="none" strokeDasharray="4 3" />
        <path d={futurePath} stroke="var(--muted)" strokeWidth={2} fill="none" strokeDasharray="2 4" opacity={0.6} />
      </svg>
      {hover !== null && points[hover] && (
        <Tooltip at={PAD.l + band * hover + band / 2}>
          <div className="font-medium">
            Day {hover + 1}
            {points[hover].day ? ` · ${points[hover].day}` : " · upcoming"}
          </div>
          <div>Planned: {pct(points[hover].planned)}</div>
          {points[hover].day && (
            <>
              <div>
                <Swatch color="var(--series-to)" />
                Actual: {points[hover].actual === null ? "no posts seen" : pct(points[hover].actual!)}
              </div>
              <div className="text-muted">
                {points[hover].to} meaningful · {points[hover].from} entertainment{points[hover].held ? " · held" : ""}
              </div>
            </>
          )}
        </Tooltip>
      )}
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        <span>
          <Swatch color="var(--series-to)" />
          Actual meaningful share
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="4" aria-hidden>
            <line x1="0" x2="18" y1="2" y2="2" stroke="var(--ink)" strokeWidth="2" strokeDasharray="4 3" />
          </svg>
          Planned
        </span>
        <span>⏸ held for pacing</span>
      </div>
    </div>
  );
}

/** Stacked bars of posts seen per day: new habit, old habit, other. */
export function UsageChart({ usage }: { usage: Insights["usage"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const series = [
    { key: "viewsTo" as const, label: "Meaningful", color: "var(--series-to)" },
    { key: "viewsFrom" as const, label: "Entertainment", color: "var(--series-from)" },
    { key: "viewsNeutral" as const, label: "Other", color: "var(--series-neutral)" },
  ];
  const max = Math.max(5, ...usage.map((u) => u.viewsTo + u.viewsFrom + u.viewsNeutral));
  const nice = Math.ceil(max / 5) * 5;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const band = iw / usage.length;
  const barW = Math.min(26, band * 0.62);
  const y = (v: number) => PAD.t + ih * (1 - v / nice);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Posts seen per day over the last 14 days">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(nice * t)} y2={y(nice * t)} stroke="var(--line-soft)" />
            <text x={PAD.l - 6} y={y(nice * t) + 4} textAnchor="end" fontSize={10} fill="var(--muted)">
              {nice * t}
            </text>
          </g>
        ))}
        {usage.map((u, i) => {
          let acc = 0;
          const cx = PAD.l + band * i + band / 2;
          const segs = series
            .map((s) => ({ ...s, v: u[s.key] }))
            .filter((s) => s.v > 0)
            .map((s, idx, arr) => {
              const y0 = y(acc);
              acc += s.v;
              const y1 = y(acc);
              const top = idx === arr.length - 1;
              // 2px surface gap between stacked segments; rounded data-end on the top segment only.
              const h = Math.max(0, y0 - y1 - (idx > 0 ? 2 : 0));
              const yTop = y1;
              const d = top && h > 4
                ? `M${cx - barW / 2},${yTop + h} V${yTop + 4} q0,-4 4,-4 H${cx + barW / 2 - 4} q4,0 4,4 V${yTop + h} Z`
                : `M${cx - barW / 2},${yTop + h} V${yTop} H${cx + barW / 2} V${yTop + h} Z`;
              return <path key={s.key} d={d} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.45} />;
            });
          return (
            <g key={u.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={PAD.l + band * i} y={PAD.t} width={band} height={ih} fill="transparent" />
              {segs}
              {(i % 2 === 0 || i === usage.length - 1) && (
                <text x={cx} y={H - 10} textAnchor="middle" fontSize={10} fill="var(--muted)">
                  {u.day.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <Tooltip at={PAD.l + band * hover + band / 2}>
          <div className="font-medium">{usage[hover].day}</div>
          {series.map((s) => (
            <div key={s.key}>
              <Swatch color={s.color} />
              {s.label}: {usage[hover][s.key]}
            </div>
          ))}
          <div className="text-muted">
            {usage[hover].minutesTo} min meaningful · {usage[hover].minutesFrom} min entertainment
          </div>
        </Tooltip>
      )}
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        {series.map((s) => (
          <span key={s.key}>
            <Swatch color={s.color} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CategoryBars({ categories }: { categories: Insights["categories"] }) {
  const max = Math.max(...categories.map((c) => c.n));
  const total = categories.reduce((s, c) => s + c.n, 0);
  return (
    <ul className="space-y-2">
      {categories.map((c) => (
        <li key={c.category} className="flex items-center gap-3 text-sm" title={`${c.n} posts`}>
          <span className="w-28 shrink-0 capitalize">{c.category}</span>
          <span className="h-3 flex-1">
            <span className="block h-3 rounded-r-[4px] bg-ink/55" style={{ width: `${(c.n / max) * 100}%` }} />
          </span>
          <span className="w-12 text-right text-xs text-muted tabular-nums">{Math.round((c.n / total) * 100)}%</span>
        </li>
      ))}
    </ul>
  );
}
