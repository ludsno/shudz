import { DEFAULT_CACHE_CONFIG } from "../shared/storage";
import type { CacheConfig, CachedEntry, ThemeMode } from "../shared/types";

export const TEXT_SAMPLE_LENGTH = 1000;
export const LANGUAGE_MIN_CHARS = 10;
export const PROCESS_BATCH_SIZE = 50;
export const SELECTION_MAX_LENGTH = 20;
export const MAX_DEFINITIONS = 8;
export const MAX_EXAMPLES_PER_DEF = 2;
export const TOOLTIP_OFFSET_Y = 10;
export const TOOLTIP_MAX_WIDTH = 380;
export const TOOLTIP_SAFE_MARGIN = 392;
export const WIKTIONARY_API_BASE =
  "https://en.wiktionary.org/api/rest_v1/page/definition/";
export const WIKTIONARY_HTML_BASE =
  "https://en.wiktionary.org/api/rest_v1/page/html/";
export const WIKTIONARY_PAGE_BASE = "https://en.wiktionary.org/wiki/";

export interface ShudzState {
  pinyinHasBeenAdded: boolean;
  domainKey: string;
  observer: MutationObserver | null;
  processingQueue: Text[];
  isProcessing: boolean;
  chineseWordSegmenter: Intl.Segmenter | null;
  currentTooltip: HTMLElement | null;
  tooltipTemplateElement: HTMLTemplateElement | null;
  dictionaryCache: Map<string, CachedEntry>;
  cacheConfig: CacheConfig;
  useSmartSegmentation: boolean;
  useAutoDetect: boolean;
  dictionaryEnabled: boolean;
  masterEnabled: boolean;
  theme: ThemeMode;
  activeLookupId: number;
}

export const shudzState: ShudzState = {
  pinyinHasBeenAdded: false,
  domainKey: "pinyin_state_" + window.location.hostname,
  observer: null,
  processingQueue: [],
  isProcessing: false,
  chineseWordSegmenter: null,
  currentTooltip: null,
  tooltipTemplateElement: null,
  dictionaryCache: new Map<string, CachedEntry>(),
  cacheConfig: { ...DEFAULT_CACHE_CONFIG },
  useSmartSegmentation: true,
  useAutoDetect: true,
  dictionaryEnabled: true,
  masterEnabled: true,
  theme: "auto",
  activeLookupId: 0,
};
