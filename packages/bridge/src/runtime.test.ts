import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

const dataDir = mkdtempSync(join(tmpdir(), "makgrill-runtime-"));
process.env.DB_PATH = join(dataDir, "cooks.db");
process.env.BRIDGE_PORT = "0";

const { ONLINE_WINDOW_MS } = await import("@makgrill/shared");
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
    assert.equal(body, '"setPoint=200&potStatus=&cookMode=1&zoneProbe=1&power=1"');
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

  it("adopts pit setpoint after offline so a stale web buffer cannot trump the panel", () => {
    const runtime = new GrillRuntime("");
    const t0 = 1_000_000;
    runtime.setSetpoint(350);
    assert.equal(
      runtime.handleGrillPost({ GrillId: "TEST1", Temp: "348", Power: "ON" }, t0),
      '"setPoint=350&potStatus=&cookMode=1&zoneProbe=1&power=1"',
    );

    const reconnect = runtime.handleGrillPost(
      { GrillId: "TEST1", Temp: "365", Power: "ON" },
      t0 + ONLINE_WINDOW_MS + 1,
    );
    assert.equal(reconnect, '"setPoint=365&potStatus=&cookMode=1&zoneProbe=1&power=1"');
    assert.equal(runtime.getStatus(t0 + ONLINE_WINDOW_MS + 1).command.setPoint, 365);
  });

  it("snaps a reconnect pit temp to the nearest valid 5° step", () => {
    const runtime = new GrillRuntime("");
    const t0 = 2_000_000;
    runtime.setSetpoint(350);
    runtime.handleGrillPost({ GrillId: "TEST1", Temp: "350", Power: "ON" }, t0);
    const reconnect = runtime.handleGrillPost(
      { GrillId: "TEST1", Temp: "367", Power: "ON" },
      t0 + ONLINE_WINDOW_MS + 1,
    );
    assert.equal(reconnect, '"setPoint=365&potStatus=&cookMode=1&zoneProbe=1&power=1"');
  });

  it("does not rewrite setpoint from pit wobble while continuously online", () => {
    const runtime = new GrillRuntime("");
    const t0 = 3_000_000;
    runtime.setSetpoint(350);
    runtime.handleGrillPost({ GrillId: "TEST1", Temp: "350", Power: "ON" }, t0);
    const wobble = runtime.handleGrillPost(
      { GrillId: "TEST1", Temp: "354", Power: "ON" },
      t0 + 5_000,
    );
    assert.equal(wobble, '"setPoint=350&potStatus=&cookMode=1&zoneProbe=1&power=1"');
    const still = runtime.handleGrillPost(
      { GrillId: "TEST1", Temp: "346", Power: "ON" },
      t0 + 10_000,
    );
    assert.equal(still, '"setPoint=350&potStatus=&cookMode=1&zoneProbe=1&power=1"');
  });

  it("honors a pending UI setpoint set while the grill was offline", () => {
    const runtime = new GrillRuntime("");
    const t0 = 4_000_000;
    runtime.setSetpoint(350);
    runtime.handleGrillPost({ GrillId: "TEST1", Temp: "350", Power: "ON" }, t0);
    runtime.setSetpoint(400);
    const reconnect = runtime.handleGrillPost(
      { GrillId: "TEST1", Temp: "365", Power: "ON" },
      t0 + ONLINE_WINDOW_MS + 1,
    );
    assert.equal(reconnect, '"setPoint=400&potStatus=&cookMode=1&zoneProbe=1&power=1"');
  });

  it("keeps an active recipe setpoint instead of adopting pit on reconnect", () => {
    const runtime = new GrillRuntime("");
    const t0 = 5_000_000;
    runtime.startAutomation("Hold", [
      {
        name: "Hold",
        setpoint: 225,
        trigger_type: "hold",
        trigger_cond: "gte",
        trigger_val: 0,
      },
    ]);
    assert.equal(
      runtime.handleGrillPost({ GrillId: "TEST1", Temp: "225", Power: "ON" }, t0),
      '"setPoint=225&potStatus=&cookMode=1&zoneProbe=1&power=1"',
    );
    const reconnect = runtime.handleGrillPost(
      { GrillId: "TEST1", Temp: "365", Power: "ON" },
      t0 + ONLINE_WINDOW_MS + 1,
    );
    assert.equal(reconnect, '"setPoint=225&potStatus=&cookMode=1&zoneProbe=1&power=1"');
  });

  it("keeps commanded power on reconnect when the grill is still ON", () => {
    const runtime = new GrillRuntime("");
    const t0 = 6_000_000;
    runtime.handleGrillPost({ GrillId: "TEST1", Temp: "350", Power: "ON" }, t0);
    runtime.setPower(0);
    const reconnect = runtime.handleGrillPost(
      { GrillId: "TEST1", Temp: "350", Power: "ON" },
      t0 + ONLINE_WINDOW_MS + 1,
    );
    assert.equal(reconnect, '"setPoint=350&potStatus=&cookMode=1&zoneProbe=1&power=0"');
  });
});
