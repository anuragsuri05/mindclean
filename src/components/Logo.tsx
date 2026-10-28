export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-[30%] ${className}`} style={{ background: "linear-gradient(45deg, #fa7e1e, #d62976 50%, #2a78d6)" }} aria-hidden>
      <svg viewBox="0 0 32 32" className="h-[70%] w-[70%]">
        <path d="M7 19c2.6-5.6 5.4-5.6 8 0s5.4 5.6 8 0" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function Logo({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark />
      <span className={`font-display text-[22px] font-semibold tracking-tight italic ${compact ? "hidden xl:inline" : ""}`}>mindclean</span>
    </span>
  );
}
