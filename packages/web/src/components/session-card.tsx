"use client";

import { useState } from "react";
import type { StatusResponse } from "@makgrill/shared";
import { api } from "@/lib/api";

export function SessionCard({
  status,
  onChange,
}: {
  status: StatusResponse | null;
  onChange: () => Promise<void> | void;
}) {
  const [name, setName] = useState("Pork shoulder");
  const session = status?.active_session;

  async function toggle() {
    if (session) await api.stopSession();
    else await api.startSession(name);
    await onChange();
  }

  return (
    <section className="panel rounded-3xl p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Cook session</p>
      <p className="mt-2 text-sm text-[var(--muted)]">
        {session ? `${session.name} · started ${session.started_at}` : "Volatile buffer only — start a session to keep a named log."}
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={session?.name ?? name}
          disabled={Boolean(session)}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-2xl border border-[var(--line)] bg-black/30 px-4 py-3 outline-none focus:border-amber-400"
        />
        <button
          type="button"
          onClick={() => void toggle()}
          className={`rounded-2xl px-5 py-3 font-semibold ${session ? "bg-red-600" : "bg-amber-400 text-black"}`}
        >
          {session ? "End cook" : "Start cook"}
        </button>
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
