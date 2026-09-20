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
import { api } from "@/lib/api";

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

export function TelemetryChart({ sessionId }: { sessionId?: number | null }) {
  const [rows, setRows] = useState<ReturnType<typeof toRows>>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const history = await api.history(sessionId);
        if (alive) setRows(toRows(history));
      } catch {
        /* keep last series */
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 5000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [sessionId]);

  return (
    <section className="panel rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Cook curve</p>
        <p className="text-xs text-[var(--muted)]">{rows.length} samples</p>
      </div>
      <div className="h-80 w-full">
        <ResponsiveContainer>
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
            <Line type="monotone" dataKey="setpoint" name="Setpoint" stroke="#f5a524" dot={false} strokeDasharray="6 6" />
            <Line type="monotone" dataKey="probe1" name="Probe 1" stroke="#5cc8ff" dot={false} />
            <Line type="monotone" dataKey="probe2" name="Probe 2" stroke="#6ee7a8" dot={false} />
            <Line type="monotone" dataKey="probe3" name="Probe 3" stroke="#d6a4ff" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
