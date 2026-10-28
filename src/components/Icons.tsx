/** Minimal line icons (24px grid, 1.8 stroke), Instagram-style. */

type P = { className?: string; filled?: boolean };

const base = (className = "h-6 w-6") => ({
  className,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const HomeIcon = ({ className, filled }: P) => (
  <svg {...base(className)} fill={filled ? "currentColor" : "none"}>
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </svg>
);

export const FocusIcon = ({ className, filled }: P) => (
  <svg {...base(className)}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.5" fill={filled ? "currentColor" : "none"} />
  </svg>
);

export const ProgressIcon = ({ className, filled }: P) => (
  <svg {...base(className)} strokeWidth={filled ? 2.4 : 1.8}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);

export const SourcesIcon = ({ className, filled }: P) => (
  <svg {...base(className)} fill={filled ? "currentColor" : "none"}>
    <rect x="3" y="3" width="7" height="7" rx="2" />
    <rect x="14" y="3" width="7" height="7" rx="2" />
    <rect x="3" y="14" width="7" height="7" rx="2" />
    <rect x="14" y="14" width="7" height="7" rx="2" />
  </svg>
);

export const UserIcon = ({ className, filled }: P) => (
  <svg {...base(className)} fill={filled ? "currentColor" : "none"}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);

export const HeartIcon = ({ className, filled }: P) => (
  <svg {...base(className)} fill={filled ? "currentColor" : "none"}>
    <path d="M12 20.5s-7.5-4.4-9.3-9.2C1.5 8 3.6 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.6 0 5.7 3.5 4.5 6.8-1.8 4.8-9.3 9.2-9.3 9.2z" />
  </svg>
);

export const BookmarkIcon = ({ className, filled }: P) => (
  <svg {...base(className)} fill={filled ? "currentColor" : "none"}>
    <path d="M19 21 12 16 5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1z" />
  </svg>
);

export const ShareIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M22 3 9.2 10.1M22 3l-7 18-3.4-7.6L3 10z" />
  </svg>
);

export const MoreIcon = ({ className }: P) => (
  <svg {...base(className)} fill="currentColor" stroke="none">
    <circle cx="5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="19" cy="12" r="1.6" />
  </svg>
);

export const PlayIcon = ({ className }: P) => (
  <svg {...base(className)} fill="currentColor" stroke="none">
    <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.4-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5z" />
  </svg>
);

export const ArrowUpRight = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
);

export const CheckIcon = ({ className }: P) => (
  <svg {...base(className)} strokeWidth={2.4}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const ChevronLeft = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export const SparkIcon = ({ className }: P) => (
  <svg {...base(className)} fill="currentColor" stroke="none">
    <path d="M12 2.5c.5 4.6 2.4 7 7 7.5-4.6.5-6.5 2.9-7 7.5-.5-4.6-2.4-7-7-7.5 4.6-.5 6.5-2.9 7-7.5zM19 15c.2 1.9 1 2.8 2.9 3-1.9.2-2.7 1.1-2.9 3-.2-1.9-1-2.8-2.9-3 1.9-.2 2.7-1.1 2.9-3z" />
  </svg>
);

export const FlameIcon = ({ className }: P) => (
  <svg {...base(className)} fill="currentColor" stroke="none">
    <path d="M12 22c4.4 0 7.5-3 7.5-7.2 0-3.4-2-6.2-4.1-8.2-.4-.4-1.1-.1-1.1.5 0 1.6-.8 3-2 3.6.3-3.3-1.2-6.4-3.7-8.4-.4-.3-1 0-1 .5C7.5 6.4 4.5 9 4.5 14.8 4.5 19 7.6 22 12 22z" />
  </svg>
);

export const LogoutIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />
  </svg>
);
