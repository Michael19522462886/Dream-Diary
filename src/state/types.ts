import type { JSONContent } from "@tiptap/core";

export interface JournalEntry {
  id: string;
  entryDate: string;
  title: string;
  mood: string;
  weather: string;
  contentJson: JSONContent;
  excerpt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  theme: string;
  fontScale: number;
  lastOpenedDate: string;
}

export interface AuthState {
  lockEnabled: boolean;
  needsPasswordSetup: boolean;
}

export interface BootstrapState {
  settings: AppSettings;
  auth: AuthState;
  previewMode: boolean;
}

export interface SearchResult {
  id: string;
  entryDate: string;
  title: string;
  excerpt: string;
  updatedAt: string;
}

export interface DraftSnapshot {
  id: string;
  entryDate: string;
  title: string;
  mood: string;
  weather: string;
  contentJson: JSONContent;
  excerpt: string;
  capturedAt: string;
}

export interface SaveEntryInput {
  entryDate: string;
  title: string;
  mood: string;
  weather: string;
  contentJson: JSONContent;
  excerpt: string;
}

export interface UpdateSettingsInput {
  theme?: string;
  fontScale?: number;
  lastOpenedDate?: string;
}

export type AuthMode = "checking" | "setup" | "locked" | "ready";
export type SaveState = "idle" | "saving" | "saved" | "error";
export type TurnDirection = "forward" | "backward";
