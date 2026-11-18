document.addEventListener("DOMContentLoaded", () => {
  const SAVED_WORDS_KEY = "shudz_savedWords";
  const CACHE_CONFIG_KEY = "shudz_cacheConfig";
  const DICT_CACHE_KEY = "shudz_dictCache";
  const THEME_KEY = "shudz_theme";
  const DEFAULT_CACHE_CONFIG = {
    enabled: true,
    maxEntries: 200,
    ttlDays: 7,
  };

  const tabWords = document.getElementById("tabWords");
  const tabCache = document.getElementById("tabCache");
  const panelWords = document.getElementById("panelWords");
  const panelCache = document.getElementById("panelCache");

  const savedCountEl = document.getElementById("savedCount");
  const searchInput = document.getElementById("searchInput");
  const wordList = document.getElementById("wordList");
  const exportJsonBtn = document.getElementById("exportJsonBtn");
  const exportCsvBtn = document.getElementById("exportCsvBtn");
  const exportTsvBtn = document.getElementById("exportTsvBtn");
  const clearWordsBtn = document.getElementById("clearWordsBtn");

  const cacheEnabledToggle = document.getElementById("cacheEnabledToggle");
  const cacheMaxSelect = document.getElementById("cacheMaxSelect");
  const cacheTtlSelect = document.getElementById("cacheTtlSelect");
  const cacheUsageText = document.getElementById("cacheUsageText");
  const clearCacheBtn = document.getElementById("clearCacheBtn");

  let savedWordsMap = {};
  let cacheConfig = { ...DEFAULT_CACHE_CONFIG };
  let dictCacheMap = {};

  function switchTab(target) {
    const isWords = target === "words";
    tabWords.setAttribute("aria-selected", String(isWords));
    tabCache.setAttribute("aria-selected", String(!isWords));
    panelWords.hidden = !isWords;
    panelCache.hidden = isWords;
  }

  tabWords.addEventListener("click", () => switchTab("words"));
  tabCache.addEventListener("click", () => switchTab("cache"));

  function applyTheme(theme) {
    document.documentElement.dataset.theme =
      theme === "light" || theme === "dark" || theme === "auto"
        ? theme
        : "auto";
  }

  function loadAll() {
    chrome.storage.local.get(
      [SAVED_WORDS_KEY, CACHE_CONFIG_KEY, DICT_CACHE_KEY, THEME_KEY],
      (result) => {
        applyTheme(result[THEME_KEY] || "auto");
        savedWordsMap =
          result[SAVED_WORDS_KEY] && typeof result[SAVED_WORDS_KEY] === "object"
            ? result[SAVED_WORDS_KEY]
            : {};
        cacheConfig = {
          ...DEFAULT_CACHE_CONFIG,
          ...(result[CACHE_CONFIG_KEY] &&
          typeof result[CACHE_CONFIG_KEY] === "object"
            ? result[CACHE_CONFIG_KEY]
            : {}),
        };
        dictCacheMap =
          result[DICT_CACHE_KEY] && typeof result[DICT_CACHE_KEY] === "object"
            ? result[DICT_CACHE_KEY]
            : {};

        renderSavedWords();
        renderCacheSettings();
      }
    );
  }

  function getFilteredWords() {
    const query = searchInput.value.trim().toLowerCase();
    const entries = Object.values(savedWordsMap).sort(
      (a, b) => (b.savedAt || 0) - (a.savedAt || 0)
    );
    if (!query) return entries;

    return entries.filter((item) => {
      if ((item.word || "").toLowerCase().includes(query)) return true;
      if ((item.resolvedTerm || "").toLowerCase().includes(query)) return true;
      if ((item.pinyin || "").toLowerCase().includes(query)) return true;
      const defs = Array.isArray(item.definitions) ? item.definitions : [];
      return defs.some((d) => (d.text || "").toLowerCase().includes(query));
    });
  }

  function renderSavedWords() {
    const allCount = Object.keys(savedWordsMap).length;
    savedCountEl.textContent = String(allCount);

    const hasWords = allCount > 0;
    exportJsonBtn.disabled = !hasWords;
    exportCsvBtn.disabled = !hasWords;
    exportTsvBtn.disabled = !hasWords;
    clearWordsBtn.disabled = !hasWords;

    const filtered = getFilteredWords();
    wordList.textContent = "";

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "card empty-state";
      empty.textContent =
        allCount === 0
          ? "No saved words yet. Click ☆ in the dictionary tooltip to save words here."
          : "No saved words match your search.";
      wordList.appendChild(empty);
      return;
    }

    filtered.forEach((item) => {
      const card = document.createElement("div");
      card.className = "card word-card";

      const row = document.createElement("div");
      row.className = "word-row";

      const main = document.createElement("div");
      main.className = "word-main";

      const hanzi = document.createElement("span");
      hanzi.className = "word-hanzi";
      hanzi.textContent = item.word;
      main.appendChild(hanzi);

      if (item.resolvedTerm && item.resolvedTerm !== item.word) {
        const trad = document.createElement("span");
        trad.className = "word-trad";
        trad.textContent = `(${item.resolvedTerm})`;
        main.appendChild(trad);
      }

      if (item.pinyin) {
        const pinyin = document.createElement("span");
        pinyin.className = "word-pinyin";
        pinyin.textContent = item.pinyin;
        main.appendChild(pinyin);
      }

      const actions = document.createElement("div");
      actions.className = "word-actions";

      const expandBtn = document.createElement("button");
      expandBtn.type = "button";
      expandBtn.className = "btn";
      expandBtn.textContent = "Details";

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-danger";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => {
        const updated = { ...savedWordsMap };
        delete updated[item.word];
        savedWordsMap = updated;
        chrome.storage.local.set({ [SAVED_WORDS_KEY]: updated }, () => {
          renderSavedWords();
        });
      });

      actions.appendChild(expandBtn);
      actions.appendChild(deleteBtn);
      row.appendChild(main);
      row.appendChild(actions);
      card.appendChild(row);

      const defs = Array.isArray(item.definitions) ? item.definitions : [];
      if (defs[0]?.text) {
        const preview = document.createElement("div");
        preview.className = "word-preview";
        preview.textContent = defs[0].text;
        card.appendChild(preview);
      }

      const details = document.createElement("div");
      details.className = "word-details";
      details.hidden = true;

      defs.forEach((def) => {
        const defItem = document.createElement("div");
        defItem.className = "def-item";

        if (def.partOfSpeech) {
          const pos = document.createElement("span");
          pos.className = "def-pos";
          pos.textContent = def.partOfSpeech;
          defItem.appendChild(pos);
        }

        const textSpan = document.createElement("span");
        textSpan.textContent = def.text || "";
        defItem.appendChild(textSpan);

        if (Array.isArray(def.examples) && def.examples.length > 0) {
          const exBox = document.createElement("div");
          exBox.className = "def-examples";
          def.examples.forEach((ex) => {
            const p = document.createElement("div");
            p.textContent = ex;
            exBox.appendChild(p);
          });
          defItem.appendChild(exBox);
        }

        details.appendChild(defItem);
      });

      const metaFooter = document.createElement("div");
      metaFooter.className = "word-meta-footer";

      const savedDate = document.createElement("span");
      savedDate.textContent = item.savedAt
        ? `Saved ${new Date(item.savedAt).toLocaleDateString()}`
        : "";
      metaFooter.appendChild(savedDate);

      const wikiLink = document.createElement("a");
      const target = item.resolvedTerm || item.word;
      wikiLink.href = `https://en.wiktionary.org/wiki/${encodeURIComponent(target)}#Chinese`;
      wikiLink.target = "_blank";
      wikiLink.rel = "noopener noreferrer";
      wikiLink.textContent = "Wiktionary ↗";
      metaFooter.appendChild(wikiLink);

      details.appendChild(metaFooter);
      card.appendChild(details);

      expandBtn.addEventListener("click", () => {
        const isHidden = details.hidden;
        details.hidden = !isHidden;
        expandBtn.textContent = isHidden ? "Hide" : "Details";
      });

      wordList.appendChild(card);
    });
  }

  function renderCacheSettings() {
    cacheEnabledToggle.checked = cacheConfig.enabled !== false;
    cacheMaxSelect.value = String(cacheConfig.maxEntries || 200);
    cacheTtlSelect.value = String(cacheConfig.ttlDays || 7);

    const count = Object.keys(dictCacheMap).length;
    const bytes = new Blob([JSON.stringify(dictCacheMap)]).size;
    const kb = (bytes / 1024).toFixed(1);
    cacheUsageText.textContent = `${count} / ${cacheConfig.maxEntries} entries (~${kb} KB)`;
    clearCacheBtn.disabled = count === 0;
  }

  function saveCacheConfig(nextConfig) {
    cacheConfig = nextConfig;
    chrome.storage.local.set({ [CACHE_CONFIG_KEY]: cacheConfig }, () => {
      renderCacheSettings();
    });
  }

  cacheEnabledToggle.addEventListener("change", () => {
    saveCacheConfig({ ...cacheConfig, enabled: cacheEnabledToggle.checked });
  });

  cacheMaxSelect.addEventListener("change", () => {
    saveCacheConfig({
      ...cacheConfig,
      maxEntries: parseInt(cacheMaxSelect.value, 10) || 200,
    });
  });

  cacheTtlSelect.addEventListener("change", () => {
    saveCacheConfig({
      ...cacheConfig,
      ttlDays: parseInt(cacheTtlSelect.value, 10) || 7,
    });
  });

  clearCacheBtn.addEventListener("click", () => {
    chrome.storage.local.remove(DICT_CACHE_KEY, () => {
      dictCacheMap = {};
      renderCacheSettings();
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((t) => {
          if (t.id) {
            chrome.tabs.sendMessage(t.id, { type: "clearDictionaryCache" }, () => {
              void chrome.runtime.lastError;
            });
          }
        });
      });
    });
  });

  searchInput.addEventListener("input", renderSavedWords);

  clearWordsBtn.addEventListener("click", () => {
    if (!window.confirm("Remove all saved words? This cannot be undone.")) {
      return;
    }
    savedWordsMap = {};
    chrome.storage.local.set({ [SAVED_WORDS_KEY]: {} }, () => {
      renderSavedWords();
    });
  });

  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function formatFlatDefinitions(item) {
    const defs = Array.isArray(item.definitions) ? item.definitions : [];
    return defs
      .map((d) => {
        const prefix = d.partOfSpeech ? `[${d.partOfSpeech}] ` : "";
        return `${prefix}${d.text || ""}`.trim();
      })
      .filter(Boolean)
      .join("; ");
  }

  exportJsonBtn.addEventListener("click", () => {
    const items = getFilteredWords();
    downloadFile(
      "shudz-saved-words.json",
      JSON.stringify(items, null, 2),
      "application/json;charset=utf-8"
    );
  });

  exportCsvBtn.addEventListener("click", () => {
    const items = getFilteredWords();
    const escapeCsv = (val) => `"${String(val ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["word", "traditional", "pinyin", "definitions", "savedAt"].join(","),
      ...items.map((item) =>
        [
          escapeCsv(item.word),
          escapeCsv(item.resolvedTerm || ""),
          escapeCsv(item.pinyin || ""),
          escapeCsv(formatFlatDefinitions(item)),
          escapeCsv(
            item.savedAt ? new Date(item.savedAt).toISOString() : ""
          ),
        ].join(",")
      ),
    ];
    downloadFile(
      "shudz-saved-words.csv",
      "\uFEFF" + rows.join("\r\n"),
      "text/csv;charset=utf-8"
    );
  });

  exportTsvBtn.addEventListener("click", () => {
    const items = getFilteredWords();
    const cleanCell = (val) =>
      String(val ?? "")
        .replace(/[\t\r\n]+/g, " ")
        .trim();
    const rows = items.map((item) =>
      [
        cleanCell(item.word),
        cleanCell(item.pinyin || ""),
        cleanCell(formatFlatDefinitions(item)),
      ].join("\t")
    );
    downloadFile(
      "shudz-anki.tsv",
      rows.join("\n"),
      "text/tab-separated-values;charset=utf-8"
    );
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes[SAVED_WORDS_KEY]) {
      savedWordsMap = changes[SAVED_WORDS_KEY].newValue || {};
      renderSavedWords();
    }
    if (changes[DICT_CACHE_KEY]) {
      dictCacheMap = changes[DICT_CACHE_KEY].newValue || {};
      renderCacheSettings();
    }
    if (changes[CACHE_CONFIG_KEY]) {
      cacheConfig = {
        ...DEFAULT_CACHE_CONFIG,
        ...(changes[CACHE_CONFIG_KEY].newValue || {}),
      };
      renderCacheSettings();
    }
    if (changes[THEME_KEY]) {
      applyTheme(changes[THEME_KEY].newValue || "auto");
    }
  });

  loadAll();
});
