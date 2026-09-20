"use client";

import { useEffect, useState } from "react";
import type { HistoryResponse } from "@makgrill/shared";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { touchBtnClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { PageHeader } from "./page-header";
import { Panel } from "./panel";
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
      <PageHeader
        title="History"
        description="Named cook sessions, live volatile buffer, and CSV export."
      />
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Panel className="min-h-[20rem]">
          <CardHeader>
            <CardTitle className="text-xs font-normal uppercase tracking-[0.2em] text-muted-foreground">
              Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant={selected === null ? "default" : "secondary"}
              onClick={() => setSelected(null)}
              className="mb-2 h-auto min-h-11 w-full justify-start rounded-2xl px-3 py-2 text-left"
            >
              Latest buffer
            </Button>
            <div className="space-y-2">
              {sessions.map((session) => (
                <Button
                  key={session.id}
                  type="button"
                  variant={selected === session.id ? "default" : "secondary"}
                  onClick={() => setSelected(session.id)}
                  className={cn(
                    "h-auto min-h-14 w-full flex-col items-start justify-center rounded-2xl px-3 py-2 text-left whitespace-normal",
                  )}
                >
                  <span className="block font-medium">{session.name}</span>
                  <span className="block text-xs opacity-70">
                    {session.started_at}
                    {session.active ? " · live" : ""}
                  </span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Panel>
        <div className="space-y-3">
          <TelemetryChart sessionId={selected} initialHistory={initialHistory} />
          {selected ? (
            <Button asChild className={touchBtnClass}>
              <a href={`/api/session/export?id=${selected}`}>Download CSV</a>
            </Button>
          ) : (
            <div className="h-11" />
          )}
        </div>
      </div>
    </div>
  );
}
