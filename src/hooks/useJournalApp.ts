import { useEffect, useMemo, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import {
  bootstrapApp,
  clearDraftSnapshot,
  getDraftSnapshot,
  getEntryByDate,
  saveEntry,
  saveDraftSnapshot,
  searchEntries,
  setupPassword,
  unlockApp,
  updateSettings,
} from "../lib/bridge";
import {
  buildRecentDates,
  formatDiaryDate,
  formatDiaryTimestamp,
  isSameEntryDate,
  shiftEntryDate,
  todayEntryDate,
  trimExcerpt,
} from "../lib/date";
import type {
  AuthMode,
  DraftSnapshot,
  JournalEntry,
  SaveState,
  SearchResult,
  TurnDirection,
} from "../state/types";

function serializeEntry(entry: Pick<JournalEntry, "entryDate" | "title" | "mood" | "weather" | "contentJson" | "excerpt">): string {
  return JSON.stringify({
    entryDate: entry.entryDate,
    title: entry.title,
    mood: entry.mood,
    weather: entry.weather,
    contentJson: entry.contentJson,
    excerpt: entry.excerpt,
  });
}

function shouldOfferDraftRestore(entry: JournalEntry, draft: DraftSnapshot): boolean {
  if (serializeEntry(entry) !== serializeEntry(draft)) {
    return true;
  }

  return new Date(draft.capturedAt).getTime() > new Date(entry.updatedAt).getTime();
}

export function useJournalApp() {
  const [authMode, setAuthMode] = useState<AuthMode>("checking");
  const [previewMode, setPreviewMode] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayEntryDate());
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [isTurning, setIsTurning] = useState(false);
  const [turnDirection, setTurnDirection] = useState<TurnDirection>("forward");
  const [loadingEntry, setLoadingEntry] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [pageMotionKey, setPageMotionKey] = useState(0);
  const [entryHeading, setEntryHeading] = useState(formatDiaryDate(todayEntryDate()));
  const [restorableDraft, setRestorableDraft] = useState<DraftSnapshot | null>(null);

  const persistedSnapshot = useRef("");
  const saveTimer = useRef<number | null>(null);
  const searchTimer = useRef<number | null>(null);
  const turnLoadTimer = useRef<number | null>(null);
  const turnResetTimer = useRef<number | null>(null);
  const draftTimer = useRef<number | null>(null);

  useEffect(() => {
    let disposed = false;

    async function boot() {
      try {
        const bootState = await bootstrapApp();
        if (disposed) {
          return;
        }

        setPreviewMode(bootState.previewMode);
        setSelectedDate(bootState.settings.lastOpenedDate);
        setEntryHeading(formatDiaryDate(bootState.settings.lastOpenedDate));
        setAuthMode(bootState.auth.needsPasswordSetup ? "setup" : "locked");
      } catch (error) {
        if (!disposed) {
          setErrorMessage(error instanceof Error ? error.message : "初始化失败");
        }
      }
    }

    void boot();

    return () => {
      disposed = true;
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
      }
      if (searchTimer.current) {
        window.clearTimeout(searchTimer.current);
      }
      if (turnLoadTimer.current) {
        window.clearTimeout(turnLoadTimer.current);
      }
      if (turnResetTimer.current) {
        window.clearTimeout(turnResetTimer.current);
      }
      if (draftTimer.current) {
        window.clearTimeout(draftTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (authMode !== "ready" || !entry) {
      return;
    }

    const nextSnapshot = serializeEntry(entry);
    if (nextSnapshot === persistedSnapshot.current) {
      return;
    }

    setSaveState("saving");
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
    }

    saveTimer.current = window.setTimeout(async () => {
      try {
        const savedEntry = await saveEntry({
          entryDate: entry.entryDate,
          title: entry.title,
          mood: entry.mood,
          weather: entry.weather,
          contentJson: entry.contentJson,
          excerpt: entry.excerpt,
        });
        await clearDraftSnapshot(savedEntry.entryDate);
        persistedSnapshot.current = serializeEntry(savedEntry);
        setEntry(savedEntry);
        setRestorableDraft(null);
        setSaveState("saved");
      } catch (error) {
        setSaveState("error");
        setErrorMessage(error instanceof Error ? error.message : "自动保存失败");
      }
    }, 650);
  }, [authMode, entry]);

  useEffect(() => {
    if (authMode !== "ready" || !entry) {
      return;
    }

    const nextSnapshot = serializeEntry(entry);
    if (nextSnapshot === persistedSnapshot.current) {
      return;
    }

    if (draftTimer.current) {
      window.clearTimeout(draftTimer.current);
    }

    draftTimer.current = window.setTimeout(() => {
      void saveDraftSnapshot({
        entryDate: entry.entryDate,
        title: entry.title,
        mood: entry.mood,
        weather: entry.weather,
        contentJson: entry.contentJson,
        excerpt: entry.excerpt,
      }).catch(() => {
        // Draft cache is best-effort; keep the main editing flow responsive.
      });
    }, 220);
  }, [authMode, entry]);

  useEffect(() => {
    if (authMode !== "ready") {
      return;
    }

    const needle = searchQuery.trim();
    if (!needle) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    if (searchTimer.current) {
      window.clearTimeout(searchTimer.current);
    }

    searchTimer.current = window.setTimeout(async () => {
      try {
        const results = await searchEntries(needle);
        setSearchResults(results);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "搜索失败");
      } finally {
        setSearching(false);
      }
    }, 240);
  }, [authMode, searchQuery]);

  const recentDates = useMemo(() => buildRecentDates(selectedDate, 4), [selectedDate]);

  async function loadEntry(entryDate: string) {
    setLoadingEntry(true);
    setErrorMessage("");
    setRestorableDraft(null);

    try {
      const loadedEntry = await getEntryByDate(entryDate);
      const draft = await getDraftSnapshot(entryDate);

      if (draft && shouldOfferDraftRestore(loadedEntry, draft)) {
        setRestorableDraft(draft);
      } else if (draft) {
        await clearDraftSnapshot(entryDate);
      }

      persistedSnapshot.current = serializeEntry(loadedEntry);
      setEntry(loadedEntry);
      setEntryHeading(formatDiaryDate(entryDate));
      await updateSettings({ lastOpenedDate: entryDate });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载日记失败");
    } finally {
      setLoadingEntry(false);
    }
  }

  async function handleAuth(password: string) {
    const normalized = password.trim();
    if (!normalized) {
      setErrorMessage("请输入密码");
      return false;
    }

    setErrorMessage("");

    try {
      if (authMode === "setup") {
        await setupPassword(normalized);
      } else {
        await unlockApp(normalized);
      }

      setAuthMode("ready");
      await loadEntry(selectedDate);
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "解锁失败");
      return false;
    }
  }

  async function openDate(nextDate: string) {
    if (authMode !== "ready" || isSameEntryDate(nextDate, selectedDate)) {
      return;
    }

    setTurnDirection(nextDate > selectedDate ? "forward" : "backward");
    setIsTurning(true);
    setPageMotionKey((current) => current + 1);

    if (turnLoadTimer.current) {
      window.clearTimeout(turnLoadTimer.current);
    }
    if (turnResetTimer.current) {
      window.clearTimeout(turnResetTimer.current);
    }

    turnLoadTimer.current = window.setTimeout(() => {
      setSelectedDate(nextDate);
      void loadEntry(nextDate);
    }, 180);

    turnResetTimer.current = window.setTimeout(() => {
      setIsTurning(false);
    }, 620);
  }

  function updateTitle(title: string) {
    setEntry((current) =>
      current
        ? {
            ...current,
            title,
          }
        : current,
    );
  }

  function updateMood(mood: string) {
    setEntry((current) =>
      current
        ? {
            ...current,
            mood,
          }
        : current,
    );
  }

  function updateWeather(weather: string) {
    setEntry((current) =>
      current
        ? {
            ...current,
            weather,
          }
        : current,
    );
  }

  function updateContent(contentJson: JSONContent, plainText: string) {
    setEntry((current) =>
      current
        ? {
            ...current,
            contentJson,
            excerpt: trimExcerpt(plainText, 120),
          }
        : current,
    );
  }

  function restoreDraftSnapshot() {
    if (!restorableDraft) {
      return;
    }

    setEntry((current) =>
      current
        ? {
            ...current,
            title: restorableDraft.title,
            mood: restorableDraft.mood,
            weather: restorableDraft.weather,
            contentJson: restorableDraft.contentJson,
            excerpt: restorableDraft.excerpt,
          }
        : current,
    );
    setRestorableDraft(null);
  }

  async function dismissDraftSnapshot() {
    if (!restorableDraft) {
      return;
    }

    const entryDate = restorableDraft.entryDate;
    setRestorableDraft(null);
    await clearDraftSnapshot(entryDate);
  }

  return {
    authMode,
    previewMode,
    selectedDate,
    entry,
    entryHeading,
    recentDates,
    saveState,
    isTurning,
    turnDirection,
    loadingEntry,
    searchQuery,
    searchResults,
    searching,
    errorMessage,
    pageMotionKey,
    restorableDraft,
    lastEditedLabel: entry
      ? formatDiaryTimestamp(restorableDraft?.capturedAt ?? entry.updatedAt)
      : "",
    canEdit: authMode === "ready" && Boolean(entry),
    onAuthSubmit: handleAuth,
    onOpenDate: openDate,
    onOpenPreviousDay: () => openDate(shiftEntryDate(selectedDate, -1)),
    onOpenNextDay: () => openDate(shiftEntryDate(selectedDate, 1)),
    onOpenToday: () => openDate(todayEntryDate()),
    onUpdateTitle: updateTitle,
    onUpdateMood: updateMood,
    onUpdateWeather: updateWeather,
    onUpdateContent: updateContent,
    onRestoreDraft: restoreDraftSnapshot,
    onDismissDraft: dismissDraftSnapshot,
    onSearchQueryChange: setSearchQuery,
  };
}
