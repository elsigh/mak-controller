import { Hono } from "hono";
import type { GrillRuntime } from "../runtime.ts";

export function grillRoutes(runtime: GrillRuntime) {
  const app = new Hono();

  app.post("/GrillService/Service", async (c) => {
    const body = await c.req.parseBody();
    const form: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string") form[key] = value;
    }
    const payload = runtime.handleGrillPost(form);
    if (payload === null) {
      // No command for the grill (no app setpoint this cook): reply like a
      // briefly unavailable server so the grill keeps its panel setpoint.
      return c.body(null, 503, { "Content-Type": "text/html", "Cache-Control": "no-store" });
    }
    return c.body(payload, 200, { "Content-Type": "text/html" });
  });

  return app;
}
