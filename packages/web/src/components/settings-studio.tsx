"use client";

import { useEffect, useState } from "react";
import type { StatusResponse } from "@makgrill/shared";
import { saveSettingsAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStatus } from "@/hooks/use-status";
import { api } from "@/lib/api";
import { fieldClass, touchBtnClass } from "@/lib/ui";
import { PageHeader } from "./page-header";
import { Panel } from "./panel";

export function SettingsStudio({ initialStatus = null }: { initialStatus?: StatusResponse | null }) {
  const { status } = useStatus(2500, initialStatus);
  const [topic, setTopic] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [note, setNote] = useState("");
  const [events, setEvents] = useState<
    Array<{ timestamp: string; field_name: string; old_val: string; new_val: string; bit_diff: string }>
  >([]);

  useEffect(() => {
    void api.settings().then((s) => {
      setTopic(s.ntfy_topic ?? "");
      setEnabled(Boolean(s.ntfy_topic));
    });
    void api.flagEvents().then(setEvents);
    const id = window.setInterval(() => void api.flagEvents().then(setEvents), 5000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        description="Optional ntfy alerts, GrillFlags diagnostics, and SQLite maintenance."
      />
      <Tabs defaultValue="alerts" className="gap-4">
        <TabsList className="h-11">
          <TabsTrigger value="alerts" className="min-h-9 px-3">
            Alerts
          </TabsTrigger>
          <TabsTrigger value="flags" className="min-h-9 px-3">
            GrillFlags
          </TabsTrigger>
          <TabsTrigger value="maintenance" className="min-h-9 px-3">
            Maintenance
          </TabsTrigger>
        </TabsList>
        <TabsContent value="alerts">
          <Panel className="min-h-[16rem]">
            <CardHeader>
              <CardTitle className="text-xs font-normal uppercase tracking-[0.2em] text-steel">
                Push notifications
              </CardTitle>
              <CardDescription>
                Topic name (for ntfy.sh) or a full self-hosted URL. Leave empty to disable.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={saveSettingsAction} className="space-y-4">
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-[color:var(--bg-elevated)]/70 px-4 py-3">
                  <Label htmlFor="ntfy-enabled" className="text-sm font-normal">
                    Enable ntfy alerts
                  </Label>
                  <Switch
                    id="ntfy-enabled"
                    checked={enabled}
                    onCheckedChange={(next: boolean) => {
                      setEnabled(next);
                      if (!next) setTopic("");
                    }}
                  />
                </div>
                <input type="hidden" name="ntfy_topic" value={enabled ? topic : ""} />
                <Input
                  value={topic}
                  disabled={!enabled}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="my-mak-grill"
                  className={fieldClass}
                />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="submit" className={touchBtnClass}>
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={touchBtnClass}
                    onClick={() =>
                      void api
                        .testNtfy()
                        .then(() => setNote("Test sent"))
                        .catch((e) => setNote(String(e.message)))
                    }
                  >
                    Test
                  </Button>
                </div>
                {note ? <p className="min-h-5 text-sm text-emerald-300">{note}</p> : <p className="min-h-5" />}
              </form>
            </CardContent>
          </Panel>
        </TabsContent>
        <TabsContent value="flags">
          <Panel className="min-h-[16rem]">
            <CardHeader>
              <CardTitle className="text-xs font-normal uppercase tracking-[0.2em] text-muted-foreground">
                GrillFlags
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="min-h-7 font-mono text-lg text-steel">{status?.state.flags || "None yet"}</p>
              <div className="mt-4 h-48 space-y-2 overflow-auto font-mono text-xs">
                {events.length === 0 && <p className="text-muted-foreground">No flag transitions observed yet.</p>}
                {events.map((event, i) => (
                  <p key={`${event.timestamp}-${i}`} className="border-b border-white/5 pb-2 text-muted-foreground">
                    <span className="text-primary">[{event.timestamp}]</span> {event.old_val} → {event.new_val}
                    <br />
                    {event.bit_diff}
                  </p>
                ))}
              </div>
            </CardContent>
          </Panel>
        </TabsContent>
        <TabsContent value="maintenance">
          <Panel className="min-h-[16rem]">
            <CardHeader>
              <CardTitle className="text-xs font-normal uppercase tracking-[0.2em] text-muted-foreground">
                Database maintenance
              </CardTitle>
              <CardDescription>
                Drops closed named cooks older than the selected window. Unnamed day telemetry is
                kept at least 14 days so yesterday stays in History.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className={touchBtnClass}
                  onClick={() => void api.prune(30).then(() => setNote("Pruned records older than 30 days"))}
                >
                  Prune &gt; 30 days
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={touchBtnClass}
                  onClick={() => void api.prune(7).then(() => setNote("Pruned records older than 7 days"))}
                >
                  Prune &gt; 7 days
                </Button>
              </div>
              {note ? <p className="mt-3 min-h-5 text-sm text-emerald-300">{note}</p> : <p className="mt-3 min-h-5" />}
            </CardContent>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
