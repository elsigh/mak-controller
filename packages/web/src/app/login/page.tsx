"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

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
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={(e) => void onSubmit(e)} className="panel w-full max-w-md rounded-3xl p-8">
        <p className="text-xs uppercase tracking-[0.24em] text-amber-300">MakGrill</p>
        <h1 className="mt-2 text-3xl font-semibold">Enter the house secret</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          The Pellet Boss path stays unauthenticated. This secret only gates the dashboard.
        </p>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Shared secret"
          className="mt-6 w-full rounded-2xl border border-[var(--line)] bg-black/30 px-4 py-3 outline-none focus:border-amber-400"
        />
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-2xl bg-amber-400 py-3 font-semibold text-black disabled:opacity-50"
        >
          {busy ? "Checking…" : "Open dashboard"}
        </button>
      </form>
    </div>
  );
}
