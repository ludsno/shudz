import {
  DEFAULT_CACHE_CONFIG,
  SHUDZ_KEYS,
  normalizeTheme,
} from "../shared/storage";
import type {
  CacheConfig,
  CachedEntry,
  SavedWord,
  ShudzMessage,
  ThemeMode,
} from "../shared/types";

interface NormalizedIndex {
  src: string;
  norm: string;
  ranges: Array<[number, number]>;
}

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
  const clearWordsBtn = document.getElementById(
    "clearWordsBtn"
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

  function normalizeForSearch(value: unknown): string {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function normalizePinyinForSearch(value: unknown): string {
    return normalizeForSearch(value).replace(/\s+/g, "");
  }

  function buildNormalizedIndex(
    text: string,
    { isPinyin = false }: { isPinyin?: boolean } = {}
  ): NormalizedIndex {
    const src = String(text || "");
    let norm = "";
    const ranges: Array<[number, number]> = [];

    for (let i = 0; i < src.length; ) {
      const cp = src.codePointAt(i) ?? 0;
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

  function htmlToPlainText(html?: string): string {
    if (!html) return "";
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
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

    function importSafe(node: ChildNode): Node | null {
      if (node.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        appendHighlightedText(frag, node.textContent || "", rawQuery);
        return frag;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return null;

      const elem = node as Element;
      const tag = elem.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "LINK") return null;

      const frag = document.createDocumentFragment();
      elem.childNodes.forEach((child) => {
        const imported = importSafe(child);
        if (imported) frag.appendChild(imported);
      });

      if (!allowedTags.has(tag)) return frag;

      const el = document.createElement(tag.toLowerCase());
      const style = elem.getAttribute("style");
      if (style) el.setAttribute("style", style);
      const cls = elem.getAttribute("class");
      if (cls) el.setAttribute("class", cls);
      const lang = elem.getAttribute("lang");
      if (lang) el.setAttribute("lang", lang);
      el.appendChild(frag);
      return el;
    }

    doc.body.childNodes.forEach((child) => {
      const imported = importSafe(child);
      if (imported) container.appendChild(imported);
    });
  }

  function getFilteredWords(): SavedWord[] {
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

  function renderSavedWords(): void {
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
          ? "No saved words yet. Click the bookmark icon in the dictionary tooltip to save words here."
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

  clearWordsBtn.addEventListener("click", () => {
    if (!window.confirm("Remove all saved words? This cannot be undone.")) {
      return;
    }
    savedWordsMap = {};
    chrome.storage.local.set({ [SHUDZ_KEYS.SAVED_WORDS]: {} }, () => {
      renderSavedWords();
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
