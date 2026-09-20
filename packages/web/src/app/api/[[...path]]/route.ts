import { proxyBridge } from "@/lib/bridge";

type RouteContext = { params: Promise<{ path?: string[] }> };

async function handle(request: Request, context: RouteContext) {
  const { path = [] } = await context.params;
  if (path[0] === "auth") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  try {
    return await proxyBridge(request, path);
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Bridge unavailable" }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
