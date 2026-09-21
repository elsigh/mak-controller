import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const source = join(root, "mak-flame-source.png");
const outDir = join(root, "../public");

if (!existsSync(source)) {
  throw new Error(`Missing source icon: ${source}`);
}

mkdirSync(outDir, { recursive: true });

function ffmpeg(args) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed (${result.status ?? "missing"}). Install ffmpeg to regenerate icons.`);
  }
}

function resize(name, size) {
  ffmpeg(["-y", "-i", source, "-vf", `scale=${size}:${size}:flags=lanczos`, join(outDir, name)]);
}

resize("mak-flame-32.png", 32);
resize("mak-flame-180.png", 180);
resize("mak-flame-192.png", 192);
resize("mak-flame-512.png", 512);
ffmpeg([
  "-y",
  "-i",
  source,
  "-vf",
  "scale=410:410:flags=lanczos,pad=512:512:51:51:black",
  join(outDir, "mak-flame-512-maskable.png"),
]);

copyFileSync(join(outDir, "mak-flame-180.png"), join(outDir, "apple-touch-icon.png"));
copyFileSync(join(outDir, "mak-flame-180.png"), join(outDir, "apple-touch-icon-precomposed.png"));
copyFileSync(join(outDir, "mak-flame-192.png"), join(outDir, "icon-192.png"));
copyFileSync(join(outDir, "mak-flame-512.png"), join(outDir, "icon-512.png"));

console.log("wrote MakGrill flame icons to", outDir);
