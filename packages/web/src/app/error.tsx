"use client";

import { Button } from "@/components/ui/button";
import { touchBtnClass } from "@/lib/ui";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-primary">MakGrill</p>
      <h1 className="text-3xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">{error.message}</p>
      <Button type="button" onClick={reset} className={touchBtnClass}>
        Try again
      </Button>
    </div>
  );
}
