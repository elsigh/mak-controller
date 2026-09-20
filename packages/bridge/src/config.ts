import path from "node:path";

function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const config = {
  host: env("BRIDGE_HOST", "0.0.0.0"),
  port: Number(env("BRIDGE_PORT", "80")) || 80,
  dbPath: env("DB_PATH", path.resolve("data/cooks.db")),
  secret: env("MAKGRILL_SECRET", ""),
  ntfyTopic: env("NTFY_TOPIC", ""),
  webOrigin: env("WEB_ORIGIN", ""),
  logLevel: env("LOG_LEVEL", "INFO").toUpperCase(),
};

export function log(level: "DEBUG" | "INFO" | "WARN" | "ERROR", message: string, extra?: unknown) {
  const rank = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };
  const min = rank[config.logLevel as keyof typeof rank] ?? 20;
  if (rank[level] < min) return;
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const suffix = extra === undefined ? "" : ` ${typeof extra === "string" ? extra : JSON.stringify(extra)}`;
  const line = `${stamp} [${level}] ${message}${suffix}`;
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
}
