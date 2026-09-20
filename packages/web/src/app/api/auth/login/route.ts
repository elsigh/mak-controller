import { NextResponse } from "next/server";
import { AUTH_COOKIE, authEnabled, sessionDigest } from "@/lib/auth";

export async function POST(request: Request) {
  if (!authEnabled()) {
    return NextResponse.json({ success: true, auth: false });
  }
  const body = await request.json().catch(() => ({}));
  const secret = String(body.secret ?? "");
  if (secret !== process.env.MAKGRILL_SECRET) {
    return NextResponse.json({ success: false, error: "Wrong secret" }, { status: 401 });
  }
  const response = NextResponse.json({ success: true });
  response.cookies.set(AUTH_COOKIE, sessionDigest(secret), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
