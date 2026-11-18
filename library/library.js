document.addEventListener("DOMContentLoaded", () => {
  const SAVED_WORDS_KEY = SHUDZ_KEYS.SAVED_WORDS;
  const CACHE_CONFIG_KEY = SHUDZ_KEYS.CACHE_CONFIG;
  const DICT_CACHE_KEY = SHUDZ_KEYS.DICT_CACHE;
  const THEME_KEY = SHUDZ_KEYS.THEME;

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
  const resetAllBtn = document.getElementById("resetAllBtn");

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
    document.documentElement.dataset.theme = normalizeTheme(theme);
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

  function normalizeForSearch(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function normalizePinyinForSearch(value) {
    return normalizeForSearch(value).replace(/\s+/g, "");
  }

  function buildNormalizedIndex(text, { isPinyin = false } = {}) {
    const src = String(text || "");
    let norm = "";
    const ranges = [];

    for (let i = 0; i < src.length; ) {
      const cp = src.codePointAt(i);
      const charLen = cp > 0xffff ? 2 : 1;
      const ch = src.slice(i, i + charLen);
      let piece = ch
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

      if (isPinyin) {
        piece = piece.replace(/\s+/g, "").replace(/v/g, "u");
      }

      for (let j = 0; j < piece.length; j++) {
        norm += piece[j];
        ranges.push([i, i + charLen]);
      }
      i += charLen;
    }

    return { src, norm, ranges };
  }

  function appendHighlightedText(container, text, rawQuery, options = {}) {
    const str = String(text || "");
    const q = (rawQuery || "").trim();
    if (!q) {
      container.textContent = str;
      return;
    }

    const normQuery = buildNormalizedIndex(q, options).norm;
    if (!normQuery) {
      container.textContent = str;
      return;
    }

    const { src, norm, ranges } = buildNormalizedIndex(str, options);
    const matches = [];
    let pos = 0;

    while (pos <= norm.length - normQuery.length) {
      const idx = norm.indexOf(normQuery, pos);
      if (idx === -1) break;
      const start = ranges[idx][0];
      const end = ranges[idx + normQuery.length - 1][1];
      matches.push([start, end]);
      pos = idx + normQuery.length;
    }

    if (matches.length === 0) {
      container.textContent = str;
      return;
    }

    let cursor = 0;
    matches.forEach(([start, end]) => {
      if (start > cursor) {
        container.appendChild(document.createTextNode(src.slice(cursor, start)));
      }
      const mark = document.createElement("mark");
      mark.className = "search-highlight";
      mark.textContent = src.slice(start, end);
      container.appendChild(mark);
      cursor = end;
    });

    if (cursor < src.length) {
      container.appendChild(document.createTextNode(src.slice(cursor)));
    }
  }

  function htmlToPlainText(html) {
    if (!html) return "";
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  }

  function appendRichContent(container, html, fallbackText, rawQuery) {
    if (!html) {
      appendHighlightedText(container, fallbackText || "", rawQuery);
      return;
    }

    const doc = new DOMParser().parseFromString(String(html), "text/html");
    const allowedTags = new Set([
      "SPAN",
      "B",
      "I",
      "STRONG",
      "EM",
      "SMALL",
      "SUB",
      "SUP",
    ]);

    function importSafe(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const span = document.createDocumentFragment();
        appendHighlightedText(span, node.textContent || "", rawQuery);
        return span;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return null;

      const tag = node.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "LINK") return null;

      const frag = document.createDocumentFragment();
      node.childNodes.forEach((child) => {
        const imported = importSafe(child);
        if (imported) frag.appendChild(imported);
      });

      if (!allowedTags.has(tag)) return frag;

      const el = document.createElement(tag.toLowerCase());
      const style = node.getAttribute("style");
      if (style) el.setAttribute("style", style);
      const cls = node.getAttribute("class");
      if (cls) el.setAttribute("class", cls);
      const lang = node.getAttribute("lang");
      if (lang) el.setAttribute("lang", lang);
      el.appendChild(frag);
      return el;
    }

    doc.body.childNodes.forEach((child) => {
      const imported = importSafe(child);
      if (imported) container.appendChild(imported);
    });
  }

  function getFilteredWords() {
    const rawQuery = searchInput.value.trim();
    const entries = Object.values(savedWordsMap).reverse();
    if (!rawQuery) return entries;

    const query = normalizeForSearch(rawQuery);
    const pinyinQuery = normalizePinyinForSearch(rawQuery).replace(/v/g, "u");

    return entries.filter((item) => {
      if (normalizeForSearch(item.word).includes(query)) return true;
      if (normalizeForSearch(item.resolvedTerm).includes(query)) return true;

      const normPinyin = normalizePinyinForSearch(item.pinyin).replace(
        /v/g,
        "u"
      );
      if (normPinyin.includes(pinyinQuery)) return true;

      const defs = Array.isArray(item.definitions) ? item.definitions : [];
      return defs.some((d) => {
        const defText = d.text || htmlToPlainText(d.html);
        if (normalizeForSearch(defText).includes(query)) return true;
        return (
          Array.isArray(d.examples) &&
          d.examples.some((ex) =>
            normalizeForSearch(htmlToPlainText(ex)).includes(query)
          )
        );
      });
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

    const rawQuery = searchInput.value.trim();

    filtered.forEach((item) => {
      const card = document.createElement("div");
      card.className = "card word-card";

      const row = document.createElement("div");
      row.className = "word-row";

      const main = document.createElement("div");
      main.className = "word-main";

      const hanzi = document.createElement("span");
      hanzi.className = "word-hanzi";
      appendHighlightedText(hanzi, item.word, rawQuery);
      main.appendChild(hanzi);

      if (item.resolvedTerm && item.resolvedTerm !== item.word) {
        const trad = document.createElement("span");
        trad.className = "word-trad";
        appendHighlightedText(trad, `(${item.resolvedTerm})`, rawQuery);
        main.appendChild(trad);
      }

      if (item.pinyin) {
        const pinyin = document.createElement("span");
        pinyin.className = "word-pinyin";
        appendHighlightedText(pinyin, item.pinyin, rawQuery, { isPinyin: true });
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
      if (defs[0]?.html || defs[0]?.text) {
        const preview = document.createElement("div");
        preview.className = "word-preview";
        appendRichContent(preview, defs[0].html, defs[0].text, rawQuery);
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
        appendRichContent(textSpan, def.html, def.text || "", rawQuery);
        defItem.appendChild(textSpan);

        if (Array.isArray(def.examples) && def.examples.length > 0) {
          const exBox = document.createElement("div");
          exBox.className = "def-examples";
          def.examples.forEach((ex) => {
            const p = document.createElement("div");
            appendRichContent(p, ex, ex, rawQuery);
            exBox.appendChild(p);
          });
          defItem.appendChild(exBox);
        }

        details.appendChild(defItem);
      });

      const metaFooter = document.createElement("div");
      metaFooter.className = "word-meta-footer";

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
        savedWordsMap = {};
        dictCacheMap = {};
        cacheConfig = { ...DEFAULT_CACHE_CONFIG };
        applyTheme("auto");
        renderSavedWords();
        renderCacheSettings();

        chrome.tabs.query({}, (tabs) => {
          tabs.forEach((t) => {
            if (!t.id) return;
            chrome.tabs.sendMessage(
              t.id,
              { type: "clearDictionaryCache" },
              () => void chrome.runtime.lastError
            );
            chrome.tabs.sendMessage(
              t.id,
              { type: "setTheme", value: "auto" },
              () => void chrome.runtime.lastError
            );
          });
        });
      });
    });
  }

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
        const body = d.text || htmlToPlainText(d.html);
        return `${prefix}${body}`.trim();
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
      ["word", "traditional", "pinyin", "definitions"].join(","),
      ...items.map((item) =>
        [
          escapeCsv(item.word),
          escapeCsv(item.resolvedTerm || ""),
          escapeCsv(item.pinyin || ""),
          escapeCsv(formatFlatDefinitions(item)),
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
