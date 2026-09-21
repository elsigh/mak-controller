"use client";

import { useEffect, useState } from "react";
import { FALLBACK_GRILL_NAME, isKnownGrillId, type SettingsResponse, type StatusResponse } from "@makgrill/shared";
import { saveGrillNameAction, saveSettingsAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStatus } from "@/hooks/use-status";
import { api } from "@/lib/api";
import { fieldClass, touchBtnClass } from "@/lib/ui";
import { CooldownControls } from "./cooldown-controls";
import { PageHeader } from "./page-header";
import { Panel } from "./panel";

export function SettingsStudio({
  initialStatus = null,
  initialSettings = null,
}: {
  initialStatus?: StatusResponse | null;
  initialSettings?: SettingsResponse | null;
}) {
  const { status } = useStatus(2500, initialStatus);
  const [topic, setTopic] = useState(initialSettings?.ntfy_topic ?? "");
  const [enabled, setEnabled] = useState(Boolean(initialSettings?.ntfy_topic));
  const [grillNameSeed, setGrillNameSeed] = useState(initialSettings?.grill_name ?? "");
  const [note, setNote] = useState("");
  const [grillNote, setGrillNote] = useState("");
  const grillId = status?.state.grill_id ?? "";
  const knownGrillId = isKnownGrillId(grillId);
  const [events, setEvents] = useState<
    Array<{ timestamp: string; field_name: string; old_val: string; new_val: string; bit_diff: string }>
  >([]);

  useEffect(() => {
    void api.settings().then((s) => {
      setTopic(s.ntfy_topic ?? "");
      setEnabled(Boolean(s.ntfy_topic));
      setGrillNameSeed(s.grill_name ?? "");
    });
    void api.flagEvents().then(setEvents);
    const id = window.setInterval(() => void api.flagEvents().then(setEvents), 5000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        description="Grill name, cooldown, optional ntfy alerts, GrillFlags diagnostics, and SQLite maintenance."
      />
      <Panel>
        <CardHeader>
          <CardTitle className="text-xs font-normal uppercase tracking-[0.2em] text-steel">
            Grill name
          </CardTitle>
          <CardDescription>
            Shown in the header. Saved per grill ID so it sticks after reconnects and restarts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={async (formData) => {
              try {
                await saveGrillNameAction(formData);
                setGrillNameSeed(String(formData.get("grill_name") ?? "").trim());
                setGrillNote("Saved");
              } catch (err) {
                setGrillNote(err instanceof Error ? err.message : "Save failed");
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="grill-name" className="text-sm font-normal">
                Grill name
              </Label>
              <Input
                id="grill-name"
                name="grill_name"
                key={grillNameSeed}
                defaultValue={grillNameSeed}
                placeholder={FALLBACK_GRILL_NAME}
                autoComplete="off"
                maxLength={48}
                className={fieldClass}
              />
              <p className="text-xs text-muted-foreground">
                Grill ID{" "}
                <span className="font-mono tabular-nums text-steel">
                  {knownGrillId ? grillId : "Unknown"}
                </span>
                {knownGrillId
                  ? " — override is keyed to this grill."
                  : " — name is provisional until the grill first connects."}
              </p>
            </div>
            <Button type="submit" className={touchBtnClass}>
              Save
            </Button>
            {grillNote ? (
              <p className={`min-h-5 text-sm ${grillNote === "Saved" ? "text-emerald-300" : "text-destructive"}`}>
                {grillNote}
              </p>
            ) : (
              <p className="min-h-5" />
            )}
          </form>
        </CardContent>
      </Panel>
      <Panel>
        <CardHeader>
          <CardTitle className="text-xs font-normal uppercase tracking-[0.2em] text-muted-foreground">
            Grill cooldown
          </CardTitle>
          <CardDescription>
            Turns grill power off and begins the Pellet Boss cooldown cycle. Use this when you want
            to stop cooking.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CooldownControls status={status} />
        </CardContent>
      </Panel>
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
