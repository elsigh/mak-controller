import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCalendarDays,
  clampSetpoint,
  computeCooldown,
  computeOnline,
  containsDangerToken,
  downsampleByTime,
  encodeGrillResponse,
  formatHistoryDayLabel,
  formatLocalStamp,
  isSustainedSilence,
  isValidHistoryDay,
  isValidSetpoint,
  localCalendarDay,
  shouldAdoptPitSetpoint,
  shouldHoldPowerOffAfterGap,
  shouldResetCommandedPower,
  shouldWatchSilence,
  unknownGrillPostKeys,
  DEFAULT_COMMAND,
  HISTORY_TIMEZONE,
  SILENCE_THRESHOLD_MS,
} from "./index.ts";

describe("setpoint", () => {
  it("clamps and snaps to 5°F steps", () => {
    assert.equal(clampSetpoint(223), 225);
    assert.equal(clampSetpoint(149), 150);
    assert.equal(clampSetpoint(501), 500);
    assert.equal(clampSetpoint(Number.NaN), DEFAULT_COMMAND.setPoint);
  });

  it("validates integer step-5 values", () => {
    assert.equal(isValidSetpoint(225), true);
    assert.equal(isValidSetpoint(223), false);
    assert.equal(isValidSetpoint(100), false);
  });
});

describe("protocol response", () => {
  it("wraps the query string in literal double quotes", () => {
    assert.equal(
      encodeGrillResponse({ ...DEFAULT_COMMAND, setPoint: 225, power: 1 }),
      '"setPoint=225&potStatus=&cookMode=1&zoneProbe=1&power=1"',
    );
  });
});

describe("online and cooldown heuristics", () => {
  it("treats a poll within 15s as online", () => {
    const now = 1_000_000;
    assert.equal(computeOnline(now - 14_000, now), true);
    assert.equal(computeOnline(now - 16_000, now), false);
    assert.equal(computeOnline(0, now), false);
  });

  it("adopts pit setpoint only on reconnect when nothing else owns it", () => {
    assert.equal(
      shouldAdoptPitSetpoint({
        wasOnline: false,
        automationActive: false,
        pendingExplicitSetpoint: false,
        pitTemp: 365,
      }),
      true,
    );
    assert.equal(
      shouldAdoptPitSetpoint({
        wasOnline: true,
        automationActive: false,
        pendingExplicitSetpoint: false,
        pitTemp: 365,
      }),
      false,
    );
    assert.equal(
      shouldAdoptPitSetpoint({
        wasOnline: false,
        automationActive: true,
        pendingExplicitSetpoint: false,
        pitTemp: 365,
      }),
      false,
    );
    assert.equal(
      shouldAdoptPitSetpoint({
        wasOnline: false,
        automationActive: false,
        pendingExplicitSetpoint: true,
        pitTemp: 365,
      }),
      false,
    );
    assert.equal(
      shouldAdoptPitSetpoint({
        wasOnline: false,
        automationActive: false,
        pendingExplicitSetpoint: false,
        pitTemp: null,
      }),
      false,
    );
  });

  it("locks out during COOL/CD and commanded shutdown", () => {
    assert.equal(computeCooldown(true, "COOL", 1), true);
    assert.equal(computeCooldown(true, "CD", 1), true);
    assert.equal(computeCooldown(true, "ON", 0), true);
    assert.equal(computeCooldown(true, "OFF", 0), false);
    assert.equal(computeCooldown(false, "COOL", 1), false);
  });

  it("resets commanded power after the grill acknowledges shutdown", () => {
    assert.equal(shouldResetCommandedPower(0, "COOL"), true);
    assert.equal(shouldResetCommandedPower(0, "CD"), true);
    assert.equal(shouldResetCommandedPower(0, "OFF"), true);
    assert.equal(shouldResetCommandedPower(0, "ON"), false);
    assert.equal(shouldResetCommandedPower(1, "OFF"), false);
    assert.equal(shouldResetCommandedPower(0, "OFF", true), false);
  });
});

describe("silence and danger fail-safes", () => {
  it("watches silence only when last Power was ON, not cooldown or OFF", () => {
    assert.equal(
      shouldWatchSilence({ lastSeenEpoch: 1, lastReportedPower: "ON", sessionActive: false }),
      true,
    );
    assert.equal(
      shouldWatchSilence({ lastSeenEpoch: 1, lastReportedPower: "on", sessionActive: false }),
      true,
    );
    for (const power of ["COOL", "COOLDOWN", "cooldown", "CD", "OFF"]) {
      assert.equal(
        shouldWatchSilence({ lastSeenEpoch: 1, lastReportedPower: power, sessionActive: true }),
        false,
        `should skip silence watch for Power=${power}`,
      );
    }
    assert.equal(
      shouldWatchSilence({ lastSeenEpoch: 0, lastReportedPower: "ON", sessionActive: true }),
      false,
    );
  });

  it("treats 30s without a POST as sustained silence", () => {
    const last = 1_000_000;
    assert.equal(isSustainedSilence(last, last + SILENCE_THRESHOLD_MS - 1), false);
    assert.equal(isSustainedSilence(last, last + SILENCE_THRESHOLD_MS), true);
    assert.equal(isSustainedSilence(0, last + SILENCE_THRESHOLD_MS), false);
  });

  it("holds power off after a long gap when the grill reports OFF", () => {
    assert.equal(
      shouldHoldPowerOffAfterGap({
        offlineGapMs: SILENCE_THRESHOLD_MS,
        reportedPower: "OFF",
        pendingExplicitPowerOn: false,
      }),
      true,
    );
    assert.equal(
      shouldHoldPowerOffAfterGap({
        offlineGapMs: SILENCE_THRESHOLD_MS - 1,
        reportedPower: "OFF",
        pendingExplicitPowerOn: false,
      }),
      false,
    );
    assert.equal(
      shouldHoldPowerOffAfterGap({
        offlineGapMs: SILENCE_THRESHOLD_MS,
        reportedPower: "ON",
        pendingExplicitPowerOn: false,
      }),
      false,
    );
    assert.equal(
      shouldHoldPowerOffAfterGap({
        offlineGapMs: SILENCE_THRESHOLD_MS,
        reportedPower: "OFF",
        pendingExplicitPowerOn: true,
      }),
      false,
    );
  });

  it("detects danger tokens in flags or power, case-insensitive", () => {
    assert.equal(containsDangerToken("FIRE"), true);
    assert.equal(containsDangerToken("flameout"), true);
    assert.equal(containsDangerToken("FLAME OUT"), true);
    assert.equal(containsDangerToken("timeout"), true);
    assert.equal(containsDangerToken("TIME OUT"), true);
    assert.equal(containsDangerToken("ATSET"), false);
    assert.equal(containsDangerToken("ON"), false);
    assert.equal(containsDangerToken("0"), false);
  });

  it("returns unknown POST keys once", () => {
    assert.deepEqual(unknownGrillPostKeys({ GrillId: "1", Temp: "200", RSSI: "-40" }), ["RSSI"]);
    assert.deepEqual(unknownGrillPostKeys({ GrillId: "1", RSSI: "-40" }, ["RSSI"]), []);
  });
});

describe("day history helpers", () => {
  it("validates calendar days", () => {
    assert.equal(isValidHistoryDay("2026-09-20"), true);
    assert.equal(isValidHistoryDay("2026-02-29"), false);
    assert.equal(isValidHistoryDay("2024-02-29"), true);
    assert.equal(isValidHistoryDay("09-20-2026"), false);
  });

  it("formats Studio-local stamps in America/Los_Angeles", () => {
    const pdt = formatLocalStamp(new Date("2026-09-21T06:30:00.000Z"), HISTORY_TIMEZONE);
    assert.equal(pdt, "2026-09-20 23:30:00");
    assert.equal(localCalendarDay(new Date("2026-09-21T06:30:00.000Z")), "2026-09-20");
    assert.equal(addCalendarDays("2026-09-20", 1), "2026-09-21");
  });

  it("labels today and yesterday relative to the box timezone", () => {
    const now = new Date("2026-09-21T06:30:00.000Z");
    assert.equal(formatHistoryDayLabel("2026-09-20", now), "Today");
    assert.equal(formatHistoryDayLabel("2026-09-19", now), "Yesterday");
    assert.match(formatHistoryDayLabel("2026-09-18", now), /Sep 18/);
  });

  it("downsamples to the first point in each bucket plus the last sample", () => {
    const rows = [0, 4, 8, 12, 16, 20, 24].map((second) => ({
      timestamp: `2026-09-20 10:00:${String(second).padStart(2, "0")}`,
    }));
    assert.deepEqual(
      downsampleByTime(rows, 20).map((row) => row.timestamp),
      ["2026-09-20 10:00:00", "2026-09-20 10:00:20", "2026-09-20 10:00:24"],
    );
  });
});
