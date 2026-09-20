"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-amber-300">MakGrill</p>
      <h1 className="text-3xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-[var(--muted)]">{error.message}</p>
      <button type="button" onClick={reset} className="rounded-2xl bg-amber-400 px-4 py-2 font-semibold text-black">
        Try again
      </button>
    </div>
  );
}
