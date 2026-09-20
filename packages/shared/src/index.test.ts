import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampSetpoint,
  computeCooldown,
  computeOnline,
  encodeGrillResponse,
  isValidSetpoint,
  shouldResetCommandedPower,
  DEFAULT_COMMAND,
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
  });
});
