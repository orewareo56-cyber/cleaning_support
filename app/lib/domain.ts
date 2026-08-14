import type {
  AppData,
  BadgeDefinition,
  CleanupRecord,
  RecoveryGrant,
  StopwatchSession,
} from "./types";
import {
  DEFAULT_BACKGROUND_SETTINGS,
  isBackgroundId,
  isBackgroundInterval,
  isBackgroundMode,
} from "./backgrounds";

export const BADGES: BadgeDefinition[] = [
  { id: "first_step", name: "はじめの一歩", description: "初めて片付けを記録", icon: "🌱", category: "short", tone: "mint" },
  { id: "two_days", name: "ふたつの足あと", description: "2日連続で記録", icon: "🐾", category: "short", tone: "sky" },
  { id: "three_records", name: "三つのきらり", description: "片付けを3件記録", icon: "⭐", category: "short", tone: "coral" },
  { id: "three_days", name: "小さな習慣", description: "3日連続で記録", icon: "🌿", category: "short", tone: "mint" },
  { id: "two_places", name: "ふた部屋さんぽ", description: "2種類の場所で記録", icon: "🚪", category: "short", tone: "lilac" },
  { id: "five_days_total", name: "こつこつ5日", description: "累計5日記録", icon: "✨", category: "short", tone: "gold" },
  { id: "five_day_streak", name: "五日咲き", description: "5日連続で記録", icon: "🌸", category: "short", tone: "coral" },
  { id: "seven_records", name: "7つの前進", description: "片付けを7件記録", icon: "📚", category: "short", tone: "sky" },
  { id: "seven_days", name: "一週間達成", description: "7日連続で記録", icon: "🎉", category: "short", tone: "gold" },
  { id: "ten_days_total", name: "片付けの芽", description: "累計10日記録", icon: "🌼", category: "habit", tone: "mint" },
  { id: "fourteen_days", name: "二週間のリズム", description: "14日連続で記録", icon: "🗓️", category: "habit", tone: "sky" },
  { id: "fifteen_days_total", name: "半月の足あと", description: "累計15日記録", icon: "👣", category: "habit", tone: "lilac" },
  { id: "twenty_days_total", name: "続いている実感", description: "累計20日記録", icon: "🌳", category: "habit", tone: "coral" },
  { id: "twenty_one_days", name: "習慣のつぼみ", description: "21日連続で記録", icon: "🌷", category: "habit", tone: "mint" },
  { id: "thirty_days_total", name: "30日の宝箱", description: "累計30日記録", icon: "🎁", category: "habit", tone: "gold" },
  { id: "thirty_days", name: "一か月の王冠", description: "30日連続で記録", icon: "👑", category: "habit", tone: "gold" },
  { id: "three_places", name: "3か所すっきり", description: "3種類の場所で記録", icon: "🏠", category: "special", tone: "sky" },
  { id: "five_places", name: "家の探検家", description: "5種類の場所で記録", icon: "🧭", category: "special", tone: "lilac" },
  { id: "comeback", name: "虹の架け橋", description: "最初の記録から7日後にも記録", icon: "🌈", category: "special", tone: "coral" },
  { id: "recovery_return", name: "上手に立て直した", description: "リカバリーの翌日に記録", icon: "🛡️", category: "special", tone: "mint" },
];

const DAY_MS = 86_400_000;

export function uuid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function dateInTimezone(date = new Date(), timezone = "Asia/Tokyo"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function shiftDate(localDate: string, amount: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount, 12));
  return date.toISOString().slice(0, 10);
}

export function dayDifference(earlier: string, later: string): number {
  const from = Date.parse(`${earlier}T12:00:00Z`);
  const to = Date.parse(`${later}T12:00:00Z`);
  return Math.round((to - from) / DAY_MS);
}

export function actualDates(records: CleanupRecord[]): string[] {
  return [...new Set(records.map((record) => record.localDate))].sort();
}

function consecutiveEndingAt(dates: Set<string>, endDate: string): number {
  let count = 0;
  let cursor = endDate;
  while (dates.has(cursor)) {
    count += 1;
    cursor = shiftDate(cursor, -1);
  }
  return count;
}

export function actualStreakEndingAt(records: CleanupRecord[], date: string): number {
  return consecutiveEndingAt(new Set(actualDates(records)), date);
}

export function longestActualStreak(records: CleanupRecord[]): number {
  const dates = actualDates(records);
  let best = 0;
  let current = 0;
  let previous: string | null = null;
  for (const date of dates) {
    current = previous && dayDifference(previous, date) === 1 ? current + 1 : 1;
    best = Math.max(best, current);
    previous = date;
  }
  return best;
}

export function protectedCurrentStreak(data: AppData, today: string): number {
  const protectedDates = new Set([
    ...actualDates(data.records),
    ...data.recoveryUses.map((use) => use.targetDate),
  ]);
  const endDate = protectedDates.has(today) ? today : shiftDate(today, -1);
  return consecutiveEndingAt(protectedDates, endDate);
}

export function longestProtectedStreak(data: AppData): number {
  const dates = [...new Set([
    ...actualDates(data.records),
    ...data.recoveryUses.map((use) => use.targetDate),
  ])].sort();
  let best = 0;
  let current = 0;
  let previous: string | null = null;
  for (const date of dates) {
    current = previous && dayDifference(previous, date) === 1 ? current + 1 : 1;
    best = Math.max(best, current);
    previous = date;
  }
  return best;
}

export function recoveryBalance(data: AppData): number {
  return Math.max(0, data.recoveryGrants.length - data.recoveryUses.length);
}

export function canUseRecovery(data: AppData, targetDate: string, usedAt: string): boolean {
  const useDate = dateInTimezone(new Date(usedAt), data.settings.timezone);
  return recoveryBalance(data) > 0
    && targetDate < useDate
    && !data.records.some((record) => record.localDate === targetDate)
    && !data.recoveryUses.some((use) => use.targetDate === targetDate);
}

export function grantForNewRecord(
  records: CleanupRecord[],
  existingGrants: RecoveryGrant[],
  sourceDate: string,
  createdAt: string,
): RecoveryGrant | null {
  const run = actualStreakEndingAt(records, sourceDate);
  if (run === 0 || run % 7 !== 0) return null;
  if (existingGrants.some((grant) => grant.sourceDate === sourceDate)) return null;
  return {
    id: uuid(),
    sourceDate,
    type: "seven_actual_days",
    createdAt,
  };
}

export function stopwatchElapsed(session: StopwatchSession, now = Date.now()): number {
  if (session.elapsedSeconds !== null && ["stopped", "recorded", "discarded"].includes(session.status)) {
    return Math.max(0, session.elapsedSeconds);
  }
  const end = session.status === "paused" && session.pausedAt
    ? Date.parse(session.pausedAt)
    : session.endedAt && ["stopped", "recorded", "discarded"].includes(session.status)
      ? Date.parse(session.endedAt)
      : now;
  const startedAt = Date.parse(session.startedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - startedAt) / 1000) - Math.max(0, session.totalPausedSeconds));
}

export function formatElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function badgeConditionMap(data: AppData, sourceDate: string): Record<string, boolean> {
  const dates = actualDates(data.records);
  const actualRun = longestActualStreak(data.records);
  const places = new Set(data.records.map((record) => record.placeId)).size;
  const firstDate = dates.at(0);
  return {
    first_step: data.records.length >= 1,
    two_days: actualRun >= 2,
    three_records: data.records.length >= 3,
    three_days: actualRun >= 3,
    two_places: places >= 2,
    five_days_total: dates.length >= 5,
    five_day_streak: actualRun >= 5,
    seven_days: actualRun >= 7,
    seven_records: data.records.length >= 7,
    ten_days_total: dates.length >= 10,
    fourteen_days: actualRun >= 14,
    fifteen_days_total: dates.length >= 15,
    twenty_days_total: dates.length >= 20,
    twenty_one_days: actualRun >= 21,
    thirty_days_total: dates.length >= 30,
    thirty_days: actualRun >= 30,
    three_places: places >= 3,
    five_places: places >= 5,
    comeback: Boolean(firstDate && dayDifference(firstDate, sourceDate) >= 7),
    recovery_return: data.recoveryUses.some((use) => shiftDate(use.targetDate, 1) === sourceDate),
  };
}

export function earnedBadgeIds(data: AppData, sourceDate: string): string[] {
  const checks = badgeConditionMap(data, sourceDate);
  const already = new Set(data.badgeAwards.map((award) => award.badgeId));
  return BADGES.filter((badge) => checks[badge.id] && !already.has(badge.id)).map((badge) => badge.id);
}

export function backfillBadgeAwards(data: AppData): AppData {
  const latestRecord = [...data.records].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)).at(-1);
  if (!latestRecord) return data;
  const missing = earnedBadgeIds(data, latestRecord.localDate).filter((badgeId) =>
    BADGES.find((badge) => badge.id === badgeId)?.category !== "special");
  if (!missing.length) return data;
  return {
    ...data,
    badgeAwards: [
      ...data.badgeAwards,
      ...missing.map((badgeId) => ({
        badgeId,
        awardedAt: latestRecord.recordedAt,
        sourceDate: latestRecord.localDate,
      })),
    ],
  };
}

export function badgeProgress(data: AppData, badgeId: string): { current: number; target: number } {
  const dates = actualDates(data.records);
  const run = longestActualStreak(data.records);
  const places = new Set(data.records.map((record) => record.placeId)).size;
  switch (badgeId) {
    case "first_step": return { current: Math.min(data.records.length, 1), target: 1 };
    case "two_days": return { current: Math.min(run, 2), target: 2 };
    case "three_records": return { current: Math.min(data.records.length, 3), target: 3 };
    case "three_days": return { current: Math.min(run, 3), target: 3 };
    case "two_places": return { current: Math.min(places, 2), target: 2 };
    case "five_days_total": return { current: Math.min(dates.length, 5), target: 5 };
    case "five_day_streak": return { current: Math.min(run, 5), target: 5 };
    case "seven_days": return { current: Math.min(run, 7), target: 7 };
    case "seven_records": return { current: Math.min(data.records.length, 7), target: 7 };
    case "ten_days_total": return { current: Math.min(dates.length, 10), target: 10 };
    case "fourteen_days": return { current: Math.min(run, 14), target: 14 };
    case "fifteen_days_total": return { current: Math.min(dates.length, 15), target: 15 };
    case "twenty_days_total": return { current: Math.min(dates.length, 20), target: 20 };
    case "twenty_one_days": return { current: Math.min(run, 21), target: 21 };
    case "thirty_days_total": return { current: Math.min(dates.length, 30), target: 30 };
    case "thirty_days": return { current: Math.min(run, 30), target: 30 };
    case "three_places": return { current: Math.min(places, 3), target: 3 };
    case "five_places": return { current: Math.min(places, 5), target: 5 };
    case "comeback": return {
      current: dates.length ? Math.min(dayDifference(dates[0], dates.at(-1) ?? dates[0]), 7) : 0,
      target: 7,
    };
    default: return { current: 0, target: 1 };
  }
}

/**
 * Upgrade a supported backup to the current schema, then run the same strict
 * validation used for current data. Schema 0 is the pre-stopwatch shape used
 * by early development builds; its records have no stopwatch fields.
 */
export function migrateBackup(value: unknown): AppData | null {
  if (isValidBackup(value)) return value;
  if (!isPlainObject(value) || value.schemaVersion !== 0
    || !Array.isArray(value.places) || !Array.isArray(value.activities)
    || !Array.isArray(value.records) || !Array.isArray(value.recoveryGrants)
    || !Array.isArray(value.recoveryUses) || !Array.isArray(value.badgeAwards)) return null;

  const legacySettings = isPlainObject(value.settings) ? value.settings : {};
  const migrated: unknown = {
    ...value,
    schemaVersion: 1,
    records: value.records.map((record) => isPlainObject(record) ? {
      ...record,
      stopwatchSessionId: record.stopwatchSessionId ?? null,
      elapsedSecondsSnapshot: record.elapsedSecondsSnapshot ?? null,
    } : record),
    stopwatchSessions: [],
    settings: {
      timezone: isValidTimeZone(legacySettings.timezone) ? legacySettings.timezone : "Asia/Tokyo",
      onboardingComplete: typeof legacySettings.onboardingComplete === "boolean"
        ? legacySettings.onboardingComplete
        : true,
      lastBackupAt: legacySettings.lastBackupAt ?? null,
      ...DEFAULT_BACKGROUND_SETTINGS,
    },
  };
  return isValidBackup(migrated) ? migrated : null;
}

export function isValidBackup(value: unknown): value is AppData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<AppData>;
  if (data.schemaVersion !== 1
    || !Array.isArray(data.places)
    || !Array.isArray(data.activities)
    || !Array.isArray(data.records)
    || !Array.isArray(data.stopwatchSessions)
    || !Array.isArray(data.recoveryGrants)
    || !Array.isArray(data.recoveryUses)
    || !Array.isArray(data.badgeAwards)
    || !isPlainObject(data.settings)
    || !isValidTimeZone(data.settings.timezone)
    || typeof data.settings.onboardingComplete !== "boolean"
    || !(data.settings.lastBackupAt === null || isIsoDateTime(data.settings.lastBackupAt))
    || !(data.settings.backgroundMode === undefined || isBackgroundMode(data.settings.backgroundMode))
    || !(data.settings.backgroundImageId === undefined || isBackgroundId(data.settings.backgroundImageId))
    || !(data.settings.backgroundIntervalSeconds === undefined
      || isBackgroundInterval(data.settings.backgroundIntervalSeconds))
    || !(data.settings.homeBackgroundFadeEnabled === undefined
      || typeof data.settings.homeBackgroundFadeEnabled === "boolean")) return false;

  if (!isUnique(data.places, "id") || !isUnique(data.activities, "id")
    || !isUnique(data.records, "id") || !isUnique(data.stopwatchSessions, "id")
    || !isUnique(data.recoveryGrants, "id") || !isUnique(data.recoveryGrants, "sourceDate")
    || !isUnique(data.recoveryUses, "id") || !isUnique(data.recoveryUses, "targetDate")
    || !isUnique(data.badgeAwards, "badgeId")) return false;

  const structurallyValid = data.places.every(isMasterItem)
    && data.activities.every(isMasterItem)
    && data.records.every(isCleanupRecord)
    && data.stopwatchSessions.every(isStopwatchSession)
    && data.recoveryGrants.every((grant) => isPlainObject(grant)
      && isNonEmptyString(grant.id) && isLocalDate(grant.sourceDate)
      && grant.type === "seven_actual_days" && isIsoDateTime(grant.createdAt))
    && data.recoveryUses.every((use) => isPlainObject(use)
      && isNonEmptyString(use.id) && isLocalDate(use.targetDate) && isIsoDateTime(use.usedAt))
    && data.badgeAwards.every((award) => isPlainObject(award)
      && BADGES.some((badge) => badge.id === award.badgeId)
      && isIsoDateTime(award.awardedAt)
      && (award.sourceDate === null || isLocalDate(award.sourceDate)));
  if (!structurallyValid) return false;

  const validData = data as AppData;
  const placeIds = new Set(validData.places.map((item) => item.id));
  const activityIds = new Set(validData.activities.map((item) => item.id));
  const recordsById = new Map(validData.records.map((record) => [record.id, record]));
  const sessionsById = new Map(validData.stopwatchSessions.map((session) => [session.id, session]));
  const actual = new Set(actualDates(validData.records));

  if (!validData.records.every((record) => {
    if (dateInTimezone(new Date(record.recordedAt), validData.settings.timezone) !== record.localDate
      || !placeIds.has(record.placeId) || !activityIds.has(record.activityId)) return false;
    if (record.stopwatchSessionId === null) return record.elapsedSecondsSnapshot === null;
    const session = sessionsById.get(record.stopwatchSessionId);
    return session?.status === "recorded"
      && session.cleanupRecordId === record.id
      && session.elapsedSeconds === record.elapsedSecondsSnapshot
      && session.endedAt !== null
      && Date.parse(session.endedAt) <= Date.parse(record.recordedAt);
  })) return false;

  if (!validData.stopwatchSessions.every((session) => session.status === "recorded"
    ? session.cleanupRecordId !== null
      && recordsById.get(session.cleanupRecordId)?.stopwatchSessionId === session.id
    : session.cleanupRecordId === null)) return false;

  if (validData.stopwatchSessions.filter((session) => ["running", "paused", "stopped"].includes(session.status)).length > 1) return false;

  const usesInOrder = [...validData.recoveryUses].sort((a, b) => Date.parse(a.usedAt) - Date.parse(b.usedAt));
  if (usesInOrder.length > validData.recoveryGrants.length
    || usesInOrder.some((use, index) => actual.has(use.targetDate)
      || use.targetDate >= dateInTimezone(new Date(use.usedAt), validData.settings.timezone)
      || validData.recoveryGrants.filter((grant) => Date.parse(grant.createdAt) <= Date.parse(use.usedAt)).length <= index)) return false;

  if (!validData.recoveryGrants.every((grant) => {
    const run = actualStreakEndingAt(validData.records, grant.sourceDate);
    return run > 0 && run % 7 === 0
      && dateInTimezone(new Date(grant.createdAt), validData.settings.timezone) === grant.sourceDate
      && validData.records.some((record) => record.localDate === grant.sourceDate
        && Date.parse(record.recordedAt) <= Date.parse(grant.createdAt));
  })) return false;

  return validData.badgeAwards.every((award) => {
    const sourceDate = award.sourceDate ?? dateInTimezone(new Date(award.awardedAt), validData.settings.timezone);
    if (!actual.has(sourceDate)
      || dateInTimezone(new Date(award.awardedAt), validData.settings.timezone) !== sourceDate) return false;
    const awardTime = Date.parse(award.awardedAt);
    const dataAtAward: AppData = {
      ...validData,
      records: validData.records.filter((record) => Date.parse(record.recordedAt) <= awardTime),
      recoveryGrants: validData.recoveryGrants.filter((grant) => Date.parse(grant.createdAt) <= awardTime),
      recoveryUses: validData.recoveryUses.filter((use) => Date.parse(use.usedAt) <= awardTime),
      badgeAwards: [],
      stopwatchSessions: validData.stopwatchSessions.filter((session) => Date.parse(session.createdAt) <= awardTime),
    };
    return Boolean(badgeConditionMap(dataAtAward, sourceDate)[award.badgeId]);
  });
}

function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDateTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

function isLocalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function isUnique(items: unknown[], key: string): boolean {
  const values = items.map((item) => isPlainObject(item) ? item[key] : undefined);
  return values.every((value) => typeof value === "string") && new Set(values).size === values.length;
}

function isMasterItem(item: unknown): boolean {
  return isPlainObject(item) && isNonEmptyString(item.id) && isNonEmptyString(item.name)
    && Number.isInteger(item.sortOrder) && Number(item.sortOrder) >= 0
    && typeof item.isArchived === "boolean" && isIsoDateTime(item.createdAt) && isIsoDateTime(item.updatedAt)
    && Date.parse(item.createdAt) <= Date.parse(item.updatedAt);
}

function isCleanupRecord(record: unknown): boolean {
  return isPlainObject(record) && isNonEmptyString(record.id) && isLocalDate(record.localDate)
    && isIsoDateTime(record.recordedAt) && isNonEmptyString(record.placeId)
    && isNonEmptyString(record.placeNameSnapshot) && isNonEmptyString(record.activityId)
    && isNonEmptyString(record.activityNameSnapshot)
    && (record.memo === null || typeof record.memo === "string")
    && (record.stopwatchSessionId === null || isNonEmptyString(record.stopwatchSessionId))
    && (record.elapsedSecondsSnapshot === null
      || (Number.isInteger(record.elapsedSecondsSnapshot) && Number(record.elapsedSecondsSnapshot) >= 0))
    && isIsoDateTime(record.createdAt) && isIsoDateTime(record.updatedAt)
    && Date.parse(record.recordedAt) <= Date.parse(record.createdAt)
    && Date.parse(record.createdAt) <= Date.parse(record.updatedAt);
}

function isStopwatchSession(session: unknown): boolean {
  if (!isPlainObject(session) || !isNonEmptyString(session.id) || !isIsoDateTime(session.startedAt)
    || !(session.pausedAt === null || isIsoDateTime(session.pausedAt))
    || !Number.isInteger(session.totalPausedSeconds) || Number(session.totalPausedSeconds) < 0
    || !(session.endedAt === null || isIsoDateTime(session.endedAt))
    || !(session.elapsedSeconds === null || (Number.isInteger(session.elapsedSeconds) && Number(session.elapsedSeconds) >= 0))
    || !["running", "paused", "stopped", "discarded", "recorded"].includes(String(session.status))
    || !(session.cleanupRecordId === null || isNonEmptyString(session.cleanupRecordId))
    || !isIsoDateTime(session.createdAt) || !isIsoDateTime(session.updatedAt)) return false;
  if (session.status === "paused" && session.pausedAt === null) return false;
  if (["stopped", "discarded", "recorded"].includes(String(session.status)) && session.endedAt === null) return false;
  const startedAt = Date.parse(session.startedAt);
  const updatedAt = Date.parse(session.updatedAt);
  if (Date.parse(session.createdAt) > startedAt || startedAt > updatedAt) return false;
  if (session.pausedAt !== null && (Date.parse(session.pausedAt) < startedAt || Date.parse(session.pausedAt) > updatedAt)) return false;
  if (session.endedAt !== null && (Date.parse(session.endedAt) < startedAt || Date.parse(session.endedAt) > updatedAt)) return false;
  return true;
}
