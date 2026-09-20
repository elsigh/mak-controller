import { cookies } from "next/headers";
import { AUTH_COOKIE, authEnabled, sessionDigest } from "./auth";

function bridgeUrl() {
  return (process.env.BRIDGE_URL ?? "http://127.0.0.1:8080").replace(/\/$/, "");
}

export async function assertUiSession() {
  if (!authEnabled()) return;
  const secret = process.env.MAKGRILL_SECRET ?? "";
  const jar = await cookies();
  if (jar.get(AUTH_COOKIE)?.value !== sessionDigest(secret)) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function bridgeFetch(path: string, init: RequestInit = {}): Promise<Response> {
  await assertUiSession();
  const headers = new Headers(init.headers);
  const secret = process.env.MAKGRILL_SECRET;
  if (secret) headers.set("x-makgrill-secret", secret);
  if (!headers.has("content-type") && init.body && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  return fetch(`${bridgeUrl()}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export async function proxyBridge(request: Request, path: string[]): Promise<Response> {
  const url = new URL(request.url);
  const dest = `/internal/${path.join("/")}${url.search}`;
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const method = request.method;
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
  const upstream = await bridgeFetch(dest, { method, headers, body });
  const out = new Headers();
  const pass = ["content-type", "content-disposition"];
  for (const key of pass) {
    const value = upstream.headers.get(key);
    if (value) out.set(key, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
