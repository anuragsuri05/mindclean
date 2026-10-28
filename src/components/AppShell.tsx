"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo, LogoMark } from "./Logo";
import { FocusIcon, HomeIcon, LogoutIcon, ProgressIcon, SourcesIcon, UserIcon } from "./Icons";

const NAV = [
  { href: "/app", label: "Home", Icon: HomeIcon },
  { href: "/app/focus", label: "Focus", Icon: FocusIcon },
  { href: "/app/progress", label: "Progress", Icon: ProgressIcon },
  { href: "/app/sources", label: "Sources", Icon: SourcesIcon },
  { href: "/app/profile", label: "Profile", Icon: UserIcon },
];

/**
 * Instagram-style navigation: a left rail on desktop (icons-only on medium
 * screens), and a top bar plus bottom tab bar on mobile.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const isActive = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="min-h-dvh">
      {/* Desktop / tablet rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[72px] flex-col border-r border-line-soft bg-bg px-3 py-6 md:flex xl:w-[244px]">
        <Link href="/app" className="mb-8 flex h-10 items-center px-2" aria-label="Mindclean home">
          <span className="xl:hidden">
            <LogoMark />
          </span>
          <span className="hidden xl:inline">
            <Logo />
          </span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ href, label, Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`group flex items-center gap-4 rounded-lg p-3 transition hover:bg-surface-2 ${active ? "font-bold" : ""}`}
              >
                <Icon className="h-6 w-6 shrink-0 transition group-hover:scale-105" filled={active} />
                <span className="hidden text-[15px] xl:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
        <button onClick={logout} className="group flex items-center gap-4 rounded-lg p-3 text-left transition hover:bg-surface-2">
          <LogoutIcon className="h-6 w-6 shrink-0" />
          <span className="hidden text-[15px] xl:inline">Log out</span>
        </button>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line-soft bg-bg/90 px-4 backdrop-blur md:hidden">
        <Link href="/app" aria-label="Mindclean home">
          <Logo />
        </Link>
        <Link href="/app/progress" className="text-sm font-semibold text-accent">
          Today
        </Link>
      </header>

      <main className="pb-20 md:pb-0 md:pl-[72px] xl:pl-[244px]">{children}</main>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-center justify-around border-t border-line-soft bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <Link key={href} href={href} aria-label={label} aria-current={active ? "page" : undefined} className="flex h-full flex-1 items-center justify-center">
              <Icon className="h-[26px] w-[26px]" filled={active} />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
