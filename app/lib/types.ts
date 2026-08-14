import type { BackgroundId, BackgroundMode } from "./backgrounds";

export type MasterItem = {
  id: string;
  name: string;
  sortOrder: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CleanupRecord = {
  id: string;
  localDate: string;
  recordedAt: string;
  placeId: string;
  placeNameSnapshot: string;
  activityId: string;
  activityNameSnapshot: string;
  memo: string | null;
  stopwatchSessionId: string | null;
  elapsedSecondsSnapshot: number | null;
  createdAt: string;
  updatedAt: string;
};

export type StopwatchStatus =
  | "running"
  | "paused"
  | "stopped"
  | "discarded"
  | "recorded";

export type StopwatchSession = {
  id: string;
  startedAt: string;
  pausedAt: string | null;
  totalPausedSeconds: number;
  endedAt: string | null;
  elapsedSeconds: number | null;
  status: StopwatchStatus;
  cleanupRecordId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RecoveryGrant = {
  id: string;
  sourceDate: string;
  type: "seven_actual_days";
  createdAt: string;
};

export type RecoveryUse = {
  id: string;
  targetDate: string;
  usedAt: string;
};

export type BadgeAward = {
  badgeId: string;
  awardedAt: string;
  sourceDate: string | null;
};

export type AppData = {
  schemaVersion: 1;
  places: MasterItem[];
  activities: MasterItem[];
  records: CleanupRecord[];
  stopwatchSessions: StopwatchSession[];
  recoveryGrants: RecoveryGrant[];
  recoveryUses: RecoveryUse[];
  badgeAwards: BadgeAward[];
  settings: {
    timezone: string;
    onboardingComplete: boolean;
    lastBackupAt: string | null;
    backgroundMode?: BackgroundMode;
    backgroundImageId?: BackgroundId;
    backgroundIntervalSeconds?: number;
    homeBackgroundFadeEnabled?: boolean;
  };
};

export type BadgeDefinition = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: "short" | "habit" | "special";
  tone: "mint" | "sky" | "coral" | "gold" | "lilac";
};
