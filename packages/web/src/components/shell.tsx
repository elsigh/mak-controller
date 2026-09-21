"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FALLBACK_GRILL_NAME, type StatusResponse } from "@makgrill/shared";
import { MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useStatus } from "@/hooks/use-status";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Pit" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
];

const MENU_LINKS = [...LINKS, { href: "/about", label: "About" }];

export function Shell({
  children,
  initialStatus = null,
}: {
  children: React.ReactNode;
  initialStatus?: StatusResponse | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useStatus(2500, initialStatus);
  const grillName = status?.grill_name?.trim() || FALLBACK_GRILL_NAME;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6">
      <header className="mb-6 flex h-14 items-center justify-between gap-3">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <span className="inline-flex size-11 shrink-0 overflow-hidden rounded-2xl ring-1 ring-white/20">
            <Image
              src="/mak-flame-192.png"
              alt="MakGrill"
              width={44}
              height={44}
              priority
              className="size-11"
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-lg font-semibold tracking-tight">{grillName}</span>
            <span className="block text-xs uppercase tracking-[0.22em] text-muted-foreground">
              Pellet Boss
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-border bg-[color:var(--bg-elevated)]/70 p-1 shadow-[inset_0_1px_0_rgba(232,238,244,0.08)] md:flex">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm transition",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon-lg"
              className="size-12 min-h-12 min-w-12"
              aria-label="Open menu"
            >
              <MenuIcon className="size-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="bg-popover/95">
            <SheetHeader>
              <SheetTitle className="truncate">{grillName}</SheetTitle>
              <SheetDescription>Pellet Boss controller</SheetDescription>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4">
              {MENU_LINKS.map((link) => {
                const active = pathname === link.href;
                return (
                  <SheetClose asChild key={link.href}>
                    <Link
                      href={link.href}
                      className={cn(
                        "rounded-2xl px-4 py-3 text-base",
                        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {link.label}
                    </Link>
                  </SheetClose>
                );
              })}
              <Separator className="my-2" />
              <SheetClose asChild>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="rounded-2xl px-4 py-3 text-left text-base text-muted-foreground hover:bg-muted"
                >
                  Sign out
                </button>
              </SheetClose>
            </nav>
          </SheetContent>
        </Sheet>
      </header>
      <main className="flex-1 pb-10">{children}</main>
    </div>
  );
}
