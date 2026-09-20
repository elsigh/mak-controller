import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampSetpoint,
  computeCooldown,
  computeOnline,
  containsDangerToken,
  encodeGrillResponse,
  isSustainedSilence,
  isValidSetpoint,
  shouldAdoptPitSetpoint,
  shouldHoldPowerOffAfterGap,
  shouldResetCommandedPower,
  shouldWatchSilence,
  unknownGrillPostKeys,
  DEFAULT_COMMAND,
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
  it("watches silence for ON/COOL or an active session, not a cold OFF grill", () => {
    assert.equal(
      shouldWatchSilence({ lastSeenEpoch: 1, lastReportedPower: "ON", sessionActive: false }),
      true,
    );
    assert.equal(
      shouldWatchSilence({ lastSeenEpoch: 1, lastReportedPower: "COOL", sessionActive: false }),
      true,
    );
    assert.equal(
      shouldWatchSilence({ lastSeenEpoch: 1, lastReportedPower: "OFF", sessionActive: true }),
      true,
    );
    assert.equal(
      shouldWatchSilence({ lastSeenEpoch: 1, lastReportedPower: "OFF", sessionActive: false }),
      false,
    );
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
