"use client";

import type { StatusResponse } from "@makgrill/shared";
import { startSessionAction, stopSessionAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fieldClass, touchBtnClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { Panel } from "./panel";

export function SessionCard({ status }: { status: StatusResponse | null }) {
  const session = status?.active_session;

  return (
    <Panel className="min-h-[10.5rem]">
      <CardHeader>
        <CardTitle className="text-xs font-normal uppercase tracking-[0.24em] text-muted-foreground">
          Cook session
        </CardTitle>
        <CardDescription className="min-h-5">
          {session
            ? `${session.name} · started ${session.started_at}`
            : "Volatile buffer only — start a session to keep a named log."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2 sm:flex-row">
          {session ? (
            <form action={stopSessionAction} className="contents">
              <Input disabled value={session.name} className={fieldClass} />
              <Button type="submit" variant="destructive" className={touchBtnClass}>
                End cook
              </Button>
            </form>
          ) : (
            <form action={startSessionAction} className="contents">
              <Input name="name" defaultValue="Pork shoulder" className={fieldClass} />
              <Button type="submit" className={touchBtnClass}>
                Start cook
              </Button>
            </form>
          )}
          <Button
            asChild
            variant="outline"
            className={cn(touchBtnClass, !session && "pointer-events-none opacity-40")}
          >
            <a href={session ? `/api/session/export?id=${session.id}` : undefined}>CSV</a>
          </Button>
        </div>
      </CardContent>
    </Panel>
  );
}
