import type { Platform } from "@/lib/types";
import { PLATFORM_BY_ID } from "@/lib/platforms";

const SPECIAL: Partial<Record<Platform, { bg: string; fg?: string; glyph?: string }>> = {
  instagram: { bg: "radial-gradient(circle at 30% 107%, #fdf497 0%, #fd5949 45%, #d6249f 60%, #285AEB 90%)" },
  snapchat: { bg: "#fffc00", fg: "#111" },
  googlenews: { bg: "conic-gradient(#4285f4 0 25%, #ea4335 0 50%, #fbbc05 0 75%, #34a853 0)" },
  x: { bg: "#000", glyph: "𝕏" },
  tiktok: { bg: "#000", glyph: "♪" },
  threads: { bg: "#000", glyph: "@" },
  rss: { bg: "#f97316", glyph: "◉" },
  news: { bg: "#111", glyph: "N" },
  inshorts: { bg: "#c9161d", glyph: "in" },
  linkedin: { bg: "#0a66c2", glyph: "in" },
};

/** Brand-coloured rounded tile for a platform (no third-party logos bundled). */
export function PlatformAvatar({ platform, size = 44, className = "" }: { platform: Platform; size?: number; className?: string }) {
  const info = PLATFORM_BY_ID[platform];
  const s = SPECIAL[platform];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[28%] font-bold ${className}`}
      style={{
        width: size,
        height: size,
        background: s?.bg ?? info.color,
        color: s?.fg ?? "#fff",
        fontSize: size * 0.42,
      }}
      aria-hidden
    >
      {s?.glyph ?? info.name.charAt(0)}
    </span>
  );
}
