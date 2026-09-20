"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/", label: "Pit" },
  { href: "/recipes", label: "Recipes" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 text-sm font-black text-black shadow-[0_0_24px_rgba(255,122,24,0.35)]">
            MG
          </span>
          <span>
            <span className="block text-lg font-semibold tracking-tight">MakGrill</span>
            <span className="block text-xs uppercase tracking-[0.22em] text-[var(--muted)]">
              Pellet Boss
            </span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 rounded-full border border-[var(--line)] bg-black/20 p-1">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm transition",
                  active
                    ? "bg-amber-400 text-black"
                    : "text-[var(--muted)] hover:text-white",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={() => void logout()}
          className="text-xs uppercase tracking-[0.18em] text-[var(--muted)] hover:text-white"
        >
          Sign out
        </button>
      </header>
      <main className="flex-1 pb-10">{children}</main>
      <footer className="border-t border-[var(--line)] pt-4 text-center text-xs text-[var(--muted)]">
        Unofficial community controller. Derived from{" "}
        <a className="underline decoration-amber-700/60" href="https://github.com/bawilson2/mak-controller">
          bawilson2/mak-controller
        </a>
        . Not affiliated with MAK Grills.
      </footer>
    </div>
  );
}
