import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

const dataDir = mkdtempSync(join(tmpdir(), "makgrill-runtime-"));
process.env.DB_PATH = join(dataDir, "cooks.db");
process.env.BRIDGE_PORT = "0";

const {
  NEW_COOK_GAP_MS,
  ONLINE_WINDOW_MS,
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

  it("sends no command before a setpoint is set, and records telemetry", () => {
    const runtime = new GrillRuntime("");
    const body = runtime.handleGrillPost({
      GrillId: "TEST1",
      Temp: "200",
      Power: "ON",
      Probe1: "90",
      GrillFlags: "0",
    });
    assert.equal(body, null, "hold: no command (route answers 503)");
    const status = runtime.getStatus();
    assert.equal(status.is_online, true);
    assert.equal(status.state.temp, "200");
    assert.equal(status.command.setPoint, null);
    assert.equal(status.uncommanded_reply, "hold");
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
    const runtime = new GrillRuntime("", { uncommandedReply: "omit" });
    runtime.handleGrillPost({ GrillId: "TEST1", Temp: "250", Power: "ON" });
    runtime.setPower(0);
    assert.equal(runtime.getStatus().is_cooldown, true);
    const denied = runtime.setPower(1);
    assert.equal(denied.ok, false);
    const body = runtime.handleGrillPost({ GrillId: "TEST1", Temp: "180", Power: "COOL" });
    assert.match(body ?? "", /power=1/);
    assert.equal(runtime.getStatus().command.power, 1);
  });

  it("never changes the commanded setpoint on reconnect or first poll (no pit adoption)", () => {
    // First poll after a bridge start: no setpoint at all, not the pit temp and not 175.
    const fresh = new GrillRuntime("");
    assert.equal(fresh.handleGrillPost({ GrillId: "TEST1", Temp: "198", Power: "ON" }, 900_000), null);
    assert.equal(fresh.getStatus(900_000).command.setPoint, null);

    const runtime = new GrillRuntime("", { notify: () => {} });
    const t0 = 1_000_000;
    runtime.setSetpoint(150, t0 - 1);
    assert.equal(
      runtime.handleGrillPost({ GrillId: "TEST1", Temp: "170", Power: "ON" }, t0),
      '"setPoint=150&potStatus=&cookMode=1&zoneProbe=1&power=1"',
    );
    // Short gap, silence-alert gap, 3 min Wi-Fi drop, just under a new cook:
    // setpoint stays 150 whatever the pit reads.
    let t = t0;
    for (const gap of [
      ONLINE_WINDOW_MS + 1,
      SILENCE_THRESHOLD_MS + 1_000,
      3 * 60 * 1000,
      NEW_COOK_GAP_MS - 1,
    ]) {
      t += gap;
      runtime.tickWatchdog(t);
      assert.equal(
        runtime.handleGrillPost({ GrillId: "TEST1", Temp: "367", Power: "ON" }, t),
        '"setPoint=150&potStatus=&cookMode=1&zoneProbe=1&power=1"',
        `gap ${gap}ms`,
      );
      assert.equal(runtime.getStatus(t).command.setPoint, 150);
    }
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
    // An explicit user power-off is always delivered, even with no app setpoint
    // (175 is only the wire placeholder for a grill that is shutting down).
    assert.equal(reconnect, '"setPoint=175&potStatus=&cookMode=1&zoneProbe=1&power=0"');
  });
});

describe("Web Ctrl handoff: never overwrite the panel setpoint", () => {
  before(() => {
    initDb("");
  });

  it("replays 2026-10-11: panel 325, Web Ctrl on after a bridge restart → no setpoint pushed", () => {
    const runtime = new GrillRuntime("", { notify: () => {} });
    const t0 = 40_000_000;
    for (let t = t0; t <= t0 + 60_000; t += 4_000) {
      assert.equal(runtime.handleGrillPost({ GrillId: "TEST1", Temp: "290", Power: "ON" }, t), null);
    }
    assert.equal(runtime.getStatus(t0 + 60_000).command.setPoint, null);
    // She sets 325 in the app: from the next poll on, the bridge owns it.
    runtime.setSetpoint(325, t0 + 61_000);
    assert.equal(
      runtime.handleGrillPost({ GrillId: "TEST1", Temp: "300", Power: "ON" }, t0 + 64_000),
      '"setPoint=325&potStatus=&cookMode=1&zoneProbe=1&power=1"',
    );
  });

  it("does not resurrect the previous cook's setpoint when Web Ctrl turns on for a new cook", () => {
    // Previous cook: app setpoint 350, user cooldown, grill reports COOLDOWN then goes quiet.
    const cases: Array<{ name: string; tail: string; gap: number; next: string }> = [
      { name: "after cooldown, Web Ctrl on mid-cook", tail: "COOLDOWN", gap: 2 * 60 * 60 * 1000, next: "ON" },
      { name: "after OFF, quick relight", tail: "OFF", gap: 5 * 60 * 1000, next: "ON" },
      { name: "cooldown → START without a gap", tail: "COOLDOWN", gap: 4_000, next: "START" },
      { name: "ON → long silence → ON (next day)", tail: "ON", gap: NEW_COOK_GAP_MS, next: "ON" },
      { name: "ON → START (fresh ignition seen)", tail: "ON", gap: 10 * 60 * 1000, next: "START" },
    ];
    for (const c of cases) {
      const runtime = new GrillRuntime("", { notify: () => {} });
      const t0 = 41_000_000;
      runtime.setSetpoint(350, t0 - 1);
      runtime.handleGrillPost({ GrillId: "TEST1", Temp: "350", Power: "ON" }, t0);
      runtime.handleGrillPost({ GrillId: "TEST1", Temp: "300", Power: c.tail }, t0 + 4_000);
      const body = runtime.handleGrillPost({ GrillId: "TEST1", Temp: "320", Power: c.next }, t0 + 4_000 + c.gap);
      assert.equal(body, null, c.name);
      assert.equal(runtime.getStatus(t0 + 4_000 + c.gap).command.setPoint, null, c.name);
    }
  });

  it("keeps the app setpoint through routine Wi-Fi drops and START → ON", () => {
    const runtime = new GrillRuntime("", { notify: () => {} });
    const t0 = 42_000_000;
    runtime.handleGrillPost({ GrillId: "TEST1", Temp: "120", Power: "START" }, t0);
    runtime.setSetpoint(250, t0 + 1_000);
    const sp = '"setPoint=250&potStatus=&cookMode=1&zoneProbe=1&power=1"';
    assert.equal(runtime.handleGrillPost({ GrillId: "TEST1", Temp: "150", Power: "START" }, t0 + 4_000), sp);
    assert.equal(runtime.handleGrillPost({ GrillId: "TEST1", Temp: "200", Power: "ON" }, t0 + 60_000), sp);
    let t = t0 + 60_000;
    for (const gap of [31_000, 3 * 60 * 1000, 12 * 60 * 1000]) {
      t += gap;
      runtime.tickWatchdog(t);
      assert.equal(runtime.handleGrillPost({ GrillId: "TEST1", Temp: "245", Power: "ON" }, t), sp, `gap ${gap}`);
    }
  });

  it("keeps a setpoint chosen while the grill was away for the new cook", () => {
    const runtime = new GrillRuntime("", { notify: () => {} });
    const t0 = 43_000_000;
    runtime.setSetpoint(350, t0 - 1);
    runtime.handleGrillPost({ GrillId: "TEST1", Temp: "200", Power: "COOLDOWN" }, t0);
    // Next morning she picks 225 in the app before lighting the grill.
    runtime.setSetpoint(225, t0 + 8 * 60 * 60 * 1000);
    assert.equal(
      runtime.handleGrillPost({ GrillId: "TEST1", Temp: "70", Power: "START" }, t0 + 9 * 60 * 60 * 1000),
      '"setPoint=225&potStatus=&cookMode=1&zoneProbe=1&power=1"',
    );
  });

  it("first poll after a bridge restart with a pending API setpoint commands it", () => {
    const runtime = new GrillRuntime("", { notify: () => {} });
    runtime.setSetpoint(275, 1);
    assert.equal(
      runtime.handleGrillPost({ GrillId: "TEST1", Temp: "260", Power: "ON" }, 44_000_000),
      '"setPoint=275&potStatus=&cookMode=1&zoneProbe=1&power=1"',
    );
  });

  it("stops a recipe from the previous cook instead of pushing its stage temps", () => {
    const runtime = new GrillRuntime("", { notify: () => {} });
    const t0 = 45_000_000;
    runtime.startAutomation(
      "Hold",
      [{ name: "Hold", setpoint: 225, trigger_type: "hold", trigger_cond: "gte", trigger_val: 0 }],
      t0 - 1,
    );
    assert.match(runtime.handleGrillPost({ GrillId: "TEST1", Temp: "225", Power: "ON" }, t0) ?? "", /setPoint=225/);
    runtime.handleGrillPost({ GrillId: "TEST1", Temp: "150", Power: "OFF" }, t0 + 4_000);
    assert.equal(runtime.handleGrillPost({ GrillId: "TEST1", Temp: "100", Power: "START" }, t0 + 3_600_000), null);
    assert.equal(runtime.getStatus(t0 + 3_600_000).automation.active, false);
  });

  it("omit and legacy reply modes", () => {
    const omit = new GrillRuntime("", { notify: () => {}, uncommandedReply: "omit" });
    assert.equal(
      omit.handleGrillPost({ GrillId: "TEST1", Temp: "300", Power: "ON" }, 46_000_000),
      '"potStatus=&cookMode=1&zoneProbe=1&power=1"',
    );
    const legacy = new GrillRuntime("", { notify: () => {}, uncommandedReply: "legacy" });
    assert.equal(
      legacy.handleGrillPost({ GrillId: "TEST1", Temp: "300", Power: "ON" }, 46_000_000),
      '"setPoint=175&potStatus=&cookMode=1&zoneProbe=1&power=1"',
    );
    assert.equal(legacy.getStatus(46_000_000).command.setPoint, null);
  });

  it("never answers power=0 on its own in any reply mode, even across new cooks", () => {
    for (const mode of ["hold", "omit", "legacy"] as const) {
      const runtime = new GrillRuntime("", { notify: () => {}, uncommandedReply: mode });
      let t = 47_000_000;
      for (const power of ["START", "ON", "COOLDOWN", "OFF", "START", "ON"]) {
        t += 4_000;
        const body = runtime.handleGrillPost({ GrillId: "TEST1", Temp: "300", Power: power }, t);
        assert.ok(body === null || /power=1"$/.test(body), `${mode} ${power}: ${body}`);
        t += NEW_COOK_GAP_MS;
        runtime.tickWatchdog(t);
      }
    }
  });
});

// Power-invariant suite: replies use UNCOMMANDED_REPLY=omit so the power field
// is visible even before a setpoint is set (hold would answer 503 / no command).
describe("GrillRuntime never auto-answers power=0", () => {
  before(() => {
    initDb("");
  });

  it("silence while ON sends one urgent ntfy and NEVER changes commanded power", () => {
    const alerts: Array<{ title: string; priority?: string }> = [];
    const runtime = new GrillRuntime("", {
      uncommandedReply: "omit",
      notify: (title, _message, priority) => alerts.push({ title, priority }),
    });
    const t0 = 20_000_000;
    runtime.handleGrillPost({ GrillId: "TEST1", Temp: "350", Power: "ON" }, t0);
    runtime.tickWatchdog(t0 + SILENCE_THRESHOLD_MS - 1);
    assert.equal(alerts.length, 0);

    runtime.tickWatchdog(t0 + SILENCE_THRESHOLD_MS);
    const status = runtime.getStatus(t0 + SILENCE_THRESHOLD_MS);
    assert.equal(status.command.power, 1);
    assert.equal(status.silence_alerted, true);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0]?.title, "MakGrill: grill not reporting");
    assert.equal(alerts[0]?.priority, "urgent");

    // Hours of silence: still one alert, still power=1.
    for (let t = t0 + SILENCE_THRESHOLD_MS + 5_000; t <= t0 + 3 * 60 * 60 * 1000; t += 5_000) {
      runtime.tickWatchdog(t);
    }
    assert.equal(alerts.length, 1);
    assert.equal(runtime.getStatus(t0 + 3 * 60 * 60 * 1000).command.power, 1);
  });

  it("replays the 2026-10-10 incident: a 31s Wi-Fi gap keeps the cook running", () => {
    const alerts: Array<{ title: string; priority?: string }> = [];
    const runtime = new GrillRuntime("", {
      uncommandedReply: "omit",
      notify: (title, _message, priority) => alerts.push({ title, priority }),
    });
    const t0 = 30_000_000;
    runtime.setSetpoint(175);
    // Healthy 4s polls, then the grill goes quiet for 31s (09:40:44 → 09:41:15 PT).
    for (let t = t0; t <= t0 + 60_000; t += 4_000) {
      runtime.handleGrillPost({ GrillId: "TEST1", Temp: "175", Power: "ON" }, t);
    }
    const lastPost = t0 + 60_000;
    for (let t = lastPost + 5_000; t < lastPost + 31_000; t += 5_000) runtime.tickWatchdog(t);
    runtime.tickWatchdog(lastPost + 30_500);
    assert.equal(alerts.length, 1, "one urgent silence alert");
    assert.equal(alerts[0]?.priority, "urgent");

    const reconnect = runtime.handleGrillPost(
      { GrillId: "TEST1", Temp: "170", Power: "ON" },
      lastPost + 31_000,
    );
    assert.match(reconnect ?? "", /power=1"$/);
    assert.equal(alerts.length, 2);
    assert.equal(alerts[1]?.title, "MakGrill: grill back online");
    assert.equal(alerts[1]?.priority, "default");
    const status = runtime.getStatus(lastPost + 31_000);
    assert.equal(status.command.power, 1);
    assert.equal(status.silence_alerted, false);

    const next = runtime.handleGrillPost({ GrillId: "TEST1", Temp: "170", Power: "ON" }, lastPost + 35_000);
    assert.match(next ?? "", /power=1"$/);

    // A second silence episode alerts again.
    runtime.tickWatchdog(lastPost + 35_000 + SILENCE_THRESHOLD_MS);
    assert.equal(alerts.length, 3);
    assert.equal(alerts[2]?.title, "MakGrill: grill not reporting");
  });

  it("does not silence-alert or force power when last Power was cooldown/cool/cd/off", () => {
    for (const power of ["COOLDOWN", "cooldown", "COOL", "CD", "OFF"]) {
      const alerts: string[] = [];
      const runtime = new GrillRuntime("", {
      uncommandedReply: "omit",
        notify: (title) => alerts.push(title),
      });
      const t0 = 27_000_000;
      runtime.handleGrillPost({ GrillId: "TEST1", Temp: "250", Power: "ON" }, t0);
      runtime.handleGrillPost({ GrillId: "TEST1", Temp: "180", Power: power }, t0 + 5_000);
      runtime.tickWatchdog(t0 + 5_000 + SILENCE_THRESHOLD_MS);
      const status = runtime.getStatus(t0 + 5_000 + SILENCE_THRESHOLD_MS);
      assert.equal(alerts.length, 0, `unexpected silence ntfy for Power=${power}`);
      assert.equal(status.silence_alerted, false);
    }
  });

  it("does not silence-alert after user-initiated cooldown when last Power is cooldown", () => {
    const alerts: string[] = [];
    const runtime = new GrillRuntime("", {
      uncommandedReply: "omit",
      notify: (title) => alerts.push(title),
    });
    const t0 = 29_000_000;
    runtime.handleGrillPost({ GrillId: "TEST1", Temp: "350", Power: "ON" }, t0);
    runtime.setPower(0);
    const cool = runtime.handleGrillPost(
      { GrillId: "TEST1", Temp: "180", Power: "cooldown" },
      t0 + 5_000,
    );
    assert.match(cool ?? "", /power=1/);
    runtime.tickWatchdog(t0 + 5_000 + SILENCE_THRESHOLD_MS);
    runtime.tickWatchdog(t0 + 5_000 + SILENCE_THRESHOLD_MS + 180_000);
    assert.equal(alerts.length, 0);
    const status = runtime.getStatus(t0 + 5_000 + SILENCE_THRESHOLD_MS + 180_000);
    assert.equal(status.silence_alerted, false);
  });

  it("does not silence-alert when the user already commanded power=0", () => {
    const alerts: string[] = [];
    const runtime = new GrillRuntime("", {
      uncommandedReply: "omit",
      notify: (title) => alerts.push(title),
    });
    const t0 = 28_000_000;
    runtime.handleGrillPost({ GrillId: "TEST1", Temp: "350", Power: "ON" }, t0);
    runtime.setPower(0);
    runtime.tickWatchdog(t0 + SILENCE_THRESHOLD_MS);
    assert.equal(alerts.length, 0);
    runtime.tickWatchdog(t0 + SILENCE_THRESHOLD_MS + 180_000);
    assert.equal(alerts.length, 0);
    assert.equal(runtime.getStatus(t0 + SILENCE_THRESHOLD_MS + 180_000).command.power, 0);
  });

  it("does not alert or change power when pit stays 35°F+ under setpoint", () => {
    const softWindowMs = 8 * 60 * 1000;
    const alerts: Array<{ title: string; body: string; priority?: string }> = [];
    const runtime = new GrillRuntime("", {
      uncommandedReply: "omit",
      notify: (title, body, priority) => alerts.push({ title, body, priority }),
    });
    const t0 = 21_000_000;
    runtime.setSetpoint(250);
    for (let t = t0; t <= t0 + softWindowMs + 60_000; t += 10_000) {
      const body = runtime.handleGrillPost({ GrillId: "TEST1", Temp: "200", Power: "ON" }, t);
      assert.match(body ?? "", /power=1/);
      const status = runtime.getStatus(t);
      assert.equal(status.command.power, 1);
      assert.equal("flameout_alert" in status, false);
    }
    assert.equal(alerts.length, 0);
  });

  it("answers power=1 to an OFF grill after a long gap or on the first poll after a restart", () => {
    // First poll ever (bridge restart) with the grill OFF / COOLDOWN: no hold.
    for (const power of ["OFF", "COOLDOWN", "COOL", "CD"]) {
      const runtime = new GrillRuntime("", { notify: () => {}, uncommandedReply: "omit" });
      const body = runtime.handleGrillPost({ GrillId: "TEST1", Temp: "80", Power: power }, 22_000_000);
      assert.match(body ?? "", /power=1"$/, `first poll Power=${power}`);
      assert.equal(runtime.getStatus(22_000_000).command.power, 1);
    }

    // Long gap, grill comes back OFF: still power=1.
    const t0 = 22_500_000;
    for (const gap of [SILENCE_THRESHOLD_MS, 5 * 60 * 1000, 3 * 60 * 60 * 1000]) {
      const fresh = new GrillRuntime("", { notify: () => {}, uncommandedReply: "omit" });
      fresh.handleGrillPost({ GrillId: "TEST1", Temp: "350", Power: "ON" }, t0);
      fresh.tickWatchdog(t0 + gap);
      for (const power of ["OFF", "COOLDOWN"]) {
        const body = fresh.handleGrillPost({ GrillId: "TEST1", Temp: "120", Power: power }, t0 + gap);
        assert.match(body ?? "", /power=1"$/, `gap ${gap}ms Power=${power}`);
      }
    }
  });

  it("danger tokens send one urgent ntfy per episode and never change commanded power", () => {
    for (const form of [
      { Power: "ON", GrillFlags: "FIRE" },
      { Power: "ON", GrillFlags: "flameout" },
      { Power: "FLAME OUT", GrillFlags: "0" },
      { Power: "ON", GrillFlags: "TIMEOUT" },
      { Power: "TIME OUT", GrillFlags: "" },
    ]) {
      const alerts: Array<{ title: string; body: string; priority?: string }> = [];
      const runtime = new GrillRuntime("", {
      uncommandedReply: "omit",
        notify: (title, body, priority) => alerts.push({ title, body, priority }),
      });
      const t0 = 23_000_000;
      for (let i = 0; i < 5; i += 1) {
        const body = runtime.handleGrillPost({ GrillId: "TEST1", Temp: "350", ...form }, t0 + i * 4_000);
        assert.match(body ?? "", /power=1"$/, `danger ${JSON.stringify(form)}`);
        assert.equal(runtime.getStatus(t0 + i * 4_000).command.power, 1);
      }
      assert.equal(alerts.length, 1, "one alert per danger episode");
      assert.equal(alerts[0]?.title, "MakGrill: danger flag");
      assert.equal(alerts[0]?.priority, "urgent");
      assert.match(alerts[0]?.body ?? "", /did NOT change power/);

      // Episode clears, then recurs → a second alert, still power=1.
      runtime.handleGrillPost({ GrillId: "TEST1", Temp: "350", Power: "ON", GrillFlags: "0" }, t0 + 30_000);
      const again = runtime.handleGrillPost({ GrillId: "TEST1", Temp: "350", ...form }, t0 + 34_000);
      assert.match(again ?? "", /power=1"$/);
      assert.equal(alerts.length, 2);
    }
  });

  it("a danger flag followed by the grill's own COOL/OFF still answers power=1", () => {
    const runtime = new GrillRuntime("", { notify: () => {}, uncommandedReply: "omit" });
    const t0 = 26_000_000;
    runtime.handleGrillPost({ GrillId: "TEST1", Temp: "350", Power: "ON", GrillFlags: "FLAMEOUT" }, t0);
    assert.match(runtime.handleGrillPost({ GrillId: "TEST1", Temp: "200", Power: "COOL" }, t0 + 5_000) ?? "", /power=1"$/);
    assert.match(runtime.handleGrillPost({ GrillId: "TEST1", Temp: "90", Power: "OFF" }, t0 + 60_000) ?? "", /power=1"$/);
  });

  it("does not false-trip during continuous healthy polls", () => {
    const alerts: string[] = [];
    const runtime = new GrillRuntime("", {
      uncommandedReply: "omit",
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
      assert.equal("flameout_alert" in status, false);
    }
    assert.equal(alerts.length, 0);
  });

  it("keeps the commanded setpoint and answers power=1 on reconnect after silence", () => {
    const runtime = new GrillRuntime("", { notify: () => {}, uncommandedReply: "omit" });
    const t0 = 25_000_000;
    runtime.setSetpoint(350);
    runtime.handleGrillPost({ GrillId: "TEST1", Temp: "350", Power: "ON" }, t0);
    runtime.tickWatchdog(t0 + SILENCE_THRESHOLD_MS);
    const reconnect = runtime.handleGrillPost(
      { GrillId: "TEST1", Temp: "365", Power: "ON" },
      t0 + SILENCE_THRESHOLD_MS + 1,
    );
    assert.equal(reconnect, '"setPoint=350&potStatus=&cookMode=1&zoneProbe=1&power=1"');
  });

  it("only an explicit setPower(0) produces power=0, and the grill's cooldown ack resets it to 1", () => {
    const runtime = new GrillRuntime("", { notify: () => {}, uncommandedReply: "omit" });
    const t0 = 33_000_000;
    runtime.handleGrillPost({ GrillId: "TEST1", Temp: "350", Power: "ON" }, t0);
    assert.equal(runtime.setPower(0).ok, true);
    assert.match(runtime.handleGrillPost({ GrillId: "TEST1", Temp: "350", Power: "ON" }, t0 + 4_000) ?? "", /power=0"$/);
    // Grill acknowledges the user cooldown → back to power=1 (upstream behavior).
    assert.match(runtime.handleGrillPost({ GrillId: "TEST1", Temp: "300", Power: "COOLDOWN" }, t0 + 8_000) ?? "",
      /power=1"$/,
    );
    assert.equal(runtime.getStatus(t0 + 8_000).command.power, 1);
  });
});
