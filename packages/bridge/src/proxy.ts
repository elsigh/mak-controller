import type { Context } from "hono";
import { config, log } from "./config.ts";

export async function proxyToWeb(c: Context): Promise<Response> {
  if (!config.webOrigin) {
    return c.text("MakGrill bridge is running. Set WEB_ORIGIN to proxy the UI.", 200);
  }

  const incoming = new URL(c.req.url);
  const target = new URL(incoming.pathname + incoming.search, config.webOrigin);
  const headers = new Headers(c.req.raw.headers);
  headers.set("host", target.host);
  headers.delete("content-length");

  const method = c.req.method;
  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers,
    redirect: "manual",
  };

  if (method !== "GET" && method !== "HEAD") {
    init.body = c.req.raw.body;
    init.duplex = "half";
  }

  try {
    const upstream = await fetch(target, init);
    const responseHeaders = new Headers(upstream.headers);
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    log("ERROR", `UI proxy failed: ${error instanceof Error ? error.message : String(error)}`);
    return c.text("MakGrill UI is unavailable", 502);
  }
}
