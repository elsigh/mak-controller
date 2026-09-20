#!/usr/bin/env node
/**
 * Smoke test: simulate a Pellet Boss POST, then a UI setpoint change,
 * then confirm the next GrillService response carries the new command.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.SMOKE_PORT || 18080);
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const existing = process.env.BRIDGE_URL;

async function waitForHealth(base, tries = 40) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return;
    } catch {
      /* still booting */
    }
    await delay(150);
  }
  throw new Error(`Bridge did not become healthy at ${base}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function grillPost(base, fields) {
  const body = new URLSearchParams(fields);
  const res = await fetch(`${base}/GrillService/Service`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  return { status: res.status, type: res.headers.get("content-type"), text };
}

async function runAgainst(base) {
  const first = await grillPost(base, {
    GrillId: "SMOKE1",
    Temp: "210",
    Power: "ON",
    Probe1: "145",
    Probe2: "",
    Probe3: "",
    GrillFlags: "0",
  });
  assert(first.status === 200, `Grill POST status ${first.status}`);
  assert(first.type?.includes("text/html"), `Expected text/html, got ${first.type}`);
  assert(first.text.startsWith('"') && first.text.endsWith('"'), `Response must be quoted: ${first.text}`);
  assert(first.text.includes("setPoint="), `Missing setPoint: ${first.text}`);

  const statusRes = await fetch(`${base}/internal/status`);
  assert(statusRes.ok, `status ${statusRes.status}`);
  const status = await statusRes.json();
  assert(status.is_online === true, "Grill should be online after POST");
  assert(status.state.temp === "210", `Expected pit 210, got ${status.state.temp}`);
  assert(status.state.probe1 === "145", `Expected probe1 145, got ${status.state.probe1}`);

  const setRes = await fetch(`${base}/internal/setpoint`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ temp: 225 }),
  });
  assert(setRes.ok, `setpoint ${setRes.status}`);
  const setBody = await setRes.json();
  assert(setBody.setPoint === 225, `Expected clamped 225, got ${setBody.setPoint}`);

  const second = await grillPost(base, {
    GrillId: "SMOKE1",
    Temp: "212",
    Power: "ON",
    Probe1: "146",
    Probe2: "",
    Probe3: "",
    GrillFlags: "ATSET",
  });
  assert(
    second.text === '"setPoint=225&potStatus=&cookMode=1&zoneProbe=1&power=1"',
    `Next grill response should carry UI setpoint. Got: ${second.text}`,
  );

  await fetch(`${base}/internal/power`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state: 0 }),
  });
  const shutdown = await grillPost(base, {
    GrillId: "SMOKE1",
    Temp: "180",
    Power: "COOL",
    Probe1: "",
    Probe2: "",
    Probe3: "",
    GrillFlags: "0",
  });
  assert(shutdown.text.includes("power=1"), `Cooldown should reset commanded power to 1. Got: ${shutdown.text}`);

  console.log("Smoke test passed.");
  console.log(`  grill POST → UI online + pit ${status.state.temp}°F`);
  console.log(`  UI setpoint 225 → next GrillService body ${second.text}`);
  console.log(`  power=0 then COOL → ${shutdown.text}`);
}

async function main() {
  if (existing) {
    await runAgainst(existing.replace(/\/$/, ""));
    return;
  }

  const dataDir = await mkdtemp(join(tmpdir(), "makgrill-smoke-"));
  const child = spawn("npx", ["tsx", "packages/bridge/src/index.ts"], {
    cwd: ROOT,
    env: {
      ...process.env,
      BRIDGE_PORT: String(PORT),
      DB_PATH: join(dataDir, "cooks.db"),
      MAKGRILL_SECRET: "",
      WEB_ORIGIN: "",
      LOG_LEVEL: "WARN",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });

  try {
    await waitForHealth(`http://127.0.0.1:${PORT}`);
    await runAgainst(`http://127.0.0.1:${PORT}`);
  } catch (error) {
    console.error(output);
    throw error;
  } finally {
    try {
      if (child.pid) process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
    await rm(dataDir, { recursive: true, force: true });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
