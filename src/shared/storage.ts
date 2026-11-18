import type { CacheConfig, ThemeMode } from "./types";

export const SHUDZ_KEYS = {
  SEGMENTATION: "useSmartSegmentation",
  AUTO_DETECT: "useAutoDetect",
  DICTIONARY: "useDictionary",
  MASTER_ENABLED: "shudz_masterEnabled",
  THEME: "shudz_theme",
  DICT_CACHE: "shudz_dictCache",
  CACHE_CONFIG: "shudz_cacheConfig",
  SAVED_WORDS: "shudz_savedWords",
} as const;

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  maxEntries: 200,
  ttlDays: 7,
};

export function normalizeTheme(value: unknown): ThemeMode {
  return value === "light" || value === "dark" || value === "auto"
    ? value
    : "auto";
}

export function storageGet<T extends Record<string, unknown> = Record<string, unknown>>(
  keys: string | string[]
): Promise<Partial<T>> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          resolve({});
          return;
        }
        resolve((result || {}) as Partial<T>);
      });
    } catch {
      resolve({});
    }
  });
}

export function storageSet(values: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(values, () => {
        void chrome.runtime.lastError;
        resolve();
      });
    } catch {
      resolve();
    }
  });
}
