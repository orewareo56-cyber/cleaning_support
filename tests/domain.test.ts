import assert from "node:assert/strict";
import test from "node:test";
import {
  actualStreakEndingAt,
  canUseRecovery,
  dateInTimezone,
  earnedBadgeIds,
  grantForNewRecord,
  isValidBackup,
  migrateBackup,
  longestProtectedStreak,
  protectedCurrentStreak,
  recoveryBalance,
  stopwatchElapsed,
} from "../app/lib/domain";
import { createInitialData } from "../app/lib/storage";
import type { AppData, CleanupRecord, StopwatchSession } from "../app/lib/types";

const NOW = "2026-08-13T03:00:00.000Z";
const GRANT_AT = "2026-08-07T03:00:00.000Z";

function record(localDate: string, index = 0, placeId = "place-default-1"): CleanupRecord {
  const recordedAt = `${localDate}T03:00:00.000Z`;
  return {
    id: `record-${localDate}-${index}`,
    localDate,
    recordedAt,
    placeId,
    placeNameSnapshot: `場所${placeId}`,
    activityId: "activity-default-1",
    activityNameSnapshot: "捨てた",
    memo: null,
    stopwatchSessionId: null,
    elapsedSecondsSnapshot: null,
    createdAt: recordedAt,
    updatedAt: recordedAt,
  };
}

function dataWithDates(dates: string[]): AppData {
  return { ...createInitialData(), records: dates.map((date, index) => record(date, index)) };
}

function stopwatch(overrides: Partial<StopwatchSession> = {}): StopwatchSession {
  return {
    id: "session-1",
    startedAt: "2026-08-13T00:00:00.000Z",
    pausedAt: null,
    totalPausedSeconds: 0,
    endedAt: null,
    elapsedSeconds: null,
    status: "running",
    cleanupRecordId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

test("Asia/Tokyoの日付境界は23:59と翌00:00を別日にする", () => {
  assert.equal(dateInTimezone(new Date("2026-08-13T14:59:59Z")), "2026-08-13");
  assert.equal(dateInTimezone(new Date("2026-08-13T15:00:00Z")), "2026-08-14");
});

test("同日複数記録は実連続日数を増やさない", () => {
  const records = [record("2026-08-12"), record("2026-08-13"), record("2026-08-13", 2)];
  assert.equal(actualStreakEndingAt(records, "2026-08-13"), 2);
});

test("今日が未記録なら昨日までのprotected streakを猶予表示する", () => {
  const data = dataWithDates(["2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12"]);
  assert.equal(protectedCurrentStreak(data, "2026-08-13"), 4);
  assert.equal(protectedCurrentStreak(data, "2026-08-14"), 0);
});

test("リカバリー日は表示上の連続と最長連続だけをつなぐ", () => {
  const data = dataWithDates(["2026-08-08", "2026-08-09", "2026-08-11", "2026-08-12"]);
  data.recoveryUses.push({ id: "use-1", targetDate: "2026-08-10", usedAt: NOW });
  assert.equal(protectedCurrentStreak(data, "2026-08-13"), 5);
  assert.equal(longestProtectedStreak(data), 5);
  assert.equal(actualStreakEndingAt(data.records, "2026-08-12"), 2);
});

test("7/14/21実連続日の到達時だけ各1件grantし、同日再判定しない", () => {
  const records: CleanupRecord[] = [];
  const grants: NonNullable<ReturnType<typeof grantForNewRecord>>[] = [];
  for (let day = 1; day <= 21; day += 1) {
    const localDate = `2026-08-${String(day).padStart(2, "0")}`;
    records.push(record(localDate, day));
    const grant = grantForNewRecord(records, grants, localDate, NOW);
    if (grant) grants.push(grant);
    assert.equal(grantForNewRecord(records, grants, localDate, NOW), null, `${localDate}の再判定`);
  }
  assert.deepEqual(grants.map((grant) => grant.sourceDate), ["2026-08-07", "2026-08-14", "2026-08-21"]);
  assert.equal(recoveryBalance({ ...createInitialData(), recoveryGrants: grants }), 3);
});

test("7日目の2件目・編集相当の再判定でgrantは重複しない", () => {
  const data = dataWithDates(Array.from({ length: 7 }, (_, index) => `2026-08-0${index + 1}`));
  const first = grantForNewRecord(data.records, [], "2026-08-07", NOW);
  assert.ok(first);
  data.records.push(record("2026-08-07", 99));
  assert.equal(grantForNewRecord(data.records, [first], "2026-08-07", NOW), null);
});

test("保護日を実7日としてgrant判定に混ぜない", () => {
  const data = dataWithDates(["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08"]);
  data.recoveryUses.push({ id: "use-1", targetDate: "2026-08-04", usedAt: NOW });
  assert.equal(protectedCurrentStreak(data, "2026-08-08"), 8);
  assert.equal(grantForNewRecord(data.records, [], "2026-08-08", NOW), null);
});

test("リカバリー残数は付与数-使用数で、負数にはしない", () => {
  const data = createInitialData();
  data.recoveryGrants.push({ id: "grant-1", sourceDate: "2026-08-07", type: "seven_actual_days", createdAt: NOW });
  data.recoveryUses.push({ id: "use-1", targetDate: "2026-08-08", usedAt: NOW });
  assert.equal(recoveryBalance(data), 0);
  data.recoveryUses.push({ id: "use-2", targetDate: "2026-08-09", usedAt: NOW });
  assert.equal(recoveryBalance(data), 0);
});

test("主要バッジは境界到達時に一度だけ候補になる", () => {
  const dates = Array.from({ length: 20 }, (_, index) => `2026-07-${String(index + 1).padStart(2, "0")}`);
  const data = dataWithDates(dates);
  data.records = data.records.map((item, index) => ({ ...item, placeId: `place-${index % 5}` }));
  const earned = earnedBadgeIds(data, "2026-07-20");
  for (const id of ["first_step", "two_days", "three_days", "five_days_total", "seven_days", "ten_days_total", "three_places", "five_places", "seven_records", "twenty_days_total"]) {
    assert.ok(earned.includes(id), `${id}を獲得候補に含む`);
  }
  data.badgeAwards.push({ badgeId: "first_step", awardedAt: NOW, sourceDate: "2026-07-01" });
  assert.ok(!earnedBadgeIds(data, "2026-07-20").includes("first_step"));
});

test("同日7件は件数バッジだけを進め、日数バッジを獲得しない", () => {
  const data = dataWithDates([]);
  data.records = Array.from({ length: 7 }, (_, index) => record("2026-08-13", index));
  const earned = earnedBadgeIds(data, "2026-08-13");
  assert.ok(earned.includes("seven_records"));
  assert.ok(!earned.includes("two_days"));
  assert.ok(!earned.includes("seven_days"));
});

test("comebackは7空白日後、recovery_returnは保護日の翌日の実記録で獲得", () => {
  const comeback = dataWithDates(["2026-08-01", "2026-08-09"]);
  assert.ok(earnedBadgeIds(comeback, "2026-08-09").includes("comeback"));
  const recovery = dataWithDates(["2026-08-09"]);
  recovery.recoveryUses.push({ id: "use-1", targetDate: "2026-08-08", usedAt: NOW });
  assert.ok(earnedBadgeIds(recovery, "2026-08-09").includes("recovery_return"));
});

test("ストップウォッチはrunning/paused/resumed相当で絶対時刻と停止秒から算出する", () => {
  assert.equal(stopwatchElapsed(stopwatch({ totalPausedSeconds: 3 }), Date.parse("2026-08-13T00:00:10Z")), 7);
  assert.equal(stopwatchElapsed(stopwatch({ status: "paused", pausedAt: "2026-08-13T00:00:08Z", totalPausedSeconds: 2 }), Date.parse("2026-08-13T01:00:00Z")), 6);
  assert.equal(stopwatchElapsed(stopwatch({ startedAt: "2026-08-12T23:59:50Z", totalPausedSeconds: 5 }), Date.parse("2026-08-13T00:00:10Z")), 15);
});

test("停止/記録/破棄状態は保存秒を固定し、不正・逆行時刻は0にする", () => {
  for (const status of ["stopped", "recorded", "discarded"] as const) {
    assert.equal(stopwatchElapsed(stopwatch({ status, endedAt: "2026-08-13T00:00:12Z", elapsedSeconds: 12 }), Date.parse("2026-08-14T00:00:00Z")), 12);
    assert.equal(stopwatchElapsed(stopwatch({ status, endedAt: "2026-08-13T00:00:12Z", elapsedSeconds: null }), Date.parse("2026-08-14T00:00:00Z")), 12);
  }
  assert.equal(stopwatchElapsed(stopwatch({ startedAt: "invalid" }), Date.now()), 0);
  assert.equal(stopwatchElapsed(stopwatch(), Date.parse("2026-08-12T00:00:00Z")), 0);
});

test("完全な初期データは有効なバックアップとして往復できる", () => {
  const restored: unknown = JSON.parse(JSON.stringify(createInitialData()));
  assert.equal(isValidBackup(restored), true);
});

test("バックアップ検証は壊れたネスト値・日付・状態・一意性違反を拒否する", () => {
  const valid = createInitialData();
  const cases: unknown[] = [
    { ...valid, records: [{ nonsense: true }] },
    { ...valid, records: [record("2026-02-30")] },
    { ...valid, recoveryGrants: [
      { id: "g1", sourceDate: "2026-08-07", type: "seven_actual_days", createdAt: NOW },
      { id: "g2", sourceDate: "2026-08-07", type: "seven_actual_days", createdAt: NOW },
    ] },
    { ...valid, badgeAwards: [{ badgeId: "unknown", awardedAt: NOW, sourceDate: null }] },
    { ...valid, stopwatchSessions: [stopwatch({ status: "paused", pausedAt: null })] },
    { ...valid, settings: { timezone: "", onboardingComplete: true, lastBackupAt: null } },
    { ...valid, settings: { timezone: "Not/AZone", onboardingComplete: true, lastBackupAt: null } },
  ];
  for (const candidate of cases) assert.equal(isValidBackup(candidate), false);
});

test("旧schema 0を移行し、記録・リカバリー・バッジ履歴を保つ", () => {
  const source = dataWithDates(Array.from({ length: 7 }, (_, index) => `2026-08-0${index + 1}`));
  source.recoveryGrants.push({ id: "grant-1", sourceDate: "2026-08-07", type: "seven_actual_days", createdAt: GRANT_AT });
  source.badgeAwards.push({ badgeId: "first_step", awardedAt: "2026-08-01T04:00:00.000Z", sourceDate: "2026-08-01" });
  const legacyRecords = source.records.map((item) => Object.fromEntries(
    Object.entries(item).filter(([key]) => !["stopwatchSessionId", "elapsedSecondsSnapshot"].includes(key)),
  ));
  const legacy = {
    ...source,
    schemaVersion: 0,
    records: legacyRecords,
    stopwatchSessions: undefined,
    settings: undefined,
  };
  const migrated = migrateBackup(JSON.parse(JSON.stringify(legacy)));
  assert.ok(migrated);
  assert.equal(migrated.schemaVersion, 1);
  assert.equal(migrated.records[0].stopwatchSessionId, null);
  assert.equal(migrated.stopwatchSessions.length, 0);
  assert.equal(migrated.recoveryGrants.length, 1);
  assert.equal(migrated.badgeAwards.length, 1);
  assert.ok(!earnedBadgeIds(migrated, "2026-08-01").includes("first_step"));
  assert.equal(isValidBackup(migrated), true);
});

test("未対応の将来schemaと壊れた旧schemaは移行しない", () => {
  assert.equal(migrateBackup({ ...createInitialData(), schemaVersion: 2 }), null);
  assert.equal(migrateBackup({ schemaVersion: 0, places: [] }), null);
});

test("バックアップ検証は参照切れと報酬履歴の意味的不整合を拒否する", () => {
  const valid = dataWithDates(Array.from({ length: 7 }, (_, index) => `2026-08-0${index + 1}`));
  valid.recoveryGrants.push({ id: "grant-1", sourceDate: "2026-08-07", type: "seven_actual_days", createdAt: GRANT_AT });
  assert.equal(isValidBackup(valid), true);

  const missingMaster = structuredClone(valid);
  missingMaster.records[0].placeId = "missing-place";
  assert.equal(isValidBackup(missingMaster), false);

  const missingSession = structuredClone(valid);
  missingSession.records[0].stopwatchSessionId = "missing-session";
  missingSession.records[0].elapsedSecondsSnapshot = 1;
  assert.equal(isValidBackup(missingSession), false);

  const excessiveUse = structuredClone(valid);
  excessiveUse.recoveryUses.push(
    { id: "use-1", targetDate: "2026-08-08", usedAt: NOW },
    { id: "use-2", targetDate: "2026-08-09", usedAt: NOW },
  );
  assert.equal(isValidBackup(excessiveUse), false);

  const invalidGrant = structuredClone(valid);
  invalidGrant.recoveryGrants[0].sourceDate = "2026-08-06";
  assert.equal(isValidBackup(invalidGrant), false);

  const futureUse = structuredClone(valid);
  futureUse.recoveryUses.push({ id: "use-future", targetDate: "2099-01-01", usedAt: NOW });
  assert.equal(isValidBackup(futureUse), false);

  const useBeforeGrant = structuredClone(valid);
  useBeforeGrant.recoveryUses.push({ id: "use-early", targetDate: "2026-07-31", usedAt: "2026-08-06T03:00:00.000Z" });
  assert.equal(isValidBackup(useBeforeGrant), false);

  const futureRecord = structuredClone(valid);
  futureRecord.records[0].localDate = "2099-01-01";
  assert.equal(isValidBackup(futureRecord), false);

  const mixedOffsets = dataWithDates(Array.from({ length: 7 }, (_, index) => `2026-08-0${index + 2}`));
  mixedOffsets.recoveryGrants.push({
    id: "grant-offset",
    sourceDate: "2026-08-08",
    type: "seven_actual_days",
    createdAt: "2026-08-07T23:30:00-10:00",
  });
  mixedOffsets.recoveryUses.push({
    id: "use-offset",
    targetDate: "2026-08-01",
    usedAt: "2026-08-08T01:00:00+14:00",
  });
  assert.equal(isValidBackup(mixedOffsets), false, "ISO表記の辞書順でなく実時刻で獲得前使用を拒否");

  const grantBeforeQualifyingRecord = dataWithDates(Array.from({ length: 7 }, (_, index) => `2026-08-0${index + 1}`));
  grantBeforeQualifyingRecord.records.at(-1)!.recordedAt = "2026-08-07T10:00:00.000Z";
  grantBeforeQualifyingRecord.records.at(-1)!.createdAt = "2026-08-07T10:00:00.000Z";
  grantBeforeQualifyingRecord.records.at(-1)!.updatedAt = "2026-08-07T10:00:00.000Z";
  grantBeforeQualifyingRecord.recoveryGrants.push({
    id: "grant-too-early",
    sourceDate: "2026-08-07",
    type: "seven_actual_days",
    createdAt: "2026-08-07T00:00:00.000Z",
  });
  assert.equal(isValidBackup(grantBeforeQualifyingRecord), false, "資格成立記録より前の付与を拒否");

  const unearnedBadge = dataWithDates(["2026-08-01"]);
  unearnedBadge.badgeAwards.push({
    badgeId: "twenty_days_total",
    awardedAt: "2026-08-01T04:00:00.000Z",
    sourceDate: "2026-08-01",
  });
  assert.equal(isValidBackup(unearnedBadge), false, "条件未達のバッジ履歴を拒否");

  const badgeBeforeRecord = dataWithDates(["2026-08-01"]);
  badgeBeforeRecord.badgeAwards.push({
    badgeId: "first_step",
    awardedAt: "2026-08-01T02:00:00.000Z",
    sourceDate: "2026-08-01",
  });
  assert.equal(isValidBackup(badgeBeforeRecord), false, "記録より前のバッジ付与を拒否");
});

test("リカバリー可否は残数、重複、実記録日、今日・未来を一貫して制限する", () => {
  const noRights = dataWithDates([]);
  assert.equal(canUseRecovery(noRights, "2026-08-12", NOW), false);

  const data = dataWithDates([
    "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31",
    ...Array.from({ length: 10 }, (_, index) => `2026-08-${String(index + 1).padStart(2, "0")}`),
  ]);
  data.recoveryGrants.push(
    { id: "grant-1", sourceDate: "2026-08-03", type: "seven_actual_days", createdAt: "2026-08-03T03:00:00.000Z" },
    { id: "grant-2", sourceDate: "2026-08-10", type: "seven_actual_days", createdAt: "2026-08-10T03:00:00.000Z" },
  );
  assert.equal(canUseRecovery(data, "2026-08-12", NOW), true);
  assert.equal(canUseRecovery(data, "2026-08-07", NOW), false, "実記録日は不可");
  assert.equal(canUseRecovery(data, "2026-08-13", NOW), false, "今日は不可");
  assert.equal(canUseRecovery(data, "2099-01-01", NOW), false, "未来日は不可");

  data.recoveryUses.push({ id: "use-1", targetDate: "2026-08-12", usedAt: NOW });
  assert.equal(canUseRecovery(data, "2026-08-12", NOW), false, "同じ日は二重使用不可");
  assert.equal(canUseRecovery(data, "2026-08-11", NOW), true, "2つ目の権利で別の空白日を守れる");
  data.recoveryUses.push({ id: "use-2", targetDate: "2026-08-11", usedAt: NOW });
  assert.equal(canUseRecovery(data, "2026-08-10", NOW), false, "使い切った後は残数0");
});

test("アーカイブ済み場所も過去記録の場所種類バッジに含む", () => {
  const data = dataWithDates(["2026-08-01", "2026-08-02", "2026-08-03"]);
  data.records = data.records.map((item, index) => ({ ...item, placeId: data.places[index].id }));
  data.places[0].isArchived = true;
  assert.ok(earnedBadgeIds(data, "2026-08-03").includes("three_places"));
});

test("バックアップ検証は計測と記録の時系列・経過秒不一致を拒否する", () => {
  const data = dataWithDates(["2026-08-01"]);
  const session = stopwatch({
    status: "recorded",
    startedAt: "2026-08-01T02:59:50.000Z",
    endedAt: "2026-08-01T03:00:00.000Z",
    elapsedSeconds: 10,
    cleanupRecordId: data.records[0].id,
    createdAt: "2026-08-01T02:59:50.000Z",
    updatedAt: "2026-08-01T03:00:00.000Z",
  });
  data.stopwatchSessions.push(session);
  data.records[0].stopwatchSessionId = session.id;
  data.records[0].elapsedSecondsSnapshot = 10;
  assert.equal(isValidBackup(data), true);

  const mismatch = structuredClone(data);
  mismatch.records[0].elapsedSecondsSnapshot = 11;
  assert.equal(isValidBackup(mismatch), false);

  const recordBeforeStop = structuredClone(data);
  recordBeforeStop.stopwatchSessions[0].endedAt = "2026-08-01T03:00:01.000Z";
  recordBeforeStop.stopwatchSessions[0].updatedAt = "2026-08-01T03:00:01.000Z";
  assert.equal(isValidBackup(recordBeforeStop), false);
});
