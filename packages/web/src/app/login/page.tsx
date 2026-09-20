"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/panel";
import { fieldClass, touchBtnClass } from "@/lib/ui";

export default function LoginPage() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("That secret did not match MAKGRILL_SECRET.");
      return;
    }
    router.replace("/");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <Panel className="w-full max-w-md py-8">
        <CardHeader>
          <p className="text-xs uppercase tracking-[0.24em] text-primary">MakGrill</p>
          <CardTitle className="mt-2 text-3xl">Enter the house secret</CardTitle>
          <CardDescription>
            The Pellet Boss path stays unauthenticated. This secret only gates the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onSubmit(e)}>
            <Label className="sr-only" htmlFor="secret">
              Shared secret
            </Label>
            <Input
              id="secret"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Shared secret"
              className={fieldClass}
            />
            <p className="mt-3 min-h-5 text-sm text-red-300">{error}</p>
            <Button type="submit" disabled={busy} className={`mt-2 w-full ${touchBtnClass}`}>
              {busy ? "Checking…" : "Open dashboard"}
            </Button>
          </form>
        </CardContent>
      </Panel>
    </div>
  );
}
