"use client";

import type { StatusResponse } from "@makgrill/shared";
import { startSessionAction, stopSessionAction } from "@/app/actions";

export function SessionCard({ status }: { status: StatusResponse | null }) {
  const session = status?.active_session;

  return (
    <section className="panel rounded-3xl p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Cook session</p>
      <p className="mt-2 text-sm text-[var(--muted)]">
        {session
          ? `${session.name} · started ${session.started_at}`
          : "Volatile buffer only — start a session to keep a named log."}
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {session ? (
          <form action={stopSessionAction} className="contents">
            <input disabled value={session.name} className="w-full rounded-2xl border border-[var(--line)] bg-black/30 px-4 py-3" />
            <button type="submit" className="rounded-2xl bg-red-600 px-5 py-3 font-semibold">
              End cook
            </button>
          </form>
        ) : (
          <form action={startSessionAction} className="contents">
            <input
              name="name"
              defaultValue="Pork shoulder"
              className="w-full rounded-2xl border border-[var(--line)] bg-black/30 px-4 py-3 outline-none focus:border-amber-400"
            />
            <button type="submit" className="rounded-2xl bg-amber-400 px-5 py-3 font-semibold text-black">
              Start cook
            </button>
          </form>
        )}
        <a
          href={session ? `/api/session/export?id=${session.id}` : undefined}
          className={`rounded-2xl border border-[var(--line)] px-5 py-3 text-center ${session ? "" : "pointer-events-none opacity-40"}`}
        >
          CSV
        </a>
      </div>
    </section>
  );
}
