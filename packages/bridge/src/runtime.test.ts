import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

const dataDir = mkdtempSync(join(tmpdir(), "makgrill-runtime-"));
process.env.DB_PATH = join(dataDir, "cooks.db");
process.env.BRIDGE_PORT = "0";

const {
  ONLINE_WINDOW_MS,
  SILENCE_RENOTIFY_MS,
  SILENCE_THRESHOLD_MS,
} = await import("@makgrill/shared");
const { getGrillNames, getSetting, initDb, setGrillDisplayName } = await import("./db.ts");
const { GrillRuntime } = await import("./runtime.ts");

describe("GrillRuntime protocol", () => {
  before(() => {
    initDb("");
  });

  after(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("binds a provisional grill name on the first GrillId POST", () => {
    const runtime = new GrillRuntime("");
    assert.equal(runtime.getStatus().grill_name, "MakGrill");
    setGrillDisplayName("Unknown", "Backyard MAK");
    assert.equal(runtime.getStatus().grill_name, "Backyard MAK");
    runtime.handleGrillPost({
      GrillId: "GRILL-NAME-1",
      Temp: "200",
      Power: "ON",
    });
    assert.equal(runtime.getStatus().state.grill_id, "GRILL-NAME-1");
    assert.equal(runtime.getStatus().grill_name, "Backyard MAK");
    assert.equal(getGrillNames()["GRILL-NAME-1"], "Backyard MAK");
    assert.equal(getSetting("grill_name_provisional"), "");
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

describe("GrillRuntime safety fail-safes", () => {
  before(() => {
    initDb("");
  });

  it("sets commanded power to 0 after 30s of silence while last Power was ON", () => {
    const alerts: Array<{ title: string; priority?: string }> = [];
    const runtime = new GrillRuntime("", {
      notify: (title, _message, priority) => alerts.push({ title, priority }),
    });
    const t0 = 20_000_000;
    runtime.handleGrillPost({ GrillId: "TEST1", Temp: "350", Power: "ON" }, t0);
    runtime.tickWatchdog(t0 + SILENCE_THRESHOLD_MS - 1);
    assert.equal(runtime.getStatus(t0 + SILENCE_THRESHOLD_MS - 1).command.power, 1);
    assert.equal(runtime.getStatus(t0 + SILENCE_THRESHOLD_MS - 1).power_failsafe, false);

    runtime.tickWatchdog(t0 + SILENCE_THRESHOLD_MS);
    const status = runtime.getStatus(t0 + SILENCE_THRESHOLD_MS);
    assert.equal(status.command.power, 0);
    assert.equal(status.power_failsafe, true);
    assert.equal(status.power_failsafe_reason, "silence");
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0]?.title, "MakGrill: grill silent / Web Ctrl lost");
    assert.equal(alerts[0]?.priority, "urgent");

    runtime.tickWatchdog(t0 + SILENCE_THRESHOLD_MS + 5_000);
    assert.equal(alerts.length, 1);
    runtime.tickWatchdog(t0 + SILENCE_THRESHOLD_MS + SILENCE_RENOTIFY_MS);
    assert.equal(alerts.length, 1);
    assert.equal(runtime.getStatus(t0 + SILENCE_THRESHOLD_MS + SILENCE_RENOTIFY_MS).command.power, 0);
  });

  it("does not silence-alert or force power when last Power was cooldown/cool/cd/off", () => {
    for (const power of ["COOLDOWN", "cooldown", "COOL", "CD", "OFF"]) {
      const alerts: string[] = [];
      const runtime = new GrillRuntime("", {
        notify: (title) => alerts.push(title),
      });
      const t0 = 27_000_000;
      runtime.handleGrillPost({ GrillId: "TEST1", Temp: "250", Power: "ON" }, t0);
      runtime.handleGrillPost({ GrillId: "TEST1", Temp: "180", Power: power }, t0 + 5_000);
      runtime.tickWatchdog(t0 + 5_000 + SILENCE_THRESHOLD_MS);
      const status = runtime.getStatus(t0 + 5_000 + SILENCE_THRESHOLD_MS);
      assert.equal(alerts.length, 0, `unexpected silence ntfy for Power=${power}`);
      assert.notEqual(status.power_failsafe_reason, "silence");
    }
  });

  it("does not silence-alert after user-initiated cooldown when last Power is cooldown", () => {
    const alerts: string[] = [];
    const runtime = new GrillRuntime("", {
      notify: (title) => alerts.push(title),
    });
    const t0 = 29_000_000;
    runtime.handleGrillPost({ GrillId: "TEST1", Temp: "350", Power: "ON" }, t0);
    runtime.setPower(0);
    const cool = runtime.handleGrillPost(
      { GrillId: "TEST1", Temp: "180", Power: "cooldown" },
      t0 + 5_000,
    );
    assert.match(cool, /power=1/);
    runtime.tickWatchdog(t0 + 5_000 + SILENCE_THRESHOLD_MS);
    runtime.tickWatchdog(t0 + 5_000 + SILENCE_THRESHOLD_MS + SILENCE_RENOTIFY_MS);
    assert.equal(alerts.length, 0);
    const status = runtime.getStatus(t0 + 5_000 + SILENCE_THRESHOLD_MS + SILENCE_RENOTIFY_MS);
    assert.notEqual(status.power_failsafe_reason, "silence");
  });

  it("does not re-notify when commanded power is already 0 while still silent", () => {
    const alerts: string[] = [];
    const runtime = new GrillRuntime("", {
      notify: (title) => alerts.push(title),
    });
    const t0 = 28_000_000;
    runtime.handleGrillPost({ GrillId: "TEST1", Temp: "350", Power: "ON" }, t0);
    runtime.setPower(0);
    runtime.tickWatchdog(t0 + SILENCE_THRESHOLD_MS);
    assert.equal(alerts.length, 0);
    runtime.tickWatchdog(t0 + SILENCE_THRESHOLD_MS + SILENCE_RENOTIFY_MS);
    assert.equal(alerts.length, 0);
    assert.equal(runtime.getStatus(t0 + SILENCE_THRESHOLD_MS + SILENCE_RENOTIFY_MS).command.power, 0);
  });

  it("does not alert or change power when pit stays 35°F+ under setpoint", () => {
    const softWindowMs = 8 * 60 * 1000;
    const alerts: Array<{ title: string; body: string; priority?: string }> = [];
    const runtime = new GrillRuntime("", {
      notify: (title, body, priority) => alerts.push({ title, body, priority }),
    });
    const t0 = 21_000_000;
    runtime.setSetpoint(250);
    for (let t = t0; t <= t0 + softWindowMs + 60_000; t += 10_000) {
      const body = runtime.handleGrillPost({ GrillId: "TEST1", Temp: "200", Power: "ON" }, t);
      assert.match(body, /power=1/);
      const status = runtime.getStatus(t);
      assert.equal(status.command.power, 1);
      assert.equal(status.power_failsafe, false);
      assert.equal(status.power_failsafe_reason, null);
      assert.equal("flameout_alert" in status, false);
    }
    assert.equal(alerts.length, 0);
  });

  it("does not start an unseen OFF grill with default power=1", () => {
    const runtime = new GrillRuntime("");
    const body = runtime.handleGrillPost({ GrillId: "TEST1", Temp: "80", Power: "OFF" });
    assert.match(body, /power=0/);
    assert.equal(runtime.getStatus().power_failsafe_reason, "offline-off");
  });

  it("does not auto power=1 when the grill reports OFF after a long gap", () => {
    const runtime = new GrillRuntime("");
    const t0 = 22_000_000;
    runtime.handleGrillPost({ GrillId: "TEST1", Temp: "350", Power: "ON" }, t0);
    assert.equal(runtime.getStatus(t0).command.power, 1);

    const reconnect = runtime.handleGrillPost(
      { GrillId: "TEST1", Temp: "120", Power: "OFF" },
      t0 + SILENCE_THRESHOLD_MS,
    );
    assert.equal(reconnect, '"setPoint=150&potStatus=&cookMode=1&zoneProbe=1&power=0"');
    const status = runtime.getStatus(t0 + SILENCE_THRESHOLD_MS);
    assert.equal(status.command.power, 0);
    assert.equal(status.power_failsafe, true);
    assert.equal(status.power_failsafe_reason, "offline-off");

    const still = runtime.handleGrillPost(
      { GrillId: "TEST1", Temp: "90", Power: "OFF" },
      t0 + SILENCE_THRESHOLD_MS + 5_000,
    );
    assert.match(still, /power=0/);
  });

  it("honors an explicit UI/API power-on after a long OFF gap", () => {
    const runtime = new GrillRuntime("");
    const t0 = 23_000_000;
    runtime.handleGrillPost({ GrillId: "TEST1", Temp: "350", Power: "ON" }, t0);
    runtime.handleGrillPost({ GrillId: "TEST1", Temp: "90", Power: "OFF" }, t0 + SILENCE_THRESHOLD_MS);
    const allowed = runtime.setPower(1);
    assert.equal(allowed.ok, true);
    const resume = runtime.handleGrillPost(
      { GrillId: "TEST1", Temp: "90", Power: "OFF" },
      t0 + SILENCE_THRESHOLD_MS + 5_000,
    );
    assert.match(resume, /power=1/);
    assert.equal(runtime.getStatus(t0 + SILENCE_THRESHOLD_MS + 5_000).power_failsafe, false);
  });

  it("sets commanded power to 0 on danger tokens in GrillFlags or Power", () => {
    const flagAlerts: Array<{ title: string; priority?: string }> = [];
    const flagsRuntime = new GrillRuntime("", {
      notify: (title, _body, priority) => flagAlerts.push({ title, priority }),
    });
    const flagsBody = flagsRuntime.handleGrillPost({
      GrillId: "TEST1",
      Temp: "350",
      Power: "ON",
      GrillFlags: "FIRE",
    });
    assert.match(flagsBody, /power=0/);
    assert.equal(flagsRuntime.getStatus().power_failsafe_reason, "danger");
    assert.equal(flagAlerts.length, 1);
    assert.equal(flagAlerts[0]?.title, "MakGrill: danger flag");
    assert.equal(flagAlerts[0]?.priority, "urgent");

    const powerAlerts: Array<{ title: string; priority?: string }> = [];
    const powerRuntime = new GrillRuntime("", {
      notify: (title, _body, priority) => powerAlerts.push({ title, priority }),
    });
    const powerBody = powerRuntime.handleGrillPost({
      GrillId: "TEST1",
      Temp: "350",
      Power: "FLAME OUT",
    });
    assert.match(powerBody, /power=0/);
    assert.equal(powerRuntime.getStatus().command.power, 0);
    assert.equal(powerRuntime.getStatus().power_failsafe_reason, "danger");
    assert.equal(powerAlerts.length, 1);
    assert.equal(powerAlerts[0]?.title, "MakGrill: danger flag");
    assert.equal(powerAlerts[0]?.priority, "urgent");
  });

  it("does not false-trip during continuous healthy polls", () => {
    const alerts: string[] = [];
    const runtime = new GrillRuntime("", {
      notify: (title) => alerts.push(title),
    });
    const t0 = 24_000_000;
    runtime.setSetpoint(350);
    for (let i = 0; i <= 20; i += 1) {
      const t = t0 + i * 5_000;
      runtime.tickWatchdog(t);
      const body = runtime.handleGrillPost({ GrillId: "TEST1", Temp: "348", Power: "ON" }, t);
      assert.equal(body, '"setPoint=350&potStatus=&cookMode=1&zoneProbe=1&power=1"');
      const status = runtime.getStatus(t);
      assert.equal(status.command.power, 1);
      assert.equal(status.power_failsafe, false);
      assert.equal("flameout_alert" in status, false);
    }
    assert.equal(alerts.length, 0);
  });

  it("adopts pit setpoint on reconnect while keeping a silence power hold", () => {
    const runtime = new GrillRuntime("");
    const t0 = 25_000_000;
    runtime.setSetpoint(350);
    runtime.handleGrillPost({ GrillId: "TEST1", Temp: "350", Power: "ON" }, t0);
    runtime.tickWatchdog(t0 + SILENCE_THRESHOLD_MS);
    const reconnect = runtime.handleGrillPost(
      { GrillId: "TEST1", Temp: "365", Power: "ON" },
      t0 + SILENCE_THRESHOLD_MS + 1,
    );
    assert.equal(reconnect, '"setPoint=365&potStatus=&cookMode=1&zoneProbe=1&power=0"');
    assert.equal(runtime.getStatus(t0 + SILENCE_THRESHOLD_MS + 1).power_failsafe, true);
  });

  it("does not let COOL/OFF reset undo a fail-safe power hold", () => {
    const runtime = new GrillRuntime("");
    const t0 = 26_000_000;
    runtime.handleGrillPost({ GrillId: "TEST1", Temp: "350", Power: "ON" }, t0);
    runtime.tickWatchdog(t0 + SILENCE_THRESHOLD_MS);
    const cool = runtime.handleGrillPost(
      { GrillId: "TEST1", Temp: "200", Power: "COOL" },
      t0 + SILENCE_THRESHOLD_MS + 5_000,
    );
    assert.match(cool, /power=0/);
    assert.equal(runtime.getStatus(t0 + SILENCE_THRESHOLD_MS + 5_000).command.power, 0);
  });
});
