"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  actualDates,
  BADGES,
  backfillBadgeAwards,
  badgeProgress,
  canUseRecovery,
  dateInTimezone,
  earnedBadgeIds,
  formatElapsed,
  grantForNewRecord,
  longestProtectedStreak,
  migrateBackup,
  protectedCurrentStreak,
  recoveryBalance,
  shiftDate,
  stopwatchElapsed,
  uuid,
} from "./lib/domain";
import { loadData, saveData } from "./lib/storage";
import {
  BACKGROUND_OPTIONS,
  resolveBackgroundSettings,
  type BackgroundMode,
} from "./lib/backgrounds";
import type { AppData, CleanupRecord, MasterItem, StopwatchSession } from "./lib/types";

type View = "home" | "history" | "badges" | "manage" | "settings" | "stopwatch" | "record";
type RecordDraft = { placeId: string; activityId: string; memo: string; sessionId: string | null; editingId: string | null };

const emptyDraft: RecordDraft = { placeId: "", activityId: "", memo: "", sessionId: null, editingId: null };
const HOME_BACKGROUND_FADE_MS = 3000;
const BADGE_CELEBRATION_MS = 3200;

function formatJapaneseDate(localDate: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("ja-JP", options ?? { month: "long", day: "numeric", weekday: "short" })
    .format(new Date(`${localDate}T12:00:00`));
}

function activeStopwatch(data: AppData | null): StopwatchSession | null {
  return data?.stopwatchSessions.find((session) => ["running", "paused", "stopped"].includes(session.status)) ?? null;
}

function backgroundAssetUrl(fileName: string): string {
  return `${import.meta.env.BASE_URL}backgrounds/${fileName}`;
}

function BackgroundBackdrop({ settings }: { settings: AppData["settings"] }) {
  const background = resolveBackgroundSettings(settings);
  const selectedIndex = Math.max(0, BACKGROUND_OPTIONS.findIndex((option) => option.id === background.backgroundImageId));
  const [slideIndex, setSlideIndex] = useState(selectedIndex);

  useEffect(() => {
    if (background.backgroundMode !== "slideshow") return undefined;
    const timer = window.setInterval(() => {
      setSlideIndex((current) => (current + 1) % BACKGROUND_OPTIONS.length);
    }, background.backgroundIntervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [background.backgroundIntervalSeconds, background.backgroundMode]);

  const activeOption = background.backgroundMode === "fixed"
    ? BACKGROUND_OPTIONS[selectedIndex]
    : BACKGROUND_OPTIONS[slideIndex];

  useEffect(() => {
    if (background.backgroundMode === "none") return;
    const nextIndex = background.backgroundMode === "slideshow"
      ? (slideIndex + 1) % BACKGROUND_OPTIONS.length
      : selectedIndex;
    const preload = new Image();
    preload.src = backgroundAssetUrl(BACKGROUND_OPTIONS[nextIndex].fileName);
  }, [background.backgroundMode, selectedIndex, slideIndex]);

  if (background.backgroundMode === "none") return null;

  return (
    <div className="app-background" aria-hidden="true">
      <div
        key={activeOption.id}
        className="app-background-image"
        data-background-id={activeOption.id}
        style={{ backgroundImage: `url(${backgroundAssetUrl(activeOption.fileName)})` }}
      />
    </div>
  );
}

export function CleanupApp() {
  const [data, setData] = useState<AppData | null>(null);
  const [view, setView] = useState<View>("home");
  const [draft, setDraft] = useState<RecordDraft>(emptyDraft);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => dateInTimezone().slice(0, 7));
  const [masterKind, setMasterKind] = useState<"places" | "activities">("places");
  const [revealingHomeBackground, setRevealingHomeBackground] = useState(false);
  const [badgeCelebrations, setBadgeCelebrations] = useState<string[]>([]);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundRevealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const badgeCelebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundRevealActive = useRef(false);

  const announce = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4500);
  }, []);

  const showHomeBackground = useCallback((settings: AppData["settings"]) => {
    if (document.visibilityState === "hidden") return;
    const background = resolveBackgroundSettings(settings);
    if (background.backgroundMode === "none" || !background.homeBackgroundFadeEnabled) return;
    if (backgroundRevealActive.current) return;
    backgroundRevealActive.current = true;
    setRevealingHomeBackground(true);
    backgroundRevealTimer.current = setTimeout(() => {
      backgroundRevealActive.current = false;
      setRevealingHomeBackground(false);
      backgroundRevealTimer.current = null;
    }, HOME_BACKGROUND_FADE_MS);
  }, []);

  const celebrateBadges = useCallback((badgeIds: string[]) => {
    if (!badgeIds.length) return;
    if (badgeCelebrationTimer.current) clearTimeout(badgeCelebrationTimer.current);
    setBadgeCelebrations(badgeIds);
    badgeCelebrationTimer.current = setTimeout(() => {
      setBadgeCelebrations([]);
      badgeCelebrationTimer.current = null;
    }, BADGE_CELEBRATION_MS);
  }, []);

  useEffect(() => {
    let mounted = true;
    loadData().then((loaded) => {
      if (mounted) {
        showHomeBackground(loaded.settings);
        setData(loaded);
      }
    });
    if ("serviceWorker" in navigator) {
      const serviceWorkerUrl = new URL("sw.js", document.baseURI).pathname;
      navigator.serviceWorker.register(serviceWorkerUrl).catch(() => undefined);
    }
    return () => {
      mounted = false;
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      if (backgroundRevealTimer.current) clearTimeout(backgroundRevealTimer.current);
      if (badgeCelebrationTimer.current) clearTimeout(badgeCelebrationTimer.current);
    };
  }, [showHomeBackground]);

  useEffect(() => {
    if (!data) return undefined;
    const showWhenReturning = () => {
      if (view === "home") showHomeBackground(data.settings);
    };
    const showWhenVisible = () => {
      if (document.visibilityState === "visible") showWhenReturning();
    };
    document.addEventListener("visibilitychange", showWhenVisible);
    window.addEventListener("focus", showWhenReturning);
    window.addEventListener("pageshow", showWhenReturning);
    return () => {
      document.removeEventListener("visibilitychange", showWhenVisible);
      window.removeEventListener("focus", showWhenReturning);
      window.removeEventListener("pageshow", showWhenReturning);
    };
  }, [data, showHomeBackground, view]);

  const commit = useCallback((next: AppData, success?: string) => {
    setData(next);
    void saveData(next).then(() => {
      if (success) announce(success);
    }).catch(() => announce("保存できませんでした。空き容量やブラウザ設定をご確認ください。"));
  }, [announce]);

  const today = data ? dateInTimezone(new Date(), data.settings.timezone) : dateInTimezone();

  const openRecord = useCallback((sessionId: string | null = null, record?: CleanupRecord) => {
    setDraft(record ? {
      placeId: record.placeId,
      activityId: record.activityId,
      memo: record.memo ?? "",
      sessionId: record.stopwatchSessionId,
      editingId: record.id,
    } : { ...emptyDraft, sessionId });
    setView("record");
  }, []);

  if (!data) {
    return <main className="loading-shell" aria-busy="true"><p>あなたの記録を準備しています…</p></main>;
  }

  const appData = data;
  const backgroundSettings = resolveBackgroundSettings(appData.settings);
  const session = activeStopwatch(appData);
  const todayRecords = appData.records.filter((record) => record.localDate === today);

  function navigate(next: View) {
    setSelectedDate(null);
    if (next === "home") showHomeBackground(appData.settings);
    setView(next);
  }

  function startStopwatch() {
    if (session) {
      setView("stopwatch");
      return;
    }
    const now = new Date().toISOString();
    const nextSession: StopwatchSession = {
      id: uuid(), startedAt: now, pausedAt: null, totalPausedSeconds: 0,
      endedAt: null, elapsedSeconds: null, status: "running", cleanupRecordId: null,
      createdAt: now, updatedAt: now,
    };
    commit({ ...appData, stopwatchSessions: [...appData.stopwatchSessions, nextSession] });
    setView("stopwatch");
  }

  function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const place = appData.places.find((item) => item.id === draft.placeId);
    const activity = appData.activities.find((item) => item.id === draft.activityId);
    if (!place || !activity) {
      announce("場所と片付けた内容を選んでください。");
      return;
    }
    const now = new Date().toISOString();
    if (draft.editingId) {
      const next = {
        ...appData,
        records: appData.records.map((record) => record.id === draft.editingId ? {
          ...record,
          placeId: place.id,
          placeNameSnapshot: place.name,
          activityId: activity.id,
          activityNameSnapshot: activity.name,
          memo: draft.memo.trim() || null,
          updatedAt: now,
        } : record),
      };
      commit(next, "記録を更新しました");
      setView("history");
      return;
    }
    const relatedSession = draft.sessionId
      ? appData.stopwatchSessions.find((item) => item.id === draft.sessionId)
      : null;
    const record: CleanupRecord = {
      id: uuid(),
      localDate: dateInTimezone(new Date(), appData.settings.timezone),
      recordedAt: now,
      placeId: place.id,
      placeNameSnapshot: place.name,
      activityId: activity.id,
      activityNameSnapshot: activity.name,
      memo: draft.memo.trim() || null,
      stopwatchSessionId: relatedSession?.id ?? null,
      elapsedSecondsSnapshot: relatedSession ? stopwatchElapsed(relatedSession) : null,
      createdAt: now,
      updatedAt: now,
    };
    let next: AppData = {
      ...appData,
      records: [...appData.records, record],
      stopwatchSessions: appData.stopwatchSessions.map((item) => item.id === relatedSession?.id
        ? { ...item, status: "recorded", cleanupRecordId: record.id, updatedAt: now }
        : item),
    };
    const grant = grantForNewRecord(next.records, next.recoveryGrants, record.localDate, now);
    if (grant) next = { ...next, recoveryGrants: [...next.recoveryGrants, grant] };
    const earned = earnedBadgeIds(next, record.localDate);
    if (earned.length) {
      next = {
        ...next,
        badgeAwards: [...next.badgeAwards, ...earned.map((badgeId) => ({ badgeId, awardedAt: now, sourceDate: record.localDate }))],
      };
    }
    commit(next, grant ? "7日間の前進でリカバリー権を1つ獲得しました！" : "今日の一歩を記録しました");
    celebrateBadges(earned);
    navigate("home");
    setDraft(emptyDraft);
  }

  function deleteRecord(record: CleanupRecord) {
    const sameDay = appData.records.filter((item) => item.localDate === record.localDate);
    if (record.localDate === today && sameDay.length <= 1) {
      announce("今日の実績を守るため、最後の記録は編集のみ可能です。");
      return;
    }
    if (record.localDate !== today) {
      announce("過去の記録は編集・削除できません。");
      return;
    }
    if (!window.confirm("この記録を削除しますか？今日の片付け日実績は残ります。")) return;
    commit({
      ...appData,
      records: appData.records.filter((item) => item.id !== record.id),
      stopwatchSessions: appData.stopwatchSessions.map((item) => item.cleanupRecordId === record.id
        ? { ...item, status: "discarded", cleanupRecordId: null, updatedAt: new Date().toISOString() }
        : item),
    }, "記録を1件削除しました");
  }

  function useRecovery(targetDate: string) {
    const now = new Date().toISOString();
    if (recoveryBalance(appData) <= 0) return announce("使えるリカバリー権がありません。");
    if (!canUseRecovery(appData, targetDate, now)) {
      return announce("この日にはリカバリー権を使えません。");
    }
    if (!window.confirm(`${formatJapaneseDate(targetDate)}をリカバリー権で守りますか？`)) return;
    commit({ ...appData, recoveryUses: [...appData.recoveryUses, { id: uuid(), targetDate, usedAt: now }] }, "この日の記録をリカバリーしました");
  }

  const body = view === "stopwatch" ? (
    <StopwatchView data={data} session={session} commit={commit} onRecord={openRecord} onBack={() => navigate("home")} announce={announce} />
  ) : view === "record" ? (
    <RecordView data={data} todayRecords={todayRecords} draft={draft} setDraft={setDraft} onSubmit={saveRecord} onCancel={() => navigate("home")} commit={commit} />
  ) : view === "history" ? (
    <HistoryView data={data} today={today} month={calendarMonth} setMonth={setCalendarMonth} selectedDate={selectedDate} setSelectedDate={setSelectedDate} onEdit={openRecord} onDelete={deleteRecord} onRecovery={useRecovery} />
  ) : view === "badges" ? (
    <BadgesView data={data} />
  ) : view === "manage" ? (
    <ManageView data={data} kind={masterKind} setKind={setMasterKind} commit={commit} announce={announce} />
  ) : view === "settings" ? (
    <SettingsView data={data} commit={commit} announce={announce} onManage={() => navigate("manage")} />
  ) : (
    <HomeView data={data} today={today} onStart={startStopwatch} onRecord={() => openRecord()} onHistory={() => navigate("history")} onRecovery={useRecovery} />
  );
  const celebratedBadges = badgeCelebrations.flatMap((badgeId) => {
    const badge = BADGES.find((item) => item.id === badgeId);
    return badge ? [badge] : [];
  });

  return (
    <>
      <BackgroundBackdrop
        key={`${backgroundSettings.backgroundMode}-${backgroundSettings.backgroundImageId}`}
        settings={appData.settings}
      />
      <div className={[
        "app-shell",
        backgroundSettings.backgroundMode === "none" ? "" : "has-background",
        revealingHomeBackground ? "home-background-reveal" : "",
      ].filter(Boolean).join(" ")}>
      <header className="topbar">
        <button className="brand" onClick={() => navigate("home")} aria-label="ホームへ">
          <span aria-hidden="true">○</span> 片付けの一歩
        </button>
      </header>
      {body}
      {!["stopwatch", "record"].includes(view) && (
        <nav className="bottom-nav" aria-label="メインメニュー">
          <NavButton active={view === "home"} label="今日" icon="⌂" onClick={() => navigate("home")} />
          <NavButton active={view === "history"} label="記録" icon="▦" onClick={() => navigate("history")} />
          <NavButton active={view === "badges"} label="バッジ" icon="◇" onClick={() => navigate("badges")} />
          <NavButton active={view === "settings" || view === "manage"} label="設定" icon="⚙" onClick={() => navigate("settings")} />
        </nav>
      )}
      <div className="sr-live" role="status" aria-live="polite">{notice}</div>
      {notice && <div className="toast" aria-hidden="true">{notice}</div>}
      </div>
      {celebratedBadges.length > 0 && (
        <div className="badge-celebration" role="status" aria-live="assertive">
          <div className="badge-celebration-card">
            <p className="eyebrow">新しいバッジを獲得！</p>
            <div className="badge-celebration-medals" aria-hidden="true">
              {celebratedBadges.map((badge) => (
                <span className={`badge-medallion celebration-medal tone-${badge.tone}`} key={badge.id}>
                  <i>{badge.icon}</i>
                </span>
              ))}
            </div>
            <strong>{celebratedBadges.length === 1 ? celebratedBadges[0].name : `${celebratedBadges.length}個のバッジ`}</strong>
            <p>{celebratedBadges.length === 1
              ? celebratedBadges[0].description
              : celebratedBadges.map((badge) => badge.name).join("・")}</p>
          </div>
        </div>
      )}
    </>
  );
}

function NavButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: string; onClick: () => void }) {
  return <button className={active ? "nav-button active" : "nav-button"} aria-current={active ? "page" : undefined} onClick={onClick}><span aria-hidden="true">{icon}</span><small>{label}</small></button>;
}

function HomeView({ data, today, onStart, onRecord, onHistory, onRecovery }: {
  data: AppData; today: string; onStart: () => void; onRecord: () => void; onHistory: () => void; onRecovery: (date: string) => void;
}) {
  const dates = actualDates(data.records);
  const recordedToday = dates.includes(today);
  const streak = protectedCurrentStreak(data, today);
  const longest = longestProtectedStreak(data);
  const monthCount = dates.filter((date) => date.startsWith(today.slice(0, 7))).length;
  const balance = recoveryBalance(data);
  const pendingSession = activeStopwatch(data);
  const yesterday = shiftDate(today, -1);
  const canRecoverYesterday = !dates.includes(yesterday) && !data.recoveryUses.some((use) => use.targetDate === yesterday) && balance > 0;
  const nextBadges = BADGES.filter((badge) => !data.badgeAwards.some((award) => award.badgeId === badge.id)).slice(0, 2);
  const week = Array.from({ length: 7 }, (_, index) => shiftDate(today, index - 6));
  return (
    <main className="screen home-screen">
      <p className="eyebrow">{formatJapaneseDate(today, { year: "numeric", month: "long", day: "numeric", weekday: "long" })}</p>
      <section className={recordedToday ? "today-card done" : "today-card"}>
        <div className="today-mark" aria-hidden="true">{recordedToday ? "✓" : "·"}</div>
        <div><p className="label">今日の一歩</p><h1>{recordedToday ? "片付けできました" : "今日はこれから"}</h1><p>{recordedToday ? `${todayRecordsText(data, today)}件の前進が残っています。` : "1つ戻すだけでも、今日の記録になります。"}</p></div>
      </section>

      <section className="start-panel" aria-labelledby="start-title">
        <p className="eyebrow">最初のきっかけ</p>
        <h2 id="start-title">決めるのは、始めることだけ。</h2>
        <p>時間は0から数えます。目標時間もノルマもありません。</p>
        <button className="primary-button hero-button" onClick={onStart}>{pendingSession ? "▶ 計測中の片付けに戻る" : "▶ 片付けを始める"}</button>
        <button className="text-button" onClick={onRecord}>すでに片付けたので記録する</button>
      </section>

      <section className="stats-grid" aria-label="片付けの実績">
        <article><span>連続</span><strong>{streak}<small>日</small></strong><p>{recordedToday ? "今日もつながりました" : `今日はまだ途中 · 最長${longest}日`}</p></article>
        <article><span>今月</span><strong>{monthCount}<small>日</small></strong><p>小さな前進の数</p></article>
        <article><span>リカバリー</span><strong>{balance}<small>回</small></strong><p>7日連続で1回獲得</p></article>
      </section>

      <section className="week-card">
        <div className="section-heading"><div><p className="eyebrow">直近7日</p><h2>つみかさね</h2></div><button className="text-button" onClick={onHistory}>カレンダーへ</button></div>
        <div className="week-row">
          {week.map((date) => {
            const actual = dates.includes(date);
            const recovered = data.recoveryUses.some((use) => use.targetDate === date);
            return <div className="week-day" key={date}><span>{new Intl.DateTimeFormat("ja-JP", { weekday: "narrow" }).format(new Date(`${date}T12:00:00`))}</span><b className={actual ? "actual" : recovered ? "recovered" : "empty"}>{actual ? "✓" : recovered ? "♢" : new Date(`${date}T12:00:00`).getDate()}</b></div>;
          })}
        </div>
        {canRecoverYesterday && <button className="recovery-callout" onClick={() => onRecovery(yesterday)}>昨日の空白をリカバリーする <span>→</span></button>}
      </section>

      {nextBadges.length > 0 && <section className="badge-preview"><p className="eyebrow">次の楽しみ</p><h2>もう少しで届くバッジ</h2>{nextBadges.map((badge) => {
        const progress = badgeProgress(data, badge.id);
        return <div className="progress-item" key={badge.id}><span className={`badge-icon tone-${badge.tone}`}>{badge.icon}</span><div><strong>{badge.name}</strong><small>{badge.description}</small><progress max={progress.target} value={progress.current}>{progress.current}/{progress.target}</progress></div><b>{progress.current}/{progress.target}</b></div>;
      })}</section>}
    </main>
  );
}

function todayRecordsText(data: AppData, today: string) { return data.records.filter((record) => record.localDate === today).length; }

function StopwatchView({ data, session, commit, onRecord, onBack, announce }: {
  data: AppData; session: StopwatchSession | null; commit: (next: AppData, success?: string) => void; onRecord: (id: string | null) => void; onBack: () => void; announce: (message: string) => void;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (session?.status !== "running") return;
    const timer = setInterval(() => tick((value) => value + 1), 500);
    return () => clearInterval(timer);
  }, [session?.status]);
  if (!session) return <main className="screen centered"><p>計測中の片付けはありません。</p><button className="secondary-button" onClick={onBack}>ホームへ</button></main>;
  const liveSession = session;
  const elapsed = stopwatchElapsed(liveSession);
  function replace(changes: Partial<StopwatchSession>, message?: string) {
    const now = new Date().toISOString();
    commit({ ...data, stopwatchSessions: data.stopwatchSessions.map((item) => item.id === liveSession.id ? { ...item, ...changes, updatedAt: now } : item) }, message);
  }
  function pause() { replace({ status: "paused", pausedAt: new Date().toISOString() }); }
  function resume() {
    const pausedSeconds = liveSession.pausedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(liveSession.pausedAt)) / 1000)) : 0;
    replace({ status: "running", pausedAt: null, totalPausedSeconds: liveSession.totalPausedSeconds + pausedSeconds });
  }
  function stop() { const seconds = stopwatchElapsed(liveSession); replace({ status: "stopped", endedAt: new Date().toISOString(), elapsedSeconds: seconds }, "おつかれさまでした。小さな前進を記録できます。"); }
  function discard() {
    if (!window.confirm("計測を記録せずに終了しますか？ペナルティはありません。")) return;
    replace({ status: "discarded", endedAt: new Date().toISOString(), elapsedSeconds: elapsed });
    announce("計測を終了しました。またいつでも始められます。");
    onBack();
  }
  return (
    <main className="screen stopwatch-screen">
      <button className="back-button" onClick={onBack}>← ホーム</button>
      <div className="stopwatch-copy"><p className="eyebrow">今、片付け中</p><h1>少しだけでも十分です。</h1><p>やめたいと思ったときが、終わりの時間です。</p></div>
      <div className="stopwatch-time" aria-live="off" aria-label={`経過時間 ${formatElapsed(elapsed)}`}>{formatElapsed(elapsed)}</div>
      <div className="stopwatch-actions">
        {liveSession.status === "running" && <button className="secondary-button" onClick={pause}>一時停止</button>}
        {liveSession.status === "paused" && <button className="secondary-button" onClick={resume}>再開する</button>}
        {liveSession.status !== "stopped" && <button className="primary-button" onClick={stop}>片付けを終える</button>}
        {liveSession.status === "stopped" && <button className="primary-button" onClick={() => onRecord(liveSession.id)}>この片付けを記録する</button>}
      </div>
      <button className="text-button muted" onClick={discard}>記録せずに終了</button>
    </main>
  );
}

function RecordView({ data, todayRecords, draft, setDraft, onSubmit, onCancel, commit }: {
  data: AppData; todayRecords: CleanupRecord[]; draft: RecordDraft; setDraft: (draft: RecordDraft) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void; commit: (next: AppData, success?: string) => void;
}) {
  const [quickKind, setQuickKind] = useState<"places" | "activities" | null>(null);
  const [quickName, setQuickName] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogInputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // Keep archived choices visible while editing a record that already uses one.
  // This lets the user update the memo without first restoring the master item.
  const places = data.places.filter((item) => !item.isArchived || item.id === draft.placeId).sort((a, b) => a.sortOrder - b.sortOrder);
  const activities = data.activities.filter((item) => !item.isArchived || item.id === draft.activityId).sort((a, b) => a.sortOrder - b.sortOrder);
  const session = draft.sessionId ? data.stopwatchSessions.find((item) => item.id === draft.sessionId) : null;
  const canSubmit = Boolean(draft.placeId && draft.activityId);

  useEffect(() => {
    if (!quickKind) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogInputRef.current?.focus();
    function handleDialogKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setQuickKind(null);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleDialogKey);
    return () => {
      document.removeEventListener("keydown", handleDialogKey);
      previousFocusRef.current?.focus();
    };
  }, [quickKind]);

  function quickAdd() {
    const name = quickName.trim();
    if (!name || !quickKind) return;
    const now = new Date().toISOString();
    const item: MasterItem = { id: uuid(), name, sortOrder: data[quickKind].length, isArchived: false, createdAt: now, updatedAt: now };
    const next = { ...data, [quickKind]: [...data[quickKind], item] } as AppData;
    commit(next, `「${name}」を追加しました`);
    setDraft({ ...draft, [quickKind === "places" ? "placeId" : "activityId"]: item.id });
    setQuickKind(null); setQuickName("");
  }
  return (
    <main className="screen record-screen">
      <button className="back-button" onClick={onCancel}>← 戻る</button>
      <p className="eyebrow">{draft.editingId ? "記録を編集" : "今日の一歩"}</p>
      <h1>{draft.editingId ? "内容を整える" : "何を片付けましたか？"}</h1>
      {todayRecords.length > 0 && !draft.editingId && <p className="gentle-note">今日はすでに記録済みです。追加の片付けも残せます。</p>}
      {session && <div className="elapsed-note">計測した時間 <strong>{formatElapsed(stopwatchElapsed(session))}</strong><small>時間の長さは実績の条件には使いません</small></div>}
      <form onSubmit={onSubmit}>
        <fieldset><legend>1. 片付けた場所</legend><div className="choice-grid">{places.map((place) => <label className={draft.placeId === place.id ? "choice selected" : "choice"} key={place.id}><input type="radio" name="place" value={place.id} checked={draft.placeId === place.id} onChange={() => setDraft({ ...draft, placeId: place.id })} />{place.name}</label>)}</div><button type="button" className="add-inline" onClick={() => setQuickKind("places")}>＋ 場所を追加</button></fieldset>
        <fieldset><legend>2. 片付けた内容</legend><div className="choice-grid">{activities.map((activity) => <label className={draft.activityId === activity.id ? "choice selected" : "choice"} key={activity.id}><input type="radio" name="activity" value={activity.id} checked={draft.activityId === activity.id} onChange={() => setDraft({ ...draft, activityId: activity.id })} />{activity.name}</label>)}</div><button type="button" className="add-inline" onClick={() => setQuickKind("activities")}>＋ 内容を追加</button></fieldset>
        <label className="memo-label">3. メモ <span>任意</span><textarea rows={3} maxLength={500} value={draft.memo} onChange={(event) => setDraft({ ...draft, memo: event.target.value })} placeholder="今日やったこと、気づいたこと…" /></label>
        <p className={canSubmit ? "submit-help ready" : "submit-help"} id="record-submit-help" role="status">
          {canSubmit ? "準備できました。小さな一歩を残しましょう。" : `あと${draft.placeId ? "「片付けた内容」" : draft.activityId ? "「片付けた場所」" : "「場所」と「片付けた内容」"}を選んでください。`}
        </p>
        <button className="primary-button sticky-submit" type="submit" disabled={!canSubmit} aria-describedby="record-submit-help">{draft.editingId ? "変更を保存" : "今日の一歩を記録"}</button>
      </form>
      {quickKind && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setQuickKind(null); }}><div className="dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="quick-title" aria-describedby="quick-description"><h2 id="quick-title">{quickKind === "places" ? "場所" : "内容"}を追加</h2><p id="quick-description">記録で選べる項目として追加します。</p><label htmlFor="quick-name">名前<input ref={dialogInputRef} id="quick-name" maxLength={40} value={quickName} onChange={(event) => setQuickName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); if (quickName.trim()) quickAdd(); } }} /></label><div className="dialog-actions"><button type="button" className="text-button" onClick={() => setQuickKind(null)}>キャンセル</button><button type="button" className="primary-button" onClick={quickAdd} disabled={!quickName.trim()}>追加する</button></div></div></div>}
    </main>
  );
}

function HistoryView({ data, today, month, setMonth, selectedDate, setSelectedDate, onEdit, onDelete, onRecovery }: {
  data: AppData; today: string; month: string; setMonth: (month: string) => void; selectedDate: string | null; setSelectedDate: (date: string | null) => void; onEdit: (sessionId: string | null, record: CleanupRecord) => void; onDelete: (record: CleanupRecord) => void; onRecovery: (date: string) => void;
}) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1).getDay();
  const days = new Date(year, monthNumber, 0).getDate();
  const cells: (string | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  const actual = new Set(actualDates(data.records));
  const recovered = new Set(data.recoveryUses.map((use) => use.targetDate));
  const currentMonth = today.slice(0, 7);
  const date = selectedDate ?? today;
  const records = data.records.filter((record) => record.localDate === date).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  function move(amount: number) { const next = new Date(year, monthNumber - 1 + amount, 1); setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`); setSelectedDate(null); }
  return <main className="screen"><p className="eyebrow">記録の見える化</p><h1>小さな前進のカレンダー</h1>
    <section className="calendar-card"><div className="calendar-head"><button aria-label="前の月" onClick={() => move(-1)}>‹</button><h2 aria-live="polite">{year}年{monthNumber}月</h2><button aria-label="次の月" onClick={() => move(1)} disabled={month >= currentMonth}>›</button></div><div className="calendar-grid week-labels">{["日","月","火","水","木","金","土"].map((label) => <span key={label}>{label}</span>)}</div><div className="calendar-grid">{cells.map((cell, index) => cell ? <button key={cell} className={["calendar-day", cell === today ? "today" : "", cell > today ? "future" : "", actual.has(cell) ? "actual" : recovered.has(cell) ? "recovered" : "", selectedDate === cell ? "selected" : ""].join(" ")} onClick={() => setSelectedDate(cell)} disabled={cell > today} aria-current={cell === today ? "date" : undefined} aria-label={`${formatJapaneseDate(cell)} ${cell > today ? "未来の日付" : actual.has(cell) ? "片付け済み" : recovered.has(cell) ? "リカバリー済み" : "記録なし"}`}><span>{Number(cell.slice(-2))}</span>{actual.has(cell) && <b aria-hidden="true">✓</b>}{recovered.has(cell) && <b aria-hidden="true">♢</b>}</button> : <span key={`blank-${index}`} aria-hidden="true" />)}</div><div className="legend"><span><i className="actual" />片付けた日</span><span><i className="recovered" />リカバリー日</span><span><i className="empty" />まだ記録のない日</span></div></section>
    <section className="history-list"><div className="section-heading"><div><p className="eyebrow">選択中</p><h2>{formatJapaneseDate(date)}</h2></div></div>{records.length ? records.map((record) => <article className="record-card" key={record.id}><div><strong>{record.placeNameSnapshot}</strong><span>{record.activityNameSnapshot}</span></div>{record.memo && <p>{record.memo}</p>}{record.elapsedSecondsSnapshot !== null && <small>計測 {formatElapsed(record.elapsedSecondsSnapshot)}</small>}{record.localDate === today && <div className="record-actions"><button onClick={() => onEdit(record.stopwatchSessionId, record)}>編集</button><button onClick={() => onDelete(record)}>削除</button></div>}</article>) : <div className="empty-state"><span aria-hidden="true">○</span><p>{date === today ? "今日はこれから。1つ動かすだけでも十分です。" : "この日は、ひと休みした日です。"}</p>{date < today && !recovered.has(date) && recoveryBalance(data) > 0 && <button className="secondary-button" onClick={() => onRecovery(date)}>リカバリー権で守る</button>}</div>}</section>
  </main>;
}

function BadgesView({ data }: { data: AppData }) {
  const awards = new Map(data.badgeAwards.map((award) => [award.badgeId, award]));
  const earnedCount = awards.size;
  const groups = [
    { id: "short", title: "まずは一歩", description: "今日から1週間の小さな達成" },
    { id: "habit", title: "習慣を育てる", description: "10日から30日までの節目" },
    { id: "special", title: "暮らしの冒険", description: "場所の広がりと、続ける工夫" },
  ] as const;

  return (
    <main className="screen badges-screen">
      <p className="eyebrow">つみかさねの証</p>
      <h1>あなたのバッジ</h1>
      <p className="lead">大きさや時間ではなく、一歩を重ねたことを称えます。</p>

      <section className="badge-overview" aria-label={`${BADGES.length}個中${earnedCount}個のバッジを獲得`}>
        <div className="badge-total"><strong>{earnedCount}</strong><span>/ {BADGES.length}</span></div>
        <div><strong>{earnedCount ? "集まってきました" : "ここから始まります"}</strong><progress max={BADGES.length} value={earnedCount}>{earnedCount}/{BADGES.length}</progress><small>「獲得済み」のバッジが集めた証です</small></div>
      </section>

      {groups.map((group) => {
        const badges = BADGES.filter((badge) => badge.category === group.id);
        const groupEarned = badges.filter((badge) => awards.has(badge.id)).length;
        return (
          <section className="badge-section" key={group.id} aria-labelledby={`badge-group-${group.id}`}>
            <div className="badge-section-heading">
              <div><p className="eyebrow">{group.description}</p><h2 id={`badge-group-${group.id}`}>{group.title}</h2></div>
              <span>{groupEarned} / {badges.length}</span>
            </div>
            <div className="badge-grid">
              {badges.map((badge) => {
                const award = awards.get(badge.id);
                const progress = badgeProgress(data, badge.id);
                const remaining = Math.max(0, progress.target - progress.current);
                return (
                  <article className={`badge-card tone-${badge.tone}${award ? " earned" : ""}`} key={badge.id}>
                    <span className="badge-medallion" aria-hidden="true"><i>{badge.icon}</i></span>
                    <span className="badge-status">{award ? "獲得済み" : "未獲得"}</span>
                    <h3>{badge.name}</h3>
                    <p>{badge.description}</p>
                    {award ? (
                      <small className="badge-earned-date">{formatJapaneseDate(award.sourceDate ?? award.awardedAt.slice(0,10))}</small>
                    ) : badge.category === "special" ? (
                      <small className="badge-special-hint">特別チャレンジ</small>
                    ) : (
                      <div className="badge-progress">
                        <progress aria-label={`${badge.name}の進捗`} max={progress.target} value={progress.current} />
                        <small>{remaining > 0 ? `あと${remaining}` : "達成済み"} · {progress.current}/{progress.target}</small>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}

function ManageView({ data, kind, setKind, commit, announce }: { data: AppData; kind: "places" | "activities"; setKind: (kind: "places" | "activities") => void; commit: (data: AppData, message?: string) => void; announce: (message: string) => void }) {
  const [newName, setNewName] = useState("");
  const items = [...data[kind]].sort((a, b) => a.sortOrder - b.sortOrder);
  function add() { const name = newName.trim(); if (!name) return; const now = new Date().toISOString(); const item: MasterItem = { id: uuid(), name, sortOrder: items.length, isArchived: false, createdAt: now, updatedAt: now }; commit({ ...data, [kind]: [...data[kind], item] } as AppData, `「${name}」を追加しました`); setNewName(""); }
  function rename(item: MasterItem) { const name = window.prompt("新しい名前", item.name)?.trim(); if (!name || name === item.name) return; const now = new Date().toISOString(); commit({ ...data, [kind]: data[kind].map((entry) => entry.id === item.id ? { ...entry, name, updatedAt: now } : entry) } as AppData, "名前を更新しました"); }
  function archive(item: MasterItem) { const now = new Date().toISOString(); commit({ ...data, [kind]: data[kind].map((entry) => entry.id === item.id ? { ...entry, isArchived: !entry.isArchived, updatedAt: now } : entry) } as AppData, item.isArchived ? "再び使えるようにしました" : "アーカイブしました"); }
  function move(item: MasterItem, amount: number) { const visible = items.filter((entry) => entry.isArchived === item.isArchived); const at = visible.findIndex((entry) => entry.id === item.id); const swap = visible[at + amount]; if (!swap) return announce("これ以上は移動できません。"); const nextItems = data[kind].map((entry) => entry.id === item.id ? { ...entry, sortOrder: swap.sortOrder } : entry.id === swap.id ? { ...entry, sortOrder: item.sortOrder } : entry); commit({ ...data, [kind]: nextItems } as AppData); }
  return <main className="screen"><p className="eyebrow">自分の暮らしに合わせる</p><h1>場所と内容</h1><div className="segmented" aria-label="管理する項目"><button aria-pressed={kind === "places"} className={kind === "places" ? "active" : ""} onClick={() => setKind("places")}>場所</button><button aria-pressed={kind === "activities"} className={kind === "activities" ? "active" : ""} onClick={() => setKind("activities")}>片付けた内容</button></div><div className="add-row"><label htmlFor="master-name" className="sr-only">新しい{kind === "places" ? "場所" : "内容"}</label><input id="master-name" maxLength={40} value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={`新しい${kind === "places" ? "場所" : "内容"}`} onKeyDown={(event) => { if (event.key === "Enter") add(); }} /><button className="primary-button" onClick={add} disabled={!newName.trim()}>追加</button></div><div className="master-list">{items.map((item) => <article className={item.isArchived ? "master-item archived" : "master-item"} key={item.id}><span>{item.name}{item.isArchived && <small>アーカイブ中</small>}</span><div><button aria-label={`${item.name}を上へ`} onClick={() => move(item,-1)}>↑</button><button aria-label={`${item.name}を下へ`} onClick={() => move(item,1)}>↓</button><button onClick={() => rename(item)}>編集</button><button onClick={() => archive(item)}>{item.isArchived ? "戻す" : "休止"}</button></div></article>)}</div></main>;
}

function SettingsView({ data, commit, announce, onManage }: { data: AppData; commit: (data: AppData, message?: string) => void; announce: (message: string) => void; onManage: () => void }) {
  const background = resolveBackgroundSettings(data.settings);

  function updateBackground(settings: Partial<AppData["settings"]>) {
    commit({ ...data, settings: { ...data.settings, ...settings } });
  }

  function setBackgroundMode(backgroundMode: BackgroundMode) {
    updateBackground({ backgroundMode });
  }

  function exportData() {
    const now = new Date().toISOString();
    const next = { ...data, settings: { ...data.settings, lastBackupAt: now } };
    commit(next);
    const blob = new Blob([JSON.stringify(next, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `katazuke-backup-${dateInTimezone(new Date(), data.settings.timezone)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    announce("バックアップを書き出しました");
  }

  async function importData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error("too-large");
      const candidate: unknown = JSON.parse(await file.text());
      const restored = migrateBackup(candidate);
      if (!restored) throw new Error("invalid");
      if (!window.confirm("現在のデータを、読み込むバックアップで全て置き換えますか？")) return;
      const prepared = backfillBadgeAwards(restored);
      await saveData(prepared);
      commit(prepared, "バックアップを復元しました");
    } catch {
      announce("このファイルは読み込めません。現在のデータは変更されていません。");
    }
  }

  return (
    <main className="screen">
      <p className="eyebrow">自分に合う使い方へ</p>
      <h1>設定</h1>
      <section className="settings-card background-settings-card">
        <h2>背景</h2>
        <p>綺麗になった部屋を思い描いて頑張りましょう！</p>
        <div className="background-mode-picker" aria-label="背景の表示方法">
          {([
            ["none", "なし"],
            ["fixed", "1枚固定"],
            ["slideshow", "自動切替"],
          ] as const).map(([mode, label]) => (
            <button
              type="button"
              key={mode}
              className={background.backgroundMode === mode ? "active" : ""}
              aria-pressed={background.backgroundMode === mode}
              onClick={() => setBackgroundMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="background-fade-setting">
          <div>
            <strong>ホームのフェードイン</strong>
            <small>ホームを開くたび、背景からゆっくり画面を表示します</small>
          </div>
          <button
            type="button"
            className={background.homeBackgroundFadeEnabled ? "toggle-switch active" : "toggle-switch"}
            role="switch"
            aria-checked={background.homeBackgroundFadeEnabled}
            aria-label="ホームのフェードイン"
            onClick={() => updateBackground({ homeBackgroundFadeEnabled: !background.homeBackgroundFadeEnabled })}
          >
            <span aria-hidden="true" />
          </button>
        </div>

        <div className="background-setting-heading">
          <strong>{background.backgroundMode === "slideshow" ? "最初に表示する部屋" : "表示する部屋"}</strong>
          <small>{background.backgroundMode === "none" ? "選択内容は次回の表示用に保存されます" : "タップするとすぐに反映されます"}</small>
        </div>
        <div className="background-picker" aria-label="背景画像を選択">
          {BACKGROUND_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.id}
              className={background.backgroundImageId === option.id ? "background-option selected" : "background-option"}
              aria-pressed={background.backgroundImageId === option.id}
              onClick={() => updateBackground({ backgroundImageId: option.id })}
            >
              <img src={backgroundAssetUrl(option.fileName)} alt="" loading="lazy" />
              <span>{option.label}</span>
              {background.backgroundImageId === option.id && <b aria-hidden="true">✓</b>}
            </button>
          ))}
        </div>

        {background.backgroundMode === "slideshow" && (
          <div className="background-interval">
            <div><label htmlFor="background-interval">切替間隔</label><b>{background.backgroundIntervalSeconds}秒</b></div>
            <input
              id="background-interval"
              type="range"
              min="5"
              max="10"
              step="1"
              value={background.backgroundIntervalSeconds}
              aria-valuetext={`${background.backgroundIntervalSeconds}秒`}
              onChange={(event) => updateBackground({ backgroundIntervalSeconds: Number(event.target.value) })}
            />
            <small><span>5秒</span><span>10秒</span></small>
          </div>
        )}
        <p className="background-note">背景は画面に固定され、アプリの内容だけがその上をスクロールします。</p>
      </section>

      <section className="settings-card">
        <h2>場所と片付けた内容</h2>
        <p>記録するときに選ぶ項目を追加・編集・休止できます。</p>
        <button className="secondary-button settings-link" onClick={onManage}>場所と内容を管理する <span aria-hidden="true">→</span></button>
      </section>
      <section className="settings-card">
        <h2>バックアップ</h2>
        <p>記録はこの端末内に保存されます。定期的にファイルを保存しておくと安心です。</p>
        {data.settings.lastBackupAt && <small>最終書き出し：{new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.settings.lastBackupAt))}</small>}
        <button className="primary-button" onClick={exportData}>JSONを書き出す</button>
        <label className="file-button">JSONから復元<input type="file" accept="application/json,.json" onChange={importData} /></label>
      </section>
      <p className="app-note">片付けの一歩 v0.1.0 · データは端末内に保存</p>
    </main>
  );
}
