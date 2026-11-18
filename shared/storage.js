const SHUDZ_KEYS = {
  SEGMENTATION: "useSmartSegmentation",
  AUTO_DETECT: "useAutoDetect",
  DICTIONARY: "useDictionary",
  MASTER_ENABLED: "shudz_masterEnabled",
  THEME: "shudz_theme",
  DICT_CACHE: "shudz_dictCache",
  CACHE_CONFIG: "shudz_cacheConfig",
  SAVED_WORDS: "shudz_savedWords",
};

const DEFAULT_CACHE_CONFIG = {
  enabled: true,
  maxEntries: 200,
  ttlDays: 7,
};

function normalizeTheme(value) {
  return value === "light" || value === "dark" || value === "auto"
    ? value
    : "auto";
}

function storageGet(keys) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          resolve({});
          return;
        }
        resolve(result || {});
      });
    } catch (e) {
      resolve({});
    }
  });
}

function storageSet(values) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(values, () => {
        void chrome.runtime.lastError;
        resolve();
      });
    } catch (e) {
      resolve();
    }
  });
}
