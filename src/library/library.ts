import { buildSafeHtmlFragment, htmlToPlainText } from "../shared/html";
import {
  DEFAULT_CACHE_CONFIG,
  SHUDZ_KEYS,
  normalizeTheme,
} from "../shared/storage";
import { buildNormalizedIndex } from "../shared/text";
import type {
  CacheConfig,
  CachedEntry,
  SavedWord,
  ShudzMessage,
  ThemeMode,
} from "../shared/types";

document.addEventListener("DOMContentLoaded", () => {
  const tabWords = document.getElementById("tabWords") as HTMLButtonElement;
  const tabCache = document.getElementById("tabCache") as HTMLButtonElement;
  const panelWords = document.getElementById("panelWords") as HTMLElement;
  const panelCache = document.getElementById("panelCache") as HTMLElement;

  const savedCountEl = document.getElementById("savedCount") as HTMLElement;
  const searchInput = document.getElementById("searchInput") as HTMLInputElement;
  const wordList = document.getElementById("wordList") as HTMLElement;
  const exportJsonBtn = document.getElementById(
    "exportJsonBtn"
  ) as HTMLButtonElement;
  const exportCsvBtn = document.getElementById(
    "exportCsvBtn"
  ) as HTMLButtonElement;
  const exportTsvBtn = document.getElementById(
    "exportTsvBtn"
  ) as HTMLButtonElement;
  const normalActions = document.getElementById(
    "normalActions"
  ) as HTMLElement;
  const selectionActions = document.getElementById(
    "selectionActions"
  ) as HTMLElement;
  const enterSelectBtn = document.getElementById(
    "enterSelectBtn"
  ) as HTMLButtonElement;
  const cancelSelectBtn = document.getElementById(
    "cancelSelectBtn"
  ) as HTMLButtonElement;
  const selectAllCheckbox = document.getElementById(
    "selectAllCheckbox"
  ) as HTMLInputElement;
  const selectAllLabel = document.getElementById(
    "selectAllLabel"
  ) as HTMLElement;
  const deleteSelectedBtn = document.getElementById(
    "deleteSelectedBtn"
  ) as HTMLButtonElement;

  const cacheEnabledToggle = document.getElementById(
    "cacheEnabledToggle"
  ) as HTMLInputElement;
  const cacheMaxSelect = document.getElementById(
    "cacheMaxSelect"
  ) as HTMLSelectElement;
  const cacheTtlSelect = document.getElementById(
    "cacheTtlSelect"
  ) as HTMLSelectElement;
  const cacheUsageText = document.getElementById(
    "cacheUsageText"
  ) as HTMLElement;
  const clearCacheBtn = document.getElementById(
    "clearCacheBtn"
  ) as HTMLButtonElement;
  const resetAllBtn = document.getElementById(
    "resetAllBtn"
  ) as HTMLButtonElement | null;

  let savedWordsMap: Record<string, SavedWord> = {};
  let cacheConfig: CacheConfig = { ...DEFAULT_CACHE_CONFIG };
  let dictCacheMap: Record<string, CachedEntry> = {};
  const selectedWords = new Set<string>();
  let isSelectionMode = false;

  function setSelectionMode(active: boolean): void {
    isSelectionMode = active;
    if (!active) {
      selectedWords.clear();
    }
    normalActions.hidden = active;
    selectionActions.hidden = !active;
    wordList.classList.toggle("is-selecting", active);
    renderSavedWords();
  }

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

  function loadAll(): void {
    chrome.storage.local.get(
      [
        SHUDZ_KEYS.SAVED_WORDS,
        SHUDZ_KEYS.CACHE_CONFIG,
        SHUDZ_KEYS.DICT_CACHE,
        SHUDZ_KEYS.THEME,
      ],
      (result) => {
        applyTheme(result[SHUDZ_KEYS.THEME]);
        savedWordsMap =
          result[SHUDZ_KEYS.SAVED_WORDS] &&
          typeof result[SHUDZ_KEYS.SAVED_WORDS] === "object"
            ? (result[SHUDZ_KEYS.SAVED_WORDS] as Record<string, SavedWord>)
            : {};
        cacheConfig = {
          ...DEFAULT_CACHE_CONFIG,
          ...(result[SHUDZ_KEYS.CACHE_CONFIG] &&
          typeof result[SHUDZ_KEYS.CACHE_CONFIG] === "object"
            ? (result[SHUDZ_KEYS.CACHE_CONFIG] as Partial<CacheConfig>)
            : {}),
        };
        dictCacheMap =
          result[SHUDZ_KEYS.DICT_CACHE] &&
          typeof result[SHUDZ_KEYS.DICT_CACHE] === "object"
            ? (result[SHUDZ_KEYS.DICT_CACHE] as Record<string, CachedEntry>)
            : {};

        renderSavedWords();
        renderCacheSettings();
      }
    );
  }

  function normalizeText(value: unknown, isPinyin = false): string {
    return buildNormalizedIndex(String(value || ""), { isPinyin }).norm;
  }

  function appendHighlightedText(
    container: Node,
    text: string,
    rawQuery: string,
    options: { isPinyin?: boolean } = {}
  ): void {
    const str = String(text || "");
    const q = (rawQuery || "").trim();
    if (!q) {
      container.appendChild(document.createTextNode(str));
      return;
    }

    const normQuery = buildNormalizedIndex(q, options).norm;
    if (!normQuery) {
      container.appendChild(document.createTextNode(str));
      return;
    }

    const { src, norm, ranges } = buildNormalizedIndex(str, options);
    const matches: Array<[number, number]> = [];
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
      container.appendChild(document.createTextNode(str));
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

  function appendRichContent(
    container: Node,
    html: string | undefined,
    fallbackText: string | undefined,
    rawQuery: string
  ): void {
    if (!html) {
      appendHighlightedText(container, fallbackText || "", rawQuery);
      return;
    }

    container.appendChild(
      buildSafeHtmlFragment(html, (text) => {
        const frag = document.createDocumentFragment();
        appendHighlightedText(frag, text, rawQuery);
        return frag;
      })
    );
  }

  function getFilteredWords(): SavedWord[] {
    const rawQuery = searchInput.value.trim();
    const entries = Object.values(savedWordsMap).reverse();
    if (!rawQuery) return entries;

    const query = normalizeText(rawQuery);
    const pinyinQuery = normalizeText(rawQuery, true);

    return entries.filter((item) => {
      if (normalizeText(item.word).includes(query)) return true;
      if (normalizeText(item.resolvedTerm).includes(query)) return true;
      if (normalizeText(item.pinyin, true).includes(pinyinQuery)) return true;

      const defs = Array.isArray(item.definitions) ? item.definitions : [];
      return defs.some((d) => {
        const defText = d.text || htmlToPlainText(d.html);
        if (normalizeText(defText).includes(query)) return true;
        return (
          Array.isArray(d.examples) &&
          d.examples.some((ex) =>
            normalizeText(htmlToPlainText(ex)).includes(query)
          )
        );
      });
    });
  }

  function updateSelectionToolbar(filtered: SavedWord[]): void {
    for (const word of Array.from(selectedWords)) {
      if (!savedWordsMap[word]) {
        selectedWords.delete(word);
      }
    }

    const totalSelected = selectedWords.size;
    deleteSelectedBtn.disabled = totalSelected === 0;
    deleteSelectedBtn.textContent = `Delete (${totalSelected})`;

    const hasFiltered = filtered.length > 0;
    selectAllCheckbox.disabled = !hasFiltered;
    selectAllLabel.classList.toggle("is-disabled", !hasFiltered);

    if (!hasFiltered) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
      return;
    }

    const selectedFilteredCount = filtered.filter((item) =>
      selectedWords.has(item.word)
    ).length;
    selectAllCheckbox.checked = selectedFilteredCount === filtered.length;
    selectAllCheckbox.indeterminate =
      selectedFilteredCount > 0 && selectedFilteredCount < filtered.length;
  }

  function renderSavedWords(): void {
    const allCount = Object.keys(savedWordsMap).length;
    savedCountEl.textContent = String(allCount);

    const hasWords = allCount > 0;
    exportJsonBtn.disabled = !hasWords;
    exportCsvBtn.disabled = !hasWords;
    exportTsvBtn.disabled = !hasWords;
    enterSelectBtn.disabled = !hasWords;

    if (!hasWords && isSelectionMode) {
      isSelectionMode = false;
      selectedWords.clear();
      normalActions.hidden = false;
      selectionActions.hidden = true;
      wordList.classList.remove("is-selecting");
    }

    const filtered = getFilteredWords();
    updateSelectionToolbar(filtered);
    wordList.textContent = "";

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "card empty-state";
      empty.textContent =
        allCount === 0
          ? "No saved words yet. Click the bookmark icon in the dictionary tooltip to save words here."
          : "No saved words match your search.";
      wordList.appendChild(empty);
      return;
    }

    const rawQuery = searchInput.value.trim();

    filtered.forEach((item) => {
      const card = document.createElement("div");
      card.className = "card word-card";
      if (selectedWords.has(item.word)) {
        card.classList.add("is-selected");
      }

      const row = document.createElement("div");
      row.className = "word-row";

      const main = document.createElement("div");
      main.className = "word-main";

      const selectBox = document.createElement("input");
      selectBox.type = "checkbox";
      selectBox.className = "word-select-checkbox";
      selectBox.checked = selectedWords.has(item.word);
      selectBox.setAttribute("aria-label", `Select ${item.word}`);
      selectBox.addEventListener("change", () => {
        if (selectBox.checked) {
          selectedWords.add(item.word);
        } else {
          selectedWords.delete(item.word);
        }
        card.classList.toggle("is-selected", selectBox.checked);
        updateSelectionToolbar(filtered);
      });
      main.appendChild(selectBox);

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
        if (
          !window.confirm(
            `Remove "${item.word}" from saved words? This cannot be undone.`
          )
        ) {
          return;
        }
        const updated = { ...savedWordsMap };
        delete updated[item.word];
        selectedWords.delete(item.word);
        savedWordsMap = updated;
        chrome.storage.local.set({ [SHUDZ_KEYS.SAVED_WORDS]: updated }, () => {
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

  function renderCacheSettings(): void {
    cacheEnabledToggle.checked = cacheConfig.enabled !== false;
    cacheMaxSelect.value = String(cacheConfig.maxEntries || 200);
    cacheTtlSelect.value = String(cacheConfig.ttlDays || 7);

    const count = Object.keys(dictCacheMap).length;
    const bytes = new Blob([JSON.stringify(dictCacheMap)]).size;
    const kb = (bytes / 1024).toFixed(1);
    cacheUsageText.textContent = `${count} / ${cacheConfig.maxEntries} entries (~${kb} KB)`;
    clearCacheBtn.disabled = count === 0;
  }

  function saveCacheConfig(nextConfig: CacheConfig): void {
    cacheConfig = nextConfig;
    chrome.storage.local.set({ [SHUDZ_KEYS.CACHE_CONFIG]: cacheConfig }, () => {
      renderCacheSettings();
    });
  }

  function broadcastToTabs(message: ShudzMessage): void {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((t) => {
        if (!t.id) return;
        chrome.tabs.sendMessage(t.id, message, () => {
          void chrome.runtime.lastError;
        });
      });
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
    chrome.storage.local.remove(SHUDZ_KEYS.DICT_CACHE, () => {
      dictCacheMap = {};
      renderCacheSettings();
      broadcastToTabs({ type: "clearDictionaryCache" });
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
        broadcastToTabs({ type: "clearDictionaryCache" });
        broadcastToTabs({ type: "setTheme", value: "auto" });
      });
    });
  }

  searchInput.addEventListener("input", renderSavedWords);

  enterSelectBtn.addEventListener("click", () => {
    setSelectionMode(true);
  });

  cancelSelectBtn.addEventListener("click", () => {
    setSelectionMode(false);
  });

  selectAllCheckbox.addEventListener("change", () => {
    const filtered = getFilteredWords();
    if (selectAllCheckbox.checked) {
      filtered.forEach((item) => selectedWords.add(item.word));
    } else {
      filtered.forEach((item) => selectedWords.delete(item.word));
    }
    renderSavedWords();
  });

  deleteSelectedBtn.addEventListener("click", () => {
    const count = selectedWords.size;
    if (count === 0) return;
    if (
      !window.confirm(
        `Remove ${count} selected word(s)? This cannot be undone.`
      )
    ) {
      return;
    }
    const updated = { ...savedWordsMap };
    selectedWords.forEach((word) => {
      delete updated[word];
    });
    selectedWords.clear();
    savedWordsMap = updated;
    chrome.storage.local.set({ [SHUDZ_KEYS.SAVED_WORDS]: updated }, () => {
      setSelectionMode(false);
    });
  });

  function downloadFile(filename: string, content: string, mimeType: string): void {
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

  function formatFlatDefinitions(item: SavedWord): string {
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
    const escapeCsv = (val: string) =>
      `"${String(val ?? "").replace(/"/g, '""')}"`;
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
    const cleanCell = (val: string) =>
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
    if (changes[SHUDZ_KEYS.SAVED_WORDS]) {
      savedWordsMap =
        (changes[SHUDZ_KEYS.SAVED_WORDS].newValue as Record<string, SavedWord>) ||
        {};
      renderSavedWords();
    }
    if (changes[SHUDZ_KEYS.DICT_CACHE]) {
      dictCacheMap =
        (changes[SHUDZ_KEYS.DICT_CACHE].newValue as Record<
          string,
          CachedEntry
        >) || {};
      renderCacheSettings();
    }
    if (changes[SHUDZ_KEYS.CACHE_CONFIG]) {
      cacheConfig = {
        ...DEFAULT_CACHE_CONFIG,
        ...((changes[SHUDZ_KEYS.CACHE_CONFIG].newValue as Partial<CacheConfig>) ||
          {}),
      };
      renderCacheSettings();
    }
    if (changes[SHUDZ_KEYS.THEME]) {
      applyTheme(changes[SHUDZ_KEYS.THEME].newValue);
    }
  });

  loadAll();
});
