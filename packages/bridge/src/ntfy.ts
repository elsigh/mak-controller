import { log } from "./config.ts";

export async function sendNtfy(topic: string, title: string, message: string, priority = "default"): Promise<void> {
  const trimmed = topic.trim();
  if (!trimmed) return;
  const url = trimmed.startsWith("http") ? trimmed : `https://ntfy.sh/${trimmed}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Title: title, Priority: priority },
      body: message,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      log("ERROR", `ntfy responded ${res.status} for ${url}`);
    } else {
      log("DEBUG", `Sent ntfy '${title}' via ${url}`);
    }
  } catch (error) {
    log("ERROR", `Failed to send ntfy alert: ${error instanceof Error ? error.message : String(error)}`);
  }
}
