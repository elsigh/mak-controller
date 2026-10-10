import type { NtfyAlertStatus } from "@makgrill/shared";
import { log } from "./config.ts";

export interface SendNtfyOptions {
  /** Total attempts including the first (default 4). */
  attempts?: number;
  /** First retry delay; doubles each retry (default 2000ms → 2s, 4s, 8s). */
  baseDelayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

let lastAlert: NtfyAlertStatus | null = null;

/** Most recent ntfy send (any title), for /internal/status and the About page. */
export function getLastNtfyAlert(): NtfyAlertStatus | null {
  return lastAlert ? { ...lastAlert } : null;
}

export function resetNtfyStatusForTests() {
  lastAlert = null;
}

function ntfyUrl(topic: string): string {
  return topic.startsWith("http") ? topic : `https://ntfy.sh/${topic}`;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Publish one ntfy message. Every attempt is logged with its result; network
 * errors, 429 and 5xx are retried with exponential backoff. Never throws.
 */
export async function sendNtfy(
  topic: string,
  title: string,
  message: string,
  priority = "default",
  options: SendNtfyOptions = {},
): Promise<NtfyAlertStatus> {
  const attempts = Math.max(1, options.attempts ?? 4);
  const baseDelayMs = options.baseDelayMs ?? 2000;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const trimmed = topic.trim();
  const startedAt = new Date().toISOString();

  const record = (result: Omit<NtfyAlertStatus, "at" | "title" | "priority">): NtfyAlertStatus => {
    lastAlert = { at: startedAt, title, priority, ...result };
    return { ...lastAlert };
  };

  if (!trimmed) {
    log("ERROR", `ntfy NOT sent ('${title}', priority=${priority}): no ntfy topic configured (set NTFY_TOPIC or Settings → ntfy topic).`);
    return record({ ok: false, status: null, error: "No ntfy topic configured", attempts: 0 });
  }

  const url = ntfyUrl(trimmed);
  let lastError = "";
  let lastStatus: number | null = null;
  let tried = 0;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    tried = attempt;
    try {
      const res = await doFetch(url, {
        method: "POST",
        headers: { Title: title, Priority: priority },
        body: message,
        signal: AbortSignal.timeout(timeoutMs),
      });
      lastStatus = res.status;
      if (res.ok) {
        log("INFO", `ntfy sent '${title}' (priority=${priority}) to ${url}: HTTP ${res.status} (attempt ${attempt}/${attempts})`);
        return record({ ok: true, status: res.status, error: null, attempts: attempt });
      }
      const text = await res.text().catch(() => "");
      lastError = `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`;
      const retryable = res.status === 429 || res.status >= 500;
      log("ERROR", `ntfy send '${title}' to ${url} failed: ${lastError} (attempt ${attempt}/${attempts}${retryable ? "" : ", not retrying"})`);
      if (!retryable) break;
    } catch (error) {
      lastStatus = null;
      lastError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      log("ERROR", `ntfy send '${title}' to ${url} errored: ${lastError} (attempt ${attempt}/${attempts})`);
    }
    if (attempt < attempts) await sleep(baseDelayMs * 2 ** (attempt - 1));
  }
  log("ERROR", `ntfy GAVE UP on '${title}' (priority=${priority}) to ${url}: ${lastError}`);
  return record({ ok: false, status: lastStatus, error: lastError || "unknown error", attempts: tried });
}
