export const BACKGROUND_OPTIONS = [
  { id: "room-1903", label: "書斎・個室", fileName: "room-1903.jpg" },
  { id: "room-1904", label: "収納・衣類部屋", fileName: "room-1904.jpg" },
  { id: "room-1905", label: "和室", fileName: "room-1905.jpg" },
  { id: "room-1906", label: "洗面・洗濯室", fileName: "room-1906.jpg" },
  { id: "room-1907", label: "廊下", fileName: "room-1907.jpg" },
  { id: "room-1908", label: "リビング", fileName: "room-1908.jpg" },
  { id: "room-1909", label: "ダイニング", fileName: "room-1909.jpg" },
  { id: "room-1910", label: "キッチン", fileName: "room-1910.jpg" },
] as const;

export type BackgroundId = (typeof BACKGROUND_OPTIONS)[number]["id"];
export type BackgroundMode = "none" | "fixed" | "slideshow";

export type BackgroundSettings = {
  backgroundMode: BackgroundMode;
  backgroundImageId: BackgroundId;
  backgroundIntervalSeconds: number;
};

export const DEFAULT_BACKGROUND_SETTINGS: BackgroundSettings = {
  backgroundMode: "none",
  backgroundImageId: "room-1908",
  backgroundIntervalSeconds: 7,
};

const BACKGROUND_IDS = new Set<string>(BACKGROUND_OPTIONS.map((option) => option.id));

export function isBackgroundId(value: unknown): value is BackgroundId {
  return typeof value === "string" && BACKGROUND_IDS.has(value);
}

export function isBackgroundMode(value: unknown): value is BackgroundMode {
  return value === "none" || value === "fixed" || value === "slideshow";
}

export function isBackgroundInterval(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 5 && value <= 10;
}

export function resolveBackgroundSettings(settings: Partial<BackgroundSettings>): BackgroundSettings {
  return {
    backgroundMode: isBackgroundMode(settings.backgroundMode)
      ? settings.backgroundMode
      : DEFAULT_BACKGROUND_SETTINGS.backgroundMode,
    backgroundImageId: isBackgroundId(settings.backgroundImageId)
      ? settings.backgroundImageId
      : DEFAULT_BACKGROUND_SETTINGS.backgroundImageId,
    backgroundIntervalSeconds: isBackgroundInterval(settings.backgroundIntervalSeconds)
      ? settings.backgroundIntervalSeconds
      : DEFAULT_BACKGROUND_SETTINGS.backgroundIntervalSeconds,
  };
}
