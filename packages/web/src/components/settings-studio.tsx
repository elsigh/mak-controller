"use client";

import { useEffect, useState } from "react";
import type { StatusResponse } from "@makgrill/shared";
import { saveSettingsAction } from "@/app/actions";
import { useStatus } from "@/hooks/use-status";
import { api } from "@/lib/api";

export function SettingsStudio({ initialStatus = null }: { initialStatus?: StatusResponse | null }) {
  const { status } = useStatus(2500, initialStatus);
  const [topic, setTopic] = useState("");
  const [note, setNote] = useState("");
  const [events, setEvents] = useState<
    Array<{ timestamp: string; field_name: string; old_val: string; new_val: string; bit_diff: string }>
  >([]);

  useEffect(() => {
    void api.settings().then((s) => setTopic(s.ntfy_topic ?? ""));
    void api.flagEvents().then(setEvents);
    const id = window.setInterval(() => void api.flagEvents().then(setEvents), 5000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Optional ntfy alerts, GrillFlags diagnostics, and SQLite maintenance.
        </p>
      </div>
      <section className="panel rounded-3xl p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-sky-300">Push notifications</p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Topic name (for ntfy.sh) or a full self-hosted URL. Leave empty to disable.
        </p>
        <form action={saveSettingsAction} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            name="ntfy_topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="my-mak-grill"
            className="w-full rounded-2xl border border-[var(--line)] bg-black/30 px-4 py-3"
          />
          <button type="submit" className="rounded-2xl bg-sky-500 px-4 py-3 font-semibold">
            Save
          </button>
          <button
            type="button"
            onClick={() => void api.testNtfy().then(() => setNote("Test sent")).catch((e) => setNote(String(e.message)))}
            className="rounded-2xl border border-[var(--line)] px-4 py-3"
          >
            Test
          </button>
        </form>
        {note && <p className="mt-3 text-sm text-emerald-300">{note}</p>}
      </section>
      <section className="panel rounded-3xl p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">GrillFlags</p>
        <p className="mt-3 font-mono text-lg text-sky-300">{status?.state.flags || "None yet"}</p>
        <div className="mt-4 max-h-48 space-y-2 overflow-auto font-mono text-xs">
          {events.length === 0 && <p className="text-[var(--muted)]">No flag transitions observed yet.</p>}
          {events.map((event, i) => (
            <p key={`${event.timestamp}-${i}`} className="border-b border-white/5 pb-2 text-[var(--muted)]">
              <span className="text-amber-300">[{event.timestamp}]</span> {event.old_val} → {event.new_val}
              <br />
              {event.bit_diff}
            </p>
          ))}
        </div>
      </section>
      <section className="panel rounded-3xl p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Database maintenance</p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Drops volatile telemetry older than 24 hours and closed cooks older than the selected window.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => void api.prune(30).then(() => setNote("Pruned records older than 30 days"))}
            className="rounded-2xl border border-[var(--line)] px-4 py-2"
          >
            Prune &gt; 30 days
          </button>
          <button
            type="button"
            onClick={() => void api.prune(7).then(() => setNote("Pruned records older than 7 days"))}
            className="rounded-2xl border border-[var(--line)] px-4 py-2"
          >
            Prune &gt; 7 days
          </button>
        </div>
      </section>
    </div>
  );
}
