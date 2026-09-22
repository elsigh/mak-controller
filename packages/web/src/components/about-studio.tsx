"use client";

import { describePowerFailSafe, type StatusResponse } from "@makgrill/shared";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BASE_FORK_COMMIT,
  BASE_FORK_DETERMINATION,
  BASE_FORK_SOURCE,
  shortSha,
} from "@/lib/build-info";
import { useStatus } from "@/hooks/use-status";
import { PageHeader } from "./page-header";
import { Panel } from "./panel";

function display(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = String(value).trim();
  return text === "" ? "—" : text;
}

function MetaRow({
  label,
  value,
  pending = false,
  mono = true,
}: {
  label: string;
  value: string;
  pending?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-b border-border/70 py-2 last:border-b-0">
      <dt className="shrink-0 text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 text-right text-sm ${mono ? "font-mono tabular-nums" : ""}`}>
        {pending ? <Skeleton className="ml-auto h-5 w-28" /> : <span className="block truncate">{value}</span>}
      </dd>
    </div>
  );
}

export function AboutStudio({
  initialStatus = null,
  buildCommit = "",
}: {
  initialStatus?: StatusResponse | null;
  buildCommit?: string;
}) {
  const { status } = useStatus(2500, initialStatus);
  const pending = status === null;
  const state = status?.state;
  const command = status?.command;
  const session = status?.active_session;
  const commit = shortSha(buildCommit) || "not set at build";

  return (
    <div className="space-y-4">
      <PageHeader
        title="About"
        description="Build identity, upstream credit, and live grill diagnostics."
      />

      <Panel className="min-h-[16rem]">
        <CardHeader>
          <CardTitle className="text-xs font-normal uppercase tracking-[0.24em] text-muted-foreground">
            Attribution
          </CardTitle>
          <CardDescription className="min-h-10">
            Unofficial community controller. Derived from{" "}
            <a
              className="underline decoration-primary/50"
              href="https://github.com/bawilson2/mak-controller"
            >
              {BASE_FORK_SOURCE}
            </a>{" "}
            (Apache-2.0). Not affiliated with MAK Grills.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl>
            <MetaRow label="Base fork" value={shortSha(BASE_FORK_COMMIT)} />
            <MetaRow label="This build" value={commit} />
            <p className="mt-3 min-h-10 text-sm text-muted-foreground">{BASE_FORK_DETERMINATION}</p>
          </dl>
        </CardContent>
      </Panel>

      <Panel className="min-h-[28rem]">
        <CardHeader>
          <CardTitle className="text-xs font-normal uppercase tracking-[0.24em] text-muted-foreground">
            Grill diagnostics
          </CardTitle>
          <CardDescription className="min-h-5">
            Fields the Pellet Boss posts, plus bridge-derived status. Empty values stay reserved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl>
            <MetaRow label="Grill ID" value={display(state?.grill_id)} pending={pending} />
            <MetaRow label="Last poll" value={display(state?.last_seen)} pending={pending} />
            <MetaRow
              label="Online"
              value={display(status?.is_online)}
              pending={pending}
              mono={false}
            />
            <MetaRow label="Reported power" value={display(state?.power)} pending={pending} />
            <MetaRow
              label="Cooldown"
              value={display(status?.is_cooldown)}
              pending={pending}
              mono={false}
            />
            <MetaRow label="Pit temp" value={display(state?.temp)} pending={pending} />
            <MetaRow label="Probe 1" value={display(state?.probe1)} pending={pending} />
            <MetaRow label="Probe 2" value={display(state?.probe2)} pending={pending} />
            <MetaRow label="Probe 3" value={display(state?.probe3)} pending={pending} />
            <MetaRow label="GrillFlags" value={display(state?.flags)} pending={pending} />
            <MetaRow
              label="At setpoint"
              value={display(status?.at_set)}
              pending={pending}
              mono={false}
            />
            <MetaRow
              label="Power fail-safe"
              value={
                status?.power_failsafe
                  ? describePowerFailSafe(status.power_failsafe_reason) || "Yes"
                  : "No"
              }
              pending={pending}
              mono={false}
            />
            <MetaRow
              label="Setpoint"
              value={command ? `${command.setPoint}°F` : "—"}
              pending={pending}
            />
            <MetaRow
              label="Commanded power"
              value={command ? String(command.power) : "—"}
              pending={pending}
            />
            <MetaRow label="cookMode" value={display(command?.cookMode)} pending={pending} />
            <MetaRow label="zoneProbe" value={display(command?.zoneProbe)} pending={pending} />
            <MetaRow label="potStatus" value={display(command?.potStatus)} pending={pending} />
            <MetaRow
              label="Session"
              value={session ? `${session.name} · ${session.started_at}` : "None"}
              pending={pending}
              mono={false}
            />
          </dl>
        </CardContent>
      </Panel>
    </div>
  );
}
