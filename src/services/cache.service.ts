import {
  DEFAULT_CACHE_CONFIG,
  SHUDZ_KEYS,
  storageGet,
  storageSet,
} from "../shared/storage.ts";
import type {
  CacheConfig,
  CachedEntry,
  WiktionaryDefinition,
  WiktionaryEntry,
} from "../shared/types.ts";

const MAX_DEFINITIONS = 8;
const MAX_EXAMPLES_PER_DEF = 2;

export class CacheService {
  private memCache = new Map<string, CachedEntry>();
  private config: CacheConfig = { ...DEFAULT_CACHE_CONFIG };

  constructor(initialConfig?: Partial<CacheConfig>) {
    if (initialConfig) {
      this.config = { ...DEFAULT_CACHE_CONFIG, ...initialConfig };
    }
  }

  setConfig(cfg: Partial<CacheConfig>): void {
    this.config = {
      ...this.config,
      ...cfg,
    };
    if (this.config.enabled === false) {
      this.clearMemory();
    }
  }

  getConfig(): CacheConfig {
    return { ...this.config };
  }

  async loadConfigFromStorage(): Promise<CacheConfig> {
    const result = await storageGet<Record<string, Partial<CacheConfig>>>([
      SHUDZ_KEYS.CACHE_CONFIG,
    ]);
    const stored = result[SHUDZ_KEYS.CACHE_CONFIG];
    if (stored && typeof stored === "object") {
      this.setConfig(stored);
    }
    return this.getConfig();
  }

  private getNormalizedSettings(): {
    enabled: boolean;
    maxEntries: number;
    ttlMs: number;
  } {
    const enabled = this.config.enabled !== false;
    const maxEntries =
      Number(this.config.maxEntries) > 0
        ? Number(this.config.maxEntries)
        : DEFAULT_CACHE_CONFIG.maxEntries;
    const ttlDays =
      Number(this.config.ttlDays) > 0
        ? Number(this.config.ttlDays)
        : DEFAULT_CACHE_CONFIG.ttlDays;
    return {
      enabled,
      maxEntries,
      ttlMs: ttlDays * 24 * 60 * 60 * 1000,
    };
  }

  trimEntriesForCache(entries: WiktionaryEntry[]): WiktionaryEntry[] {
    const trimmed: WiktionaryEntry[] = [];
    let count = 0;

    for (const entry of entries) {
      if (count >= MAX_DEFINITIONS) break;
      const defs = Array.isArray(entry.definitions) ? entry.definitions : [];
      const keptDefs: WiktionaryDefinition[] = [];

      for (const def of defs) {
        if (count >= MAX_DEFINITIONS) break;
        keptDefs.push({
          definition: def.definition,
          examples: Array.isArray(def.examples)
            ? def.examples.slice(0, MAX_EXAMPLES_PER_DEF)
            : undefined,
          parsedExamples: Array.isArray(def.parsedExamples)
            ? def.parsedExamples.slice(0, MAX_EXAMPLES_PER_DEF)
            : undefined,
        });
        count++;
      }

      if (keptDefs.length > 0) {
        trimmed.push({
          partOfSpeech: entry.partOfSpeech,
          language: entry.language,
          definitions: keptDefs,
        });
      }
    }

    return trimmed;
  }

  async get(word: string): Promise<CachedEntry | null> {
    const { enabled, ttlMs } = this.getNormalizedSettings();
    if (!enabled) return null;

    const now = Date.now();
    const memEntry = this.memCache.get(word);
    if (memEntry && now - memEntry.cachedAt < ttlMs) {
      return memEntry;
    }
    if (memEntry) {
      this.memCache.delete(word);
    }

    const result = await storageGet<Record<string, Record<string, CachedEntry>>>([
      SHUDZ_KEYS.DICT_CACHE,
    ]);
    const cacheObj = result[SHUDZ_KEYS.DICT_CACHE];
    const stored =
      cacheObj && typeof cacheObj === "object" ? cacheObj[word] : null;
    if (
      stored &&
      Array.isArray(stored.definitions) &&
      stored.definitions.length > 0 &&
      now - stored.cachedAt < ttlMs
    ) {
      this.memCache.set(word, stored);
      return stored;
    }
    return null;
  }

  async set(
    word: string,
    definitions: WiktionaryEntry[],
    resolvedTerm: string
  ): Promise<void> {
    const { enabled, maxEntries, ttlMs } = this.getNormalizedSettings();
    if (!enabled || !definitions || definitions.length === 0) return;

    const payload: CachedEntry = {
      definitions: this.trimEntriesForCache(definitions),
      resolvedTerm: resolvedTerm || word,
      cachedAt: Date.now(),
    };
    if (payload.definitions.length === 0) return;

    this.memCache.set(word, payload);

    const result = await storageGet<Record<string, Record<string, CachedEntry>>>([
      SHUDZ_KEYS.DICT_CACHE,
    ]);
    const now = Date.now();
    const rawCache = result[SHUDZ_KEYS.DICT_CACHE];
    const cacheObj: Record<string, CachedEntry> =
      rawCache && typeof rawCache === "object" ? { ...rawCache } : {};

    for (const key of Object.keys(cacheObj)) {
      const item = cacheObj[key];
      if (!item || now - item.cachedAt >= ttlMs) {
        delete cacheObj[key];
      }
    }

    cacheObj[word] = payload;

    const keys = Object.keys(cacheObj);
    if (keys.length > maxEntries) {
      keys.sort((a, b) => cacheObj[a].cachedAt - cacheObj[b].cachedAt);
      const toRemove = keys.length - maxEntries;
      for (let i = 0; i < toRemove; i++) {
        delete cacheObj[keys[i]];
      }
    }

    await storageSet({ [SHUDZ_KEYS.DICT_CACHE]: cacheObj });
  }

  clearMemory(): void {
    this.memCache.clear();
  }

  async clearAll(): Promise<void> {
    this.clearMemory();
    await storageSet({ [SHUDZ_KEYS.DICT_CACHE]: {} });
  }
}

export const defaultCacheService = new CacheService();
