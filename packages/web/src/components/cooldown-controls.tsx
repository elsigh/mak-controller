"use client";

import type { StatusResponse } from "@makgrill/shared";
import { setPowerAction } from "@/app/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { touchBtnClass } from "@/lib/ui";

export function CooldownControls({ status }: { status: StatusResponse | null }) {
  const online = Boolean(status?.is_online);
  const cooldown = Boolean(status?.is_cooldown);
  const isOn = status?.state.power.toUpperCase() === "ON";
  const canStart = online && isOn && !cooldown;

  return (
    <div className="flex min-h-11 justify-center sm:justify-end">
      {canStart ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="destructive" className={touchBtnClass}>
              Start cooldown
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Start cooldown?</AlertDialogTitle>
              <AlertDialogDescription>
                This turns grill power off and begins cooldown. The Pellet Boss will shut down after
                its cooldown cycle. Confirm only if you want to stop cooking.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <form action={setPowerAction} className="contents">
                <input type="hidden" name="state" value={0} />
                <AlertDialogAction type="submit" variant="destructive">
                  Start cooldown
                </AlertDialogAction>
              </form>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <Button type="button" disabled variant="secondary" className={touchBtnClass}>
          {cooldown ? "Cooldown locked" : "Start cooldown"}
        </Button>
      )}
    </div>
  );
}
