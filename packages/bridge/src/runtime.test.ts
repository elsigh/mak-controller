import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

const dataDir = mkdtempSync(join(tmpdir(), "makgrill-runtime-"));
process.env.DB_PATH = join(dataDir, "cooks.db");
process.env.BRIDGE_PORT = "0";

const { initDb } = await import("./db.ts");
const { GrillRuntime } = await import("./runtime.ts");

describe("GrillRuntime protocol", () => {
  before(() => {
    initDb("");
  });

  after(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("returns a quoted command string and records telemetry", () => {
    const runtime = new GrillRuntime("");
    const body = runtime.handleGrillPost({
      GrillId: "TEST1",
      Temp: "200",
      Power: "ON",
      Probe1: "90",
      GrillFlags: "0",
    });
    assert.equal(body, '"setPoint=175&potStatus=&cookMode=1&zoneProbe=1&power=1"');
    const status = runtime.getStatus();
    assert.equal(status.is_online, true);
    assert.equal(status.state.temp, "200");
  });

  it("applies a UI setpoint on the next grill poll", () => {
    const runtime = new GrillRuntime("");
    runtime.setSetpoint(223);
    const body = runtime.handleGrillPost({
      GrillId: "TEST1",
      Temp: "198",
      Power: "ON",
    });
    assert.equal(body, '"setPoint=225&potStatus=&cookMode=1&zoneProbe=1&power=1"');
  });

  it("respects cooldown interlock and resets power after COOL", () => {
    const runtime = new GrillRuntime("");
    runtime.handleGrillPost({ GrillId: "TEST1", Temp: "250", Power: "ON" });
    runtime.setPower(0);
    assert.equal(runtime.getStatus().is_cooldown, true);
    const denied = runtime.setPower(1);
    assert.equal(denied.ok, false);
    const body = runtime.handleGrillPost({ GrillId: "TEST1", Temp: "180", Power: "COOL" });
    assert.match(body, /power=1/);
    assert.equal(runtime.getStatus().command.power, 1);
  });
});
