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
    return c.body(payload, 200, { "Content-Type": "text/html" });
  });

  return app;
}
