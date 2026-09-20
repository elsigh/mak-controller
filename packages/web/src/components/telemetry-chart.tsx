"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HistoryResponse } from "@makgrill/shared";
import { CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { Panel } from "./panel";

const CHART_HEIGHT = 320;

function toRows(history: HistoryResponse) {
  return history.timestamps.map((time, i) => ({
    time,
    grill: history.grill_temp[i],
    setpoint: history.setpoint[i],
    probe1: history.probe1[i],
    probe2: history.probe2[i],
    probe3: history.probe3[i],
  }));
}

function sampleLabel(history: HistoryResponse | null, rows: number) {
  if (!history) return `${rows.toLocaleString()} samples`;
  const raw = history.sample_count ?? rows;
  if (history.downsample_seconds && raw > rows) {
    return `${rows.toLocaleString()} of ${raw.toLocaleString()} samples · ${history.downsample_seconds}s display`;
  }
  return `${rows.toLocaleString()} samples`;
}

export function TelemetryChart({
  sessionId,
  day,
  initialHistory = null,
}: {
  sessionId?: number | null;
  day?: string | null;
  initialHistory?: HistoryResponse | null;
}) {
  const [rows, setRows] = useState<ReturnType<typeof toRows>>(() =>
    initialHistory ? toRows(initialHistory) : [],
  );
  const [meta, setMeta] = useState<HistoryResponse | null>(initialHistory);
  const [ready, setReady] = useState(Boolean(initialHistory));

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const history = await api.history(day ? { day } : sessionId);
        if (alive) {
          setRows(toRows(history));
          setMeta(history);
          setReady(true);
        }
      } catch {
        if (alive) setReady(true);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 5000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [sessionId, day]);

  return (
    <Panel>
      <CardHeader className="flex-row items-center justify-between">
        <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Cook curve</p>
        <p className="h-4 text-xs text-muted-foreground">{ready ? sampleLabel(meta, rows.length) : " "}</p>
      </CardHeader>
      <CardContent>
        <div className="relative h-80 min-h-80 w-full overflow-hidden">
          {!ready && <Skeleton className="absolute inset-0 rounded-2xl" />}
          <div className={ready ? "h-full w-full" : "invisible h-full w-full"}>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart data={rows}>
                <CartesianGrid stroke="rgba(255,214,170,0.08)" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "#b3a394", fontSize: 11 }} minTickGap={28} />
                <YAxis tick={{ fill: "#b3a394", fontSize: 11 }} unit="°" domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{
                    background: "#14110f",
                    border: "1px solid rgba(255,214,170,0.12)",
                    borderRadius: 12,
                  }}
                />
                <Legend wrapperStyle={{ color: "#f6efe6" }} />
                <Line type="monotone" dataKey="grill" name="Pit" stroke="#ff6a2a" dot={false} strokeWidth={2} />
                <Line
                  type="monotone"
                  dataKey="setpoint"
                  name="Setpoint"
                  stroke="#f5a524"
                  dot={false}
                  strokeDasharray="6 6"
                />
                <Line type="monotone" dataKey="probe1" name="Probe 1" stroke="#5cc8ff" dot={false} />
                <Line type="monotone" dataKey="probe2" name="Probe 2" stroke="#6ee7a8" dot={false} />
                <Line type="monotone" dataKey="probe3" name="Probe 3" stroke="#d6a4ff" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Panel>
  );
}
