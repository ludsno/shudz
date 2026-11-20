import { DEFAULT_CACHE_CONFIG, SHUDZ_KEYS, normalizeTheme } from "../shared/storage.ts";
import type { CacheConfig, CachedEntry, SavedWord, ThemeMode } from "../shared/types.ts";
import { SettingsController } from "./settings-controller.ts";
import { WordsController } from "./words-controller.ts";

document.addEventListener("DOMContentLoaded", () => {
  // Tabs
  const tabWords = document.getElementById("tabWords") as HTMLButtonElement;
  const tabCache = document.getElementById("tabCache") as HTMLButtonElement;
  const panelWords = document.getElementById("panelWords") as HTMLElement;
  const panelCache = document.getElementById("panelCache") as HTMLElement;

  function switchTab(target: "words" | "cache"): void {
    const isWords = target === "words";
    tabWords.setAttribute("aria-selected", String(isWords));
    tabCache.setAttribute("aria-selected", String(!isWords));
    panelWords.hidden = !isWords;
    panelCache.hidden = isWords;
  }

  tabWords.addEventListener("click", () => switchTab("words"));
  tabCache.addEventListener("click", () => switchTab("cache"));

  function applyTheme(theme: unknown): void {
    const normalized: ThemeMode = normalizeTheme(theme);
    document.documentElement.dataset.theme = normalized;
  }

  // Words Controller
  const wordsController = new WordsController({
    savedCountEl: document.getElementById("savedCount") as HTMLElement,
    searchInput: document.getElementById("searchInput") as HTMLInputElement,
    wordList: document.getElementById("wordList") as HTMLElement,
    exportJsonBtn: document.getElementById("exportJsonBtn") as HTMLButtonElement,
    exportCsvBtn: document.getElementById("exportCsvBtn") as HTMLButtonElement,
    exportTsvBtn: document.getElementById("exportTsvBtn") as HTMLButtonElement,
    normalActions: document.getElementById("normalActions") as HTMLElement,
    selectionActions: document.getElementById("selectionActions") as HTMLElement,
    enterSelectBtn: document.getElementById("enterSelectBtn") as HTMLButtonElement,
    cancelSelectBtn: document.getElementById("cancelSelectBtn") as HTMLButtonElement,
    selectAllCheckbox: document.getElementById("selectAllCheckbox") as HTMLInputElement,
    selectAllLabel: document.getElementById("selectAllLabel") as HTMLElement,
    deleteSelectedBtn: document.getElementById("deleteSelectedBtn") as HTMLButtonElement,
  });
  wordsController.init();

  // Settings Controller
  const settingsController = new SettingsController(
    {
      cacheEnabledToggle: document.getElementById("cacheEnabledToggle") as HTMLInputElement,
      cacheMaxSelect: document.getElementById("cacheMaxSelect") as HTMLSelectElement,
      cacheTtlSelect: document.getElementById("cacheTtlSelect") as HTMLSelectElement,
      cacheUsageText: document.getElementById("cacheUsageText") as HTMLElement,
      clearCacheBtn: document.getElementById("clearCacheBtn") as HTMLButtonElement,
      resetAllBtn: document.getElementById("resetAllBtn") as HTMLButtonElement | null,
    },
    () => {
      // onResetAll callback
      wordsController.updateWords({});
      applyTheme("auto");
    }
  );
  settingsController.init();

  // Load initial data
  chrome.storage.local.get(
    [
      SHUDZ_KEYS.SAVED_WORDS,
      SHUDZ_KEYS.CACHE_CONFIG,
      SHUDZ_KEYS.DICT_CACHE,
      SHUDZ_KEYS.THEME,
    ],
    (result) => {
      applyTheme(result[SHUDZ_KEYS.THEME]);

      const words = (result[SHUDZ_KEYS.SAVED_WORDS] as Record<string, SavedWord>) || {};
      wordsController.updateWords(words);

      const cache = (result[SHUDZ_KEYS.DICT_CACHE] as Record<string, CachedEntry>) || {};
      const config = {
        ...DEFAULT_CACHE_CONFIG,
        ...((result[SHUDZ_KEYS.CACHE_CONFIG] as Partial<CacheConfig>) || {}),
      };
      settingsController.update(cache, config);
    }
  );

  // Storage listener for reactive sync
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes[SHUDZ_KEYS.SAVED_WORDS]) {
      wordsController.updateWords(
        (changes[SHUDZ_KEYS.SAVED_WORDS].newValue as Record<string, SavedWord>) || {}
      );
    }
    if (changes[SHUDZ_KEYS.DICT_CACHE] || changes[SHUDZ_KEYS.CACHE_CONFIG]) {
      chrome.storage.local.get(
        [SHUDZ_KEYS.DICT_CACHE, SHUDZ_KEYS.CACHE_CONFIG],
        (res) => {
          const cache = (res[SHUDZ_KEYS.DICT_CACHE] as Record<string, CachedEntry>) || {};
          const config = {
            ...DEFAULT_CACHE_CONFIG,
            ...((res[SHUDZ_KEYS.CACHE_CONFIG] as Partial<CacheConfig>) || {}),
          };
          settingsController.update(cache, config);
        }
      );
    }
    if (changes[SHUDZ_KEYS.THEME]) {
      applyTheme(changes[SHUDZ_KEYS.THEME].newValue);
    }
  });
});
