export type ThemeMode = "auto" | "light" | "dark";

export interface CacheConfig {
  enabled: boolean;
  maxEntries: number;
  ttlDays: number;
}

export interface WiktionaryParsedExample {
  example?: string;
  translation?: string;
}

export interface WiktionaryDefinition {
  definition?: string;
  examples?: string[];
  parsedExamples?: WiktionaryParsedExample[];
  tags?: unknown[];
  glosses?: unknown[];
  note?: string;
  senseid?: string;
}

export interface WiktionaryEntry {
  partOfSpeech?: string;
  language?: string;
  definitions?: WiktionaryDefinition[];
}

export type WiktionaryApiResponse = Record<string, WiktionaryEntry[]>;

export interface CachedEntry {
  definitions: WiktionaryEntry[];
  resolvedTerm: string;
  cachedAt: number;
}

export interface SavedDefinition {
  partOfSpeech: string;
  language: string;
  html?: string;
  text: string;
  examples: string[];
}

export interface SavedWord {
  word: string;
  resolvedTerm: string;
  pinyin: string;
  definitions: SavedDefinition[];
}

export interface PinyinStateResponse {
  enabled: boolean;
}

export type ShudzMessage =
  | { type: "getPinyinState" }
  | { type: "togglePinyin"; value?: boolean }
  | { type: "setPinyinEnabled"; value: boolean }
  | { type: "setSegmentation"; value: boolean }
  | { type: "setDictionaryEnabled"; value: boolean }
  | { type: "clearDictionaryCache" }
  | { type: "setTheme"; value: ThemeMode }
  | { type: "setMasterEnabled"; value: boolean };
