import { execSync } from "node:child_process";
import path from "node:path";
import type { NextConfig } from "next";

function resolveGitCommit(): string {
  const fromEnv = process.env.NEXT_PUBLIC_GIT_COMMIT || process.env.GIT_COMMIT;
  if (fromEnv?.trim()) return fromEnv.trim();
  try {
    return execSync("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  env: {
    NEXT_PUBLIC_GIT_COMMIT: resolveGitCommit(),
  },
  transpilePackages: ["@makgrill/shared"],
  serverExternalPackages: [
    "@tailwindcss/oxide",
    "@tailwindcss/oxide-linux-x64-gnu",
    "@tailwindcss/oxide-linux-arm64-gnu",
    "lightningcss",
    "lightningcss-linux-x64-gnu",
    "lightningcss-linux-arm64-gnu",
  ],
};

export default nextConfig;
