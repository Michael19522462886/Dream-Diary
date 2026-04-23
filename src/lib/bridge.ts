import { invoke } from "@tauri-apps/api/core";
import type { JSONContent } from "@tiptap/core";
import type {
  BootstrapState,
  DraftSnapshot,
  JournalEntry,
  SaveEntryInput,
  SearchResult,
  UpdateSettingsInput,
} from "../state/types";
import { nowIso, todayEntryDate } from "./date";

const DEV_STORAGE_KEY = "dream-diary-preview-db";

type DevDatabase = {
  settings: {
    theme: string;
    fontScale: number;
    lastOpenedDate: string;
  };
  auth: {
    passwordHash?: string;
  };
  entries: Record<string, JournalEntry>;
  drafts: Record<string, DraftSnapshot>;
};

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

function getEmptyDoc(): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}

function createEmptyEntry(entryDate: string): JournalEntry {
  const now = nowIso();

  return {
    id: entryDate,
    entryDate,
    title: "",
    mood: "",
    weather: "",
    contentJson: getEmptyDoc(),
    excerpt: "",
    createdAt: now,
    updatedAt: now,
  };
}

function loadPreviewDb(): DevDatabase {
  const fallback: DevDatabase = {
    settings: {
      theme: "dreamscape",
      fontScale: 1,
      lastOpenedDate: todayEntryDate(),
    },
    auth: {},
    entries: {},
    drafts: {},
  };

  const raw = localStorage.getItem(DEV_STORAGE_KEY);
  if (!raw) {
    return fallback;
  }

  try {
    return {
      ...fallback,
      ...JSON.parse(raw),
    } satisfies DevDatabase;
  } catch {
    return fallback;
  }
}

function savePreviewDb(db: DevDatabase): void {
  localStorage.setItem(DEV_STORAGE_KEY, JSON.stringify(db));
}

async function hashPreviewPassword(password: string): Promise<string> {
  const payload = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

export async function bootstrapApp(): Promise<BootstrapState> {
  if (isTauriRuntime()) {
    return invoke<BootstrapState>("bootstrap_app");
  }

  const db = loadPreviewDb();
  return {
    settings: db.settings,
    auth: {
      lockEnabled: Boolean(db.auth.passwordHash),
      needsPasswordSetup: !db.auth.passwordHash,
    },
    previewMode: true,
  };
}

export async function setupPassword(password: string): Promise<void> {
  if (isTauriRuntime()) {
    return invoke("setup_password", { password });
  }

  const db = loadPreviewDb();
  db.auth.passwordHash = await hashPreviewPassword(password);
  savePreviewDb(db);
}

export async function unlockApp(password: string): Promise<void> {
  if (isTauriRuntime()) {
    return invoke("unlock_app", { password });
  }

  const db = loadPreviewDb();
  const currentHash = await hashPreviewPassword(password);
  if (db.auth.passwordHash !== currentHash) {
    throw new Error("密码不正确");
  }
}

export async function getEntryByDate(entryDate: string): Promise<JournalEntry> {
  if (isTauriRuntime()) {
    return invoke<JournalEntry>("get_entry_by_date", { entryDate });
  }

  const db = loadPreviewDb();
  return db.entries[entryDate] ?? createEmptyEntry(entryDate);
}

export async function saveEntry(input: SaveEntryInput): Promise<JournalEntry> {
  if (isTauriRuntime()) {
    return invoke<JournalEntry>("save_entry", { input });
  }

  const db = loadPreviewDb();
  const existing = db.entries[input.entryDate] ?? createEmptyEntry(input.entryDate);
  const nextEntry: JournalEntry = {
    ...existing,
    title: input.title,
    mood: input.mood,
    weather: input.weather,
    contentJson: input.contentJson,
    excerpt: input.excerpt,
    updatedAt: nowIso(),
  };

  db.entries[input.entryDate] = nextEntry;
  delete db.drafts[input.entryDate];
  db.settings.lastOpenedDate = input.entryDate;
  savePreviewDb(db);
  return nextEntry;
}

export async function searchEntries(query: string): Promise<SearchResult[]> {
  if (isTauriRuntime()) {
    return invoke<SearchResult[]>("search_entries", { query, limit: 12 });
  }

  const db = loadPreviewDb();
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }

  return Object.values(db.entries)
    .filter((entry) => {
      const haystack = `${entry.title} ${entry.excerpt}`.toLowerCase();
      return haystack.includes(needle);
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 12)
    .map((entry) => ({
      id: entry.id,
      entryDate: entry.entryDate,
      title: entry.title || "未命名日记",
      excerpt: entry.excerpt,
      updatedAt: entry.updatedAt,
    }));
}

export async function updateSettings(input: UpdateSettingsInput): Promise<void> {
  if (isTauriRuntime()) {
    return invoke("update_settings", { input });
  }

  const db = loadPreviewDb();
  db.settings = {
    ...db.settings,
    ...input,
  };
  savePreviewDb(db);
}

export async function getDraftSnapshot(entryDate: string): Promise<DraftSnapshot | null> {
  if (isTauriRuntime()) {
    return invoke<DraftSnapshot | null>("get_draft_snapshot", { entryDate });
  }

  const db = loadPreviewDb();
  return db.drafts[entryDate] ?? null;
}

export async function saveDraftSnapshot(input: SaveEntryInput): Promise<DraftSnapshot> {
  if (isTauriRuntime()) {
    return invoke<DraftSnapshot>("save_draft_snapshot", { input });
  }

  const db = loadPreviewDb();
  const snapshot: DraftSnapshot = {
    id: input.entryDate,
    entryDate: input.entryDate,
    title: input.title,
    mood: input.mood,
    weather: input.weather,
    contentJson: input.contentJson,
    excerpt: input.excerpt,
    capturedAt: nowIso(),
  };

  db.drafts[input.entryDate] = snapshot;
  savePreviewDb(db);
  return snapshot;
}

export async function clearDraftSnapshot(entryDate: string): Promise<void> {
  if (isTauriRuntime()) {
    return invoke("clear_draft_snapshot", { entryDate });
  }

  const db = loadPreviewDb();
  delete db.drafts[entryDate];
  savePreviewDb(db);
}
