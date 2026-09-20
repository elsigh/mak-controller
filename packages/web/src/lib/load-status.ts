import type { StatusResponse } from "@makgrill/shared";
import { bridgeFetch } from "./bridge";

export async function loadStatus(): Promise<StatusResponse | null> {
  try {
    const res = await bridgeFetch("/internal/status");
    if (!res.ok) return null;
    return (await res.json()) as StatusResponse;
  } catch {
    return null;
  }
}
