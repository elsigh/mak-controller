import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

const dataDir = mkdtempSync(join(tmpdir(), "makgrill-db-"));
process.env.DB_PATH = join(dataDir, "cooks.db");

const { FALLBACK_GRILL_NAME, VOLATILE_RETENTION_DAYS } = await import("@makgrill/shared");
const {
  bindProvisionalGrillName,
  exportDayRows,
  getGrillNameOverride,
  getGrillNames,
  getHistory,
  getHistoryByDay,
  getSetting,
  initDb,
  insertTelemetry,
  listHistoryDays,
  pruneDatabase,
  resolveStoredGrillDisplayName,
  setGrillDisplayName,
} = await import("./db.ts");

function sample(timestamp: string, extras: { sessionId?: number | null; grillTemp?: number } = {}) {
  insertTelemetry({
    sessionId: extras.sessionId ?? null,
    timestamp,
    grillTemp: extras.grillTemp ?? 225,
    setpoint: 225,
    probe1: 160,
    probe2: null,
    probe3: null,
    power: "ON",
    flags: "0",
  });
}

describe("day-grouped history", () => {
  before(() => {
    initDb("");
    sample("2026-09-18 08:00:00", { grillTemp: 180 });
    sample("2026-09-18 08:00:04", { grillTemp: 181 });
    sample("2026-09-19 21:15:00", { grillTemp: 250 });
    for (let i = 0; i < 7; i += 1) {
      const second = String(i * 4).padStart(2, "0");
      sample(`2026-09-20 10:00:${second}`, { grillTemp: 200 + i });
    }
  });

  after(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("lists distinct local calendar days that have telemetry", () => {
    const days = listHistoryDays();
    assert.deepEqual(
      days.map((row) => row.day),
      ["2026-09-20", "2026-09-19", "2026-09-18"],
    );
    assert.equal(days[0].samples, 7);
    assert.equal(days[1].samples, 1);
    assert.equal(days[2].samples, 2);
    assert.equal(days[0].first_timestamp, "2026-09-20 10:00:00");
    assert.equal(days[0].last_timestamp, "2026-09-20 10:00:24");
  });

  it("returns a day's full series without the 500-row buffer cap", () => {
    const history = getHistoryByDay("2026-09-20", 0);
    assert.equal(history.day, "2026-09-20");
    assert.equal(history.sample_count, 7);
    assert.equal(history.timestamps.length, 7);
    assert.deepEqual(history.grill_temp, [200, 201, 202, 203, 204, 205, 206]);
    assert.equal(history.downsample_seconds, null);
    assert.deepEqual(getHistoryByDay("2026-09-19", 0).grill_temp, [250]);
    assert.deepEqual(getHistoryByDay("2026-09-18", 0).grill_temp, [180, 181]);
  });

  it("downsamples chart queries to one point per 20s while keeping the last sample", () => {
    const history = getHistoryByDay("2026-09-20", 20);
    assert.equal(history.sample_count, 7);
    assert.equal(history.downsample_seconds, 20);
    assert.deepEqual(history.timestamps, ["10:00:00", "10:00:20", "10:00:24"]);
    assert.deepEqual(history.grill_temp, [200, 205, 206]);
  });

  it("exports the selected day at native resolution", () => {
    const rows = exportDayRows("2026-09-20");
    assert.equal(rows.length, 7);
    assert.equal(rows[0].timestamp, "2026-09-20 10:00:00");
    assert.equal(rows.at(-1)?.grill_temp, 206);
    assert.equal(exportDayRows("not-a-day").length, 0);
  });

  it("keeps the session-less LIMIT 500 buffer for unnamed history", () => {
    const history = getHistory(null);
    assert.ok(history.timestamps.length <= 500);
    assert.equal(history.sample_count, history.timestamps.length);
  });

  it("does not drop unnamed telemetry newer than 14 days when pruning 7", () => {
    const recent = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
    const stale = new Date(Date.now() - (VOLATILE_RETENTION_DAYS + 5) * 86_400_000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
    sample(recent, { grillTemp: 333 });
    sample(stale, { grillTemp: 111 });

    const before = listHistoryDays().reduce((sum, row) => sum + row.samples, 0);
    const result = pruneDatabase(7);
    const after = listHistoryDays().reduce((sum, row) => sum + row.samples, 0);

    assert.equal(result.pruned_volatile, 1);
    assert.equal(after, before - 1);
    assert.ok(listHistoryDays().some((row) => row.day === recent.slice(0, 10)));
    assert.equal(
      listHistoryDays().some((row) => row.day === stale.slice(0, 10)),
      false,
    );
  });

  it("stores a provisional grill name and binds it on first known id", () => {
    assert.equal(resolveStoredGrillDisplayName("Unknown"), FALLBACK_GRILL_NAME);
    setGrillDisplayName("Unknown", "  Studio MAK  ");
    assert.equal(getGrillNameOverride("Unknown"), "Studio MAK");
    assert.equal(resolveStoredGrillDisplayName("Unknown"), "Studio MAK");
    assert.deepEqual(getGrillNames(), {});

    bindProvisionalGrillName("GRILL-A");
    assert.equal(getGrillNames()["GRILL-A"], "Studio MAK");
    assert.equal(getSetting("grill_name_provisional"), "");
    assert.equal(resolveStoredGrillDisplayName("GRILL-A"), "Studio MAK");

    setGrillDisplayName("Unknown", "Should not overwrite");
    bindProvisionalGrillName("GRILL-A");
    assert.equal(getGrillNames()["GRILL-A"], "Studio MAK");
    assert.equal(getSetting("grill_name_provisional"), "");

    setGrillDisplayName("GRILL-A", "");
    assert.equal(getGrillNameOverride("GRILL-A"), "");
    assert.equal(resolveStoredGrillDisplayName("GRILL-A"), FALLBACK_GRILL_NAME);
  });
});
