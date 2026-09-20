import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config, log } from "./config.ts";
import { initDb } from "./db.ts";
import { proxyToWeb } from "./proxy.ts";
import { grillRoutes } from "./routes/grill.ts";
import { internalRoutes } from "./routes/internal.ts";
import { GrillRuntime } from "./runtime.ts";

const topic = initDb(config.ntfyTopic);
const runtime = new GrillRuntime(topic);

const app = new Hono();

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "makgrill-bridge",
    port: config.port,
    webOrigin: config.webOrigin || null,
  }),
);

app.route("/", grillRoutes(runtime));
app.route("/internal", internalRoutes(runtime));
app.all("*", (c) => proxyToWeb(c));

serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  log("INFO", `MakGrill bridge listening on http://${info.address}:${info.port}`);
  log("INFO", "Grill path: POST /GrillService/Service (no TLS, no auth)");
  log("INFO", "Internal API: /internal/* (shared-secret when MAKGRILL_SECRET is set)");
});
