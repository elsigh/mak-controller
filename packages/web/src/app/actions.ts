"use server";

import { revalidatePath } from "next/cache";
import { bridgeFetch } from "@/lib/bridge";

async function post(path: string, body: unknown) {
  const res = await bridgeFetch(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Bridge ${path} failed`);
  }
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/recipes");
  revalidatePath("/settings");
}

export async function setSetpointAction(formData: FormData) {
  const temp = Number(formData.get("temp"));
  if (!Number.isFinite(temp)) return;
  await post("/internal/setpoint", { temp });
}

export async function setPowerAction(formData: FormData) {
  const state = Number(formData.get("state"));
  if (state !== 0 && state !== 1) return;
  await post("/internal/power", { state });
}

export async function startSessionAction(formData: FormData) {
  const name = String(formData.get("name") || "Cook Session").trim() || "Cook Session";
  await post("/internal/session/start", { name });
}

export async function stopSessionAction() {
  await post("/internal/session/stop", {});
}

export async function saveSettingsAction(formData: FormData) {
  await post("/internal/settings", { ntfy_topic: String(formData.get("ntfy_topic") ?? "") });
}
