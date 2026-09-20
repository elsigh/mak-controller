import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
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
