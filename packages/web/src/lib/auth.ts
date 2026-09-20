import { createHash } from "node:crypto";

export const AUTH_COOKIE = "makgrill_session";

export function sessionDigest(secret: string): string {
  return createHash("sha256").update(`makgrill:${secret}`).digest("hex");
}

export function authEnabled(): boolean {
  return Boolean(process.env.MAKGRILL_SECRET);
}
