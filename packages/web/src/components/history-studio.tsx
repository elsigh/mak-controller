"use client";

import { useEffect, useState } from "react";
import { formatHistoryDayLabel, type HistoryDay, type HistoryResponse } from "@makgrill/shared";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { touchBtnClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { PageHeader } from "./page-header";
import { Panel } from "./panel";
import { TelemetryChart } from "./telemetry-chart";

export function HistoryStudio({
  initialDays = [],
  initialDay = null,
  initialHistory = null,
}: {
  initialDays?: HistoryDay[];
  initialDay?: string | null;
  initialHistory?: HistoryResponse | null;
}) {
  const [days, setDays] = useState<HistoryDay[]>(initialDays);
  const [selected, setSelected] = useState<string | null>(initialDay ?? initialDays[0]?.day ?? null);

  useEffect(() => {
    void api.days().then((list) => {
      setDays(list);
      setSelected((current) => current ?? list[0]?.day ?? null);
    });
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="History"
        description="Telemetry grouped by Studio local day. Charts downsample to 20 seconds; CSV is the full series."
      />
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Panel className="min-h-[20rem]">
          <CardHeader>
            <CardTitle className="text-xs font-normal uppercase tracking-[0.2em] text-muted-foreground">
              Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            {days.length === 0 ? (
              <p className="text-sm text-muted-foreground">No telemetry stored yet.</p>
            ) : (
              <div className="space-y-2">
                {days.map((entry) => (
                  <Button
                    key={entry.day}
                    type="button"
                    variant={selected === entry.day ? "default" : "secondary"}
                    onClick={() => setSelected(entry.day)}
                    className={cn(
                      "h-auto min-h-14 w-full flex-col items-start justify-center rounded-2xl px-3 py-2 text-left whitespace-normal",
                    )}
                  >
                    <span className="block font-medium">{formatHistoryDayLabel(entry.day)}</span>
                    <span className="block text-xs opacity-70">
                      {entry.day} · {entry.samples.toLocaleString()} samples
                    </span>
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Panel>
        <div className="space-y-3">
          <TelemetryChart day={selected} initialHistory={initialHistory} />
          {selected ? (
            <Button asChild className={touchBtnClass}>
              <a href={`/api/history/export?day=${selected}`}>Download CSV</a>
            </Button>
          ) : (
            <div className="h-11" />
          )}
        </div>
      </div>
    </div>
  );
}
