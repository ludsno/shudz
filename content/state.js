// Configurações e constantes reutilizáveis
const TEXT_SAMPLE_LENGTH = 1000;
const LANGUAGE_MIN_CHARS = 10;
const PROCESS_BATCH_SIZE = 50;
const SELECTION_MAX_LENGTH = 20;
const MAX_DEFINITIONS = 8;
const MAX_EXAMPLES_PER_DEF = 2;
const TOOLTIP_OFFSET_Y = 10;
const TOOLTIP_MAX_WIDTH = 300;
const TOOLTIP_SAFE_MARGIN = 310;
const WIKTIONARY_API_BASE =
  "https://en.wiktionary.org/api/rest_v1/page/definition/";
const WIKTIONARY_HTML_BASE =
  "https://en.wiktionary.org/api/rest_v1/page/html/";
const WIKTIONARY_PAGE_BASE = "https://en.wiktionary.org/wiki/";
const DICT_CACHE_KEY = "shudz_dictCache";
const DICT_CACHE_MAX_ENTRIES = 200;
const DICT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const shudzState = {
  pinyinHasBeenAdded: false,
  domainKey: "pinyin_state_" + window.location.hostname,
  observer: null,
  processingQueue: [],
  isProcessing: false,
  chineseWordSegmenter: null,
  currentTooltip: null,
  tooltipTemplateElement: null,
  dictionaryCache: new Map(),
  useSmartSegmentation: true,
  useAutoDetect: true,
  dictionaryEnabled: true,
  masterEnabled: true,
  theme: "auto",
};
