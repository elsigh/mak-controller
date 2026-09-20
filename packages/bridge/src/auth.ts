import type { Context, Next } from "hono";
import { config } from "./config.ts";

export async function requireBridgeSecret(c: Context, next: Next) {
  if (!config.secret) {
    await next();
    return;
  }
  const header = c.req.header("x-makgrill-secret") ?? c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (header !== config.secret) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
}
