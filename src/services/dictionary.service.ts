import type { WiktionaryEntry } from "../shared/types.ts";
import { CacheService, defaultCacheService } from "./cache.service.ts";
import { SavedWordsService } from "./saved-words.service.ts";
import {
  WiktionaryService,
  type ResolvedWiktionaryData,
} from "./wiktionary.service.ts";

export interface DictionarySuccessResult {
  status: "success";
  word: string;
  resolvedTerm: string;
  definitions: WiktionaryEntry[];
  isSaved: boolean;
  fromCache: boolean;
}

export interface DictionaryNotFoundResult {
  status: "not_found";
  word: string;
}

export interface DictionaryNoChineseResult {
  status: "no_chinese";
  word: string;
}

export interface DictionaryErrorResult {
  status: "error";
  word: string;
  message: string;
}

export type DictionaryLookupResult =
  | DictionarySuccessResult
  | DictionaryNotFoundResult
  | DictionaryNoChineseResult
  | DictionaryErrorResult;

export class DictionaryService {
  constructor(
    private cache: CacheService = defaultCacheService,
    private wiktionary = WiktionaryService,
    private savedWords = SavedWordsService
  ) {}

  async lookup(word: string): Promise<DictionaryLookupResult> {
    try {
      // 1. Check Cache
      const cached = await this.cache.get(word);
      if (cached && cached.definitions.length > 0) {
        const isSaved = await this.savedWords.isSaved(word);
        return {
          status: "success",
          word,
          resolvedTerm: cached.resolvedTerm || word,
          definitions: cached.definitions,
          isSaved,
          fromCache: true,
        };
      }

      // 2. Fetch from Wiktionary
      let resolved: ResolvedWiktionaryData | null = null;
      let rawApiAvailable = false;

      try {
        const apiData = await this.wiktionary.fetchApi(word);
        if (apiData) {
          rawApiAvailable = true;
        }
      } catch {
        // API 404 or network issue
      }

      resolved = await this.wiktionary.resolveDefinitions(word);

      if (resolved && resolved.definitions.length > 0) {
        await this.cache.set(word, resolved.definitions, resolved.resolvedTerm);
        const isSaved = await this.savedWords.isSaved(word);
        return {
          status: "success",
          word,
          resolvedTerm: resolved.resolvedTerm,
          definitions: resolved.definitions,
          isSaved,
          fromCache: false,
        };
      }

      if (!rawApiAvailable && !resolved) {
        return {
          status: "not_found",
          word,
        };
      }

      return {
        status: "no_chinese",
        word,
      };
    } catch (err) {
      return {
        status: "error",
        word,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async isWordSaved(word: string): Promise<boolean> {
    return this.savedWords.isSaved(word);
  }

  async toggleSavedWord(
    word: string,
    resolvedTerm: string,
    definitions: WiktionaryEntry[]
  ): Promise<boolean> {
    return this.savedWords.toggleWord(word, resolvedTerm, definitions);
  }

  async clearCache(): Promise<void> {
    await this.cache.clearAll();
  }
}

export const defaultDictionaryService = new DictionaryService();
