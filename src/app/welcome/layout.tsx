import Link from "next/link";
import { Logo } from "@/components/Logo";
import { requireUser } from "@/lib/auth";

export default async function WelcomeLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div className="welcome min-h-dvh">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-center border-b border-line-soft bg-bg/90 backdrop-blur">
        <Link href="/" aria-label="Mindclean">
          <Logo />
        </Link>
      </header>
      {children}
    </div>
  );
}
