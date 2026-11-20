import { DEFAULT_CACHE_CONFIG, SHUDZ_KEYS } from "../shared/storage.ts";
import type { CacheConfig, CachedEntry, ShudzMessage } from "../shared/types.ts";

export class SettingsController {
  private cacheConfig: CacheConfig = { ...DEFAULT_CACHE_CONFIG };
  private dictCacheMap: Record<string, CachedEntry> = {};

  constructor(
    private elements: {
      cacheEnabledToggle: HTMLInputElement;
      cacheMaxSelect: HTMLSelectElement;
      cacheTtlSelect: HTMLSelectElement;
      cacheUsageText: HTMLElement;
      clearCacheBtn: HTMLButtonElement;
      resetAllBtn: HTMLButtonElement | null;
    },
    private onResetAll: () => void
  ) {}

  init(): void {
    const {
      cacheEnabledToggle,
      cacheMaxSelect,
      cacheTtlSelect,
      clearCacheBtn,
      resetAllBtn,
    } = this.elements;

    cacheEnabledToggle.addEventListener("change", () => {
      this.saveCacheConfig({
        ...this.cacheConfig,
        enabled: cacheEnabledToggle.checked,
      });
    });

    cacheMaxSelect.addEventListener("change", () => {
      this.saveCacheConfig({
        ...this.cacheConfig,
        maxEntries: parseInt(cacheMaxSelect.value, 10) || 200,
      });
    });

    cacheTtlSelect.addEventListener("change", () => {
      this.saveCacheConfig({
        ...this.cacheConfig,
        ttlDays: parseInt(cacheTtlSelect.value, 10) || 7,
      });
    });

    clearCacheBtn.addEventListener("click", () => {
      chrome.storage.local.remove(SHUDZ_KEYS.DICT_CACHE, () => {
        this.dictCacheMap = {};
        this.render();
        this.broadcastToTabs({ type: "clearDictionaryCache" });
      });
    });

    if (resetAllBtn) {
      resetAllBtn.addEventListener("click", () => {
        if (
          !window.confirm(
            "Erase all saved words, cached definitions, per-site states, and restore default settings? This cannot be undone."
          )
        ) {
          return;
        }

        chrome.storage.local.clear(() => {
          this.dictCacheMap = {};
          this.cacheConfig = { ...DEFAULT_CACHE_CONFIG };
          this.render();
          this.broadcastToTabs({ type: "clearDictionaryCache" });
          this.broadcastToTabs({ type: "setTheme", value: "auto" });
          this.onResetAll();
        });
      });
    }
  }

  update(dictCache: Record<string, CachedEntry>, config: CacheConfig): void {
    this.dictCacheMap = dictCache;
    this.cacheConfig = config;
    this.render();
  }

  render(): void {
    const {
      cacheEnabledToggle,
      cacheMaxSelect,
      cacheTtlSelect,
      cacheUsageText,
      clearCacheBtn,
    } = this.elements;

    cacheEnabledToggle.checked = this.cacheConfig.enabled !== false;
    cacheMaxSelect.value = String(this.cacheConfig.maxEntries || 200);
    cacheTtlSelect.value = String(this.cacheConfig.ttlDays || 7);

    const count = Object.keys(this.dictCacheMap).length;
    const bytes = new Blob([JSON.stringify(this.dictCacheMap)]).size;
    const kb = (bytes / 1024).toFixed(1);
    cacheUsageText.textContent = `${count} / ${this.cacheConfig.maxEntries} entries (~${kb} KB)`;
    clearCacheBtn.disabled = count === 0;
  }

  private saveCacheConfig(nextConfig: CacheConfig): void {
    this.cacheConfig = nextConfig;
    chrome.storage.local.set(
      { [SHUDZ_KEYS.CACHE_CONFIG]: this.cacheConfig },
      () => {
        this.render();
      }
    );
  }

  private broadcastToTabs(message: ShudzMessage): void {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((t) => {
        if (!t.id) return;
        chrome.tabs.sendMessage(t.id, message, () => {
          void chrome.runtime.lastError;
        });
      });
    });
  }
}
