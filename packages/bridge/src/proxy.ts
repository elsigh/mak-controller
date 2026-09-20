import type { Context } from "hono";
import { config, log } from "./config.ts";

/**
 * Next.js Server Actions compare Origin to x-forwarded-host. The web
 * container's Host is `web:3000`, while the browser Origin is the public
 * hostname (e.g. elsigh-studio). Preserve the browser Host so those match.
 */
export function prepareProxyHeaders(incoming: Headers, incomingUrl: URL, targetHost: string): Headers {
  const headers = new Headers(incoming);
  const browserHost = headers.get("x-forwarded-host") ?? headers.get("host");
  const proto = headers.get("x-forwarded-proto") ?? (incomingUrl.protocol.replace(":", "") || "http");

  headers.set("host", targetHost);
  headers.delete("content-length");
  // Node fetch auto-decompresses; don't ask upstream for compressed bodies
  // or we'll wrongly forward Content-Encoding to the client (Safari -1015).
  headers.delete("accept-encoding");

  if (browserHost) {
    headers.set("x-forwarded-host", browserHost);
  }
  headers.set("x-forwarded-proto", proto);
  return headers;
}

export async function proxyToWeb(c: Context): Promise<Response> {
  if (!config.webOrigin) {
    return c.text("MakGrill bridge is running. Set WEB_ORIGIN to proxy the UI.", 200);
  }

  const incoming = new URL(c.req.url);
  const target = new URL(incoming.pathname + incoming.search, config.webOrigin);
  const headers = prepareProxyHeaders(c.req.raw.headers, incoming, target.host);

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
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    responseHeaders.delete("transfer-encoding");
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
