"use client";

import { useEffect, useState } from "react";
import type { HistoryResponse } from "@makgrill/shared";
import { api } from "@/lib/api";
import { TelemetryChart } from "./telemetry-chart";

type Session = {
  id: number;
  name: string;
  started_at: string;
  ended_at: string | null;
  active: number;
};

export function HistoryStudio({
  initialSessions = [],
  initialHistory = null,
}: {
  initialSessions?: Session[];
  initialHistory?: HistoryResponse | null;
}) {
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [selected, setSelected] = useState<number | null>(initialSessions[0]?.id ?? null);

  useEffect(() => {
    void api.sessions().then((list) => {
      setSessions(list);
      setSelected((current) => current ?? list[0]?.id ?? null);
    });
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Named cook sessions, live volatile buffer, and CSV export.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="panel rounded-3xl p-4">
          <p className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Sessions</p>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className={`mb-2 w-full rounded-2xl px-3 py-2 text-left ${selected === null ? "bg-amber-400 text-black" : "bg-black/20"}`}
          >
            Latest buffer
          </button>
          <div className="space-y-2">
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setSelected(session.id)}
                className={`w-full rounded-2xl px-3 py-2 text-left ${selected === session.id ? "bg-amber-400 text-black" : "bg-black/20"}`}
              >
                <span className="block font-medium">{session.name}</span>
                <span className="block text-xs opacity-70">
                  {session.started_at}
                  {session.active ? " · live" : ""}
                </span>
              </button>
            ))}
          </div>
        </aside>
        <div className="space-y-3">
          <TelemetryChart sessionId={selected} initialHistory={initialHistory} />
          {selected && (
            <a
              href={`/api/session/export?id=${selected}`}
              className="inline-flex rounded-2xl bg-amber-400 px-4 py-2 font-semibold text-black"
            >
              Download CSV
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
