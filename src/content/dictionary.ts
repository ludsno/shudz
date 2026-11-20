import {
  buildSafeHtmlFragment,
  htmlToPlainText,
  sanitizeWiktionaryHtml,
} from "../shared/html";
import {
  DEFAULT_CACHE_CONFIG,
  SHUDZ_KEYS,
  storageGet,
  storageSet,
} from "../shared/storage";
import { normalizeChineseSelection } from "../shared/text";
import type {
  CachedEntry,
  SavedDefinition,
  SavedWord,
  WiktionaryApiResponse,
  WiktionaryDefinition,
  WiktionaryEntry,
} from "../shared/types";
import { convertToPinyin } from "./pinyin";
import {
  MAX_DEFINITIONS,
  MAX_EXAMPLES_PER_DEF,
  WIKTIONARY_API_BASE,
  WIKTIONARY_HTML_BASE,
  WIKTIONARY_PAGE_BASE,
  shudzState,
} from "./state";
import { Tooltip } from "./tooltip";

interface HtmlFallbackResult {
  definitions: WiktionaryEntry[];
  resolvedTerm: string;
}

export const Dictionary = {
  normalizeChineseSelection,

  cancelPendingLookup(): void {
    shudzState.activeLookupId++;
  },

  createMessageNode(text: string): HTMLDivElement {
    const div = document.createElement("div");
    div.className = "def-text";
    div.textContent = text;
    return div;
  },

  async fetchDefinition(word: string, range: Range): Promise<void> {
    const requestId = ++shudzState.activeLookupId;
    await Tooltip.ensureTemplateLoaded();
    if (requestId !== shudzState.activeLookupId) return;

    const cached = await Dictionary.getCachedEntry(word);
    if (requestId !== shudzState.activeLookupId) return;

    if (cached) {
      await Dictionary.renderDefinitions(
        word,
        cached.definitions,
        cached.resolvedTerm || word,
        range,
        requestId
      );
      return;
    }

    const loading = Dictionary.createMessageNode("Loading definition...");
    Tooltip.show(word, loading, range);

    try {
      const data = await Dictionary.fetchWiktionaryData(word);
      if (requestId !== shudzState.activeLookupId) return;
      await Dictionary.handleWiktionaryResponse(word, data, range, requestId);
    } catch (error) {
      if (requestId !== shudzState.activeLookupId) return;
      Dictionary.showErrorTooltip(word, range);
      console.error(error);
    }
  },

  trimEntriesForCache(entries: WiktionaryEntry[]): WiktionaryEntry[] {
    const trimmed: WiktionaryEntry[] = [];
    let count = 0;

    for (const entry of entries) {
      if (count >= MAX_DEFINITIONS) break;
      const defs = Array.isArray(entry.definitions) ? entry.definitions : [];
      const keptDefs: WiktionaryDefinition[] = [];

      for (const def of defs) {
        if (count >= MAX_DEFINITIONS) break;
        const cleanDef: WiktionaryDefinition = {
          definition: def.definition || "",
        };
        if (Array.isArray(def.examples) && def.examples.length > 0) {
          cleanDef.examples = def.examples.slice(0, MAX_EXAMPLES_PER_DEF);
        }
        if (Array.isArray(def.parsedExamples) && def.parsedExamples.length > 0) {
          cleanDef.parsedExamples = def.parsedExamples.slice(
            0,
            MAX_EXAMPLES_PER_DEF
          );
        }
        if (Array.isArray(def.tags) && def.tags.length > 0) {
          cleanDef.tags = def.tags;
        }
        if (Array.isArray(def.glosses) && def.glosses.length > 0) {
          cleanDef.glosses = def.glosses;
        }
        if (def.note) cleanDef.note = def.note;
        if (def.senseid) cleanDef.senseid = def.senseid;
        keptDefs.push(cleanDef);
        count++;
      }

      if (keptDefs.length > 0) {
        trimmed.push({
          partOfSpeech: entry.partOfSpeech || "",
          language: entry.language || "",
          definitions: keptDefs,
        });
      }
    }

    return trimmed;
  },

  getCacheSettings(): { enabled: boolean; maxEntries: number; ttlMs: number } {
    const cfg = shudzState.cacheConfig || DEFAULT_CACHE_CONFIG;
    const enabled = cfg.enabled !== false;
    const maxEntries =
      Number(cfg.maxEntries) > 0
        ? Number(cfg.maxEntries)
        : DEFAULT_CACHE_CONFIG.maxEntries;
    const ttlDays =
      Number(cfg.ttlDays) > 0
        ? Number(cfg.ttlDays)
        : DEFAULT_CACHE_CONFIG.ttlDays;
    return {
      enabled,
      maxEntries,
      ttlMs: ttlDays * 24 * 60 * 60 * 1000,
    };
  },

  async getCachedEntry(word: string): Promise<CachedEntry | null> {
    const { enabled, ttlMs } = Dictionary.getCacheSettings();
    if (!enabled) return null;

    const memEntry = shudzState.dictionaryCache.get(word);
    const now = Date.now();
    if (memEntry && now - memEntry.cachedAt < ttlMs) {
      return memEntry;
    }
    if (memEntry) {
      shudzState.dictionaryCache.delete(word);
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
      shudzState.dictionaryCache.set(word, stored);
      return stored;
    }
    return null;
  },

  async setCachedEntry(
    word: string,
    definitions: WiktionaryEntry[],
    resolvedTerm: string
  ): Promise<void> {
    const { enabled, maxEntries, ttlMs } = Dictionary.getCacheSettings();
    if (!enabled || !definitions || definitions.length === 0) return;

    const payload: CachedEntry = {
      definitions: Dictionary.trimEntriesForCache(definitions),
      resolvedTerm: resolvedTerm || word,
      cachedAt: Date.now(),
    };
    if (payload.definitions.length === 0) return;

    shudzState.dictionaryCache.set(word, payload);

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
  },

  clearCache(): void {
    shudzState.dictionaryCache.clear();
  },

  extractSavedDefinitions(entries: WiktionaryEntry[]): SavedDefinition[] {
    const result: SavedDefinition[] = [];
    let count = 0;

    for (const entry of entries) {
      if (count >= MAX_DEFINITIONS) break;
      const defs = Array.isArray(entry.definitions) ? entry.definitions : [];
      for (const def of defs) {
        if (count >= MAX_DEFINITIONS) break;
        const html = sanitizeWiktionaryHtml(def.definition || "");
        const text = htmlToPlainText(html);
        const examplesRaw: string[] = [];
        if (Array.isArray(def.examples)) {
          examplesRaw.push(...def.examples);
        }
        if (Array.isArray(def.parsedExamples)) {
          def.parsedExamples.forEach((ex) => {
            if (ex.example) {
              examplesRaw.push(
                ex.translation
                  ? `${ex.example} — ${ex.translation}`
                  : ex.example
              );
            }
          });
        }
        const examples = examplesRaw
          .slice(0, MAX_EXAMPLES_PER_DEF)
          .map((ex) => sanitizeWiktionaryHtml(ex))
          .filter((ex) => htmlToPlainText(ex).length > 0);

        if (text || examples.length > 0) {
          result.push({
            partOfSpeech: entry.partOfSpeech || "",
            language: entry.language || "",
            html,
            text,
            examples,
          });
          count++;
        }
      }
    }

    return result;
  },

  async isWordSaved(word: string): Promise<boolean> {
    const result = await storageGet<Record<string, Record<string, SavedWord>>>([
      SHUDZ_KEYS.SAVED_WORDS,
    ]);
    const saved = result[SHUDZ_KEYS.SAVED_WORDS];
    return Boolean(saved && typeof saved === "object" && saved[word]);
  },

  async toggleSavedWord(
    word: string,
    resolvedTerm: string,
    entries: WiktionaryEntry[]
  ): Promise<boolean> {
    const result = await storageGet<Record<string, Record<string, SavedWord>>>([
      SHUDZ_KEYS.SAVED_WORDS,
    ]);
    const rawSaved = result[SHUDZ_KEYS.SAVED_WORDS];
    const saved: Record<string, SavedWord> =
      rawSaved && typeof rawSaved === "object" ? { ...rawSaved } : {};

    if (saved[word]) {
      delete saved[word];
      await storageSet({ [SHUDZ_KEYS.SAVED_WORDS]: saved });
      return false;
    }

    const pinyin = convertToPinyin(word);
    saved[word] = {
      word,
      resolvedTerm: resolvedTerm || word,
      pinyin,
      definitions: Dictionary.extractSavedDefinitions(entries),
    };
    await storageSet({ [SHUDZ_KEYS.SAVED_WORDS]: saved });
    return true;
  },

  async renderDefinitions(
    word: string,
    chineseDefinitions: WiktionaryEntry[],
    resolvedTerm: string,
    range: Range,
    requestId?: number
  ): Promise<void> {
    const fragment = document.createDocumentFragment();
    const defsNode = Dictionary.formatWiktionaryData(chineseDefinitions);
    if (defsNode) {
      fragment.appendChild(defsNode);
    }
    const note =
      resolvedTerm !== word
        ? `Showing traditional entry for ${resolvedTerm}.`
        : null;
    fragment.appendChild(Dictionary.buildWiktionaryLink(resolvedTerm, note));

    const isSaved = await Dictionary.isWordSaved(word);
    if (requestId !== undefined && requestId !== shudzState.activeLookupId) return;

    Tooltip.show(word, fragment, range, {
      isSaved,
      onToggleSave: () =>
        Dictionary.toggleSavedWord(word, resolvedTerm, chineseDefinitions),
    });
  },

  async fetchWiktionaryData(word: string): Promise<WiktionaryApiResponse | null> {
    const response = await fetch(
      `${WIKTIONARY_API_BASE}${encodeURIComponent(word)}`
    );
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as WiktionaryApiResponse;
  },

  async fetchWiktionaryHtml(word: string): Promise<string | null> {
    const response = await fetch(
      `${WIKTIONARY_HTML_BASE}${encodeURIComponent(word)}`
    );
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  },

  async handleWiktionaryResponse(
    word: string,
    data: WiktionaryApiResponse | null,
    range: Range,
    requestId?: number
  ): Promise<void> {
    const fragment = document.createDocumentFragment();

    let chineseDefinitions = data
      ? Dictionary.extractChineseDefinitions(data, { allowTranslingual: false })
      : null;
    let resolvedTerm = word;

    if (!chineseDefinitions || chineseDefinitions.length === 0) {
      const htmlFallback = await Dictionary.fetchChineseFromHtml(word);
      if (requestId !== undefined && requestId !== shudzState.activeLookupId) return;
      if (htmlFallback && htmlFallback.definitions.length > 0) {
        chineseDefinitions = htmlFallback.definitions;
        resolvedTerm = htmlFallback.resolvedTerm || word;
      } else if (data) {
        chineseDefinitions = Dictionary.extractChineseDefinitions(data, {
          allowTranslingual: true,
        });
      }
    }

    if (chineseDefinitions && chineseDefinitions.length > 0) {
      await Dictionary.setCachedEntry(word, chineseDefinitions, resolvedTerm);
      if (requestId !== undefined && requestId !== shudzState.activeLookupId) return;
      await Dictionary.renderDefinitions(
        word,
        chineseDefinitions,
        resolvedTerm,
        range,
        requestId
      );
      return;
    } else if (!data) {
      fragment.appendChild(
        Dictionary.createMessageNode(
          "The public Wiktionary API does not have a definition entry for this exact term."
        )
      );
      fragment.appendChild(
        Dictionary.buildWiktionaryLink(
          word,
          "The entry may still exist on the main site; click to open the full page on Wiktionary."
        )
      );
    } else {
      fragment.appendChild(
        Dictionary.createMessageNode(
          "No Chinese definition is exposed by the public Wiktionary API for this term."
        )
      );
      fragment.appendChild(
        Dictionary.buildWiktionaryLink(
          word,
          "The entry almost certainly exists on the main site; click to open the full page on Wiktionary."
        )
      );
    }

    if (requestId !== undefined && requestId !== shudzState.activeLookupId) return;
    Tooltip.show(word, fragment, range);
  },

  async fetchChineseFromHtml(
    word: string,
    visited: Set<string> = new Set()
  ): Promise<HtmlFallbackResult | null> {
    if (visited.has(word)) return null;
    visited.add(word);

    const html = await Dictionary.fetchWiktionaryHtml(word);
    if (!html) return null;

    const doc = new DOMParser().parseFromString(html, "text/html");
    const chineseHeading = doc.getElementById("Chinese");
    const chineseSection = chineseHeading?.closest("section");
    if (!chineseSection) return null;

    const zhSeeTarget = Dictionary.extractZhSeeTarget(chineseSection);
    if (zhSeeTarget && !visited.has(zhSeeTarget)) {
      const targetData = await Dictionary.fetchWiktionaryData(zhSeeTarget);
      const targetDefs = targetData
        ? Dictionary.extractChineseDefinitions(targetData, {
            allowTranslingual: false,
          })
        : null;
      if (targetDefs && targetDefs.length > 0) {
        return { definitions: targetDefs, resolvedTerm: zhSeeTarget };
      }
      return await Dictionary.fetchChineseFromHtml(zhSeeTarget, visited);
    }

    const definitions = Dictionary.parseChineseSectionFromHtml(chineseSection);
    if (definitions.length > 0) {
      return { definitions, resolvedTerm: word };
    }
    return null;
  },

  extractZhSeeTarget(chineseSection: Element): string | null {
    const zhSeeTable = chineseSection.querySelector(".zh-see");
    if (zhSeeTable) {
      const hantLink = zhSeeTable.querySelector(".Hant a[href]");
      const hantLabel = (hantLink?.textContent || "").trim();
      if (hantLabel && /[\u4e00-\u9fff]/.test(hantLabel)) {
        return hantLabel;
      }
    }

    const text = chineseSection.textContent || "";
    if (!/For pronunciation and definitions of/i.test(text)) {
      return null;
    }

    const scope = zhSeeTable || chineseSection;
    const links = scope.querySelectorAll("a[href]");
    for (const link of links) {
      if (link.closest(".Hans")) continue;
      const href = link.getAttribute("href") || "";
      const label = (link.textContent || "").trim();
      if (
        label &&
        /[\u4e00-\u9fff]/.test(label) &&
        !href.includes("Appendix:")
      ) {
        return label;
      }
    }
    return null;
  },

  parseChineseSectionFromHtml(chineseSection: Element): WiktionaryEntry[] {
    const skipHeadingRegex =
      /^(Glyph origin|Etymology|Pronunciation|Compounds|Descendants|Derived terms|Related terms|Usage notes|References|See also|Further reading|External links|Trivia|Notes)/i;
    const entries: WiktionaryEntry[] = [];

    const sections = chineseSection.querySelectorAll("section");
    sections.forEach((sec) => {
      const heading = sec.querySelector(":scope > h3, :scope > h4, :scope > h5");
      const ol = sec.querySelector(":scope > ol");
      if (!heading || !ol) return;

      const posText = (heading.textContent || "").trim();
      if (!posText || skipHeadingRegex.test(posText)) return;

      const definitions: WiktionaryDefinition[] = [];
      const items = ol.querySelectorAll(":scope > li");
      items.forEach((li) => {
        const clone = li.cloneNode(true) as Element;
        const examples: string[] = [];

        const itemNodes = clone.querySelectorAll(
          ":scope > dl > dd, :scope > ul > li"
        );
        if (itemNodes.length > 0) {
          itemNodes.forEach((itemNode) => {
            const text = (itemNode.textContent || "").trim();
            if (text) examples.push(itemNode.innerHTML);
          });
        } else {
          clone.querySelectorAll(":scope > dl, :scope > ul").forEach((node) => {
            const text = (node.textContent || "").trim();
            if (text) examples.push(node.innerHTML);
          });
        }

        clone.querySelectorAll("dl, ul, ol").forEach((nested) => nested.remove());

        const defHtml = clone.innerHTML.trim();
        if (defHtml) {
          definitions.push({
            definition: defHtml,
            examples,
          });
        }
      });

      if (definitions.length > 0) {
        entries.push({
          partOfSpeech: posText,
          language: "Chinese",
          definitions,
        });
      }
    });

    return entries;
  },

  showErrorTooltip(word: string, range: Range): void {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(
      Dictionary.createMessageNode(
        "The public Wiktionary API did not return a definition."
      )
    );
    fragment.appendChild(
      Dictionary.buildWiktionaryLink(
        word,
        "The entry very likely exists on the website; click to open the Wiktionary page directly."
      )
    );
    Tooltip.show(word, fragment, range);
  },

  buildWiktionaryLink(term: string, note: string | null): HTMLDivElement {
    const url = `${WIKTIONARY_PAGE_BASE}${encodeURIComponent(term)}#Chinese`;
    const container = document.createElement("div");
    container.className = "wiktionary-link";

    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open page on Wiktionary";
    container.appendChild(link);

    if (note) {
      const noteSpan = document.createElement("span");
      noteSpan.className = "wiktionary-note";
      noteSpan.textContent = note;
      container.appendChild(noteSpan);
    }

    return container;
  },

  formatWiktionaryData(entries: WiktionaryEntry[]): HTMLUListElement | null {
    const list = document.createElement("ul");
    let count = 0;

    entries.forEach((entry) => {
      const pos = entry.partOfSpeech || "";
      const lang = entry.language || "";
      const defs = Array.isArray(entry.definitions) ? entry.definitions : [];

      defs.forEach((def) => {
        if (count >= MAX_DEFINITIONS) return;

        const li = document.createElement("li");

        const definitionText = def.definition || "";

        if (pos) {
          const posSpan = document.createElement("span");
          posSpan.className = "pos-tag";
          posSpan.textContent = pos;
          li.appendChild(posSpan);
          li.appendChild(document.createTextNode(" "));
        }

        if (lang) {
          const langSpan = document.createElement("span");
          langSpan.className = "lang-tag";
          langSpan.textContent = lang;
          li.appendChild(langSpan);
          li.appendChild(document.createTextNode(" "));
        }

        const defDiv = document.createElement("div");
        defDiv.className = "def-text";
        defDiv.appendChild(buildSafeHtmlFragment(definitionText));
        li.appendChild(defDiv);

        const metaParts: string[] = [];

        if (Array.isArray(def.tags) && def.tags.length > 0) {
          const tags = def.tags
            .map((t) => (typeof t === "string" ? t : ""))
            .filter(Boolean)
            .join(", ");
          if (tags) metaParts.push(tags);
        }

        if (Array.isArray(def.glosses) && def.glosses.length > 0) {
          const glosses = def.glosses
            .map((g) => (typeof g === "string" ? g : ""))
            .filter(Boolean)
            .join("; ");
          if (glosses) metaParts.push(glosses);
        }

        if (def.note && typeof def.note === "string") {
          metaParts.push(def.note);
        }

        if (def.senseid && typeof def.senseid === "string") {
          metaParts.push(`#${def.senseid}`);
        }

        if (metaParts.length > 0) {
          const metaDiv = document.createElement("div");
          metaDiv.className = "def-meta";
          metaDiv.textContent = metaParts.join(" • ");
          li.appendChild(metaDiv);
        }

        const examples: string[] = [];
        if (Array.isArray(def.examples)) {
          examples.push(...def.examples);
        }
        if (Array.isArray(def.parsedExamples)) {
          def.parsedExamples.forEach((ex) => {
            if (ex.example) {
              if (ex.translation) {
                examples.push(`${ex.example} — ${ex.translation}`);
              } else {
                examples.push(ex.example);
              }
            }
          });
        }

        if (examples.length > 0) {
          const exampleList = document.createElement("ul");
          exampleList.className = "example-list";
          examples.slice(0, MAX_EXAMPLES_PER_DEF).forEach((ex) => {
            const liEx = document.createElement("li");
            liEx.className = "example-item";
            liEx.appendChild(buildSafeHtmlFragment(ex));
            if ((liEx.textContent || "").trim()) {
              exampleList.appendChild(liEx);
            }
          });
          if (exampleList.children.length > 0) {
            li.appendChild(exampleList);
          }
        }

        list.appendChild(li);
        count++;
      });
    });

    return list.children.length > 0 ? list : null;
  },

  extractChineseDefinitions(
    data: WiktionaryApiResponse | null,
    { allowTranslingual = true }: { allowTranslingual?: boolean } = {}
  ): WiktionaryEntry[] | null {
    if (!data || typeof data !== "object") return null;

    const chineseRegex = /(Chinese|Mandarin|Cantonese)/i;
    const result: WiktionaryEntry[] = [];

    Object.keys(data).forEach((key) => {
      const entries = data[key];
      if (!Array.isArray(entries)) return;

      entries.forEach((entry) => {
        if (!entry || typeof entry !== "object") return;
        const langLabel = entry.language || "";
        if (chineseRegex.test(langLabel)) {
          result.push(entry);
        }
      });
    });

    if (result.length === 0 && allowTranslingual) {
      Object.keys(data).forEach((key) => {
        const entries = data[key];
        if (!Array.isArray(entries)) return;

        entries.forEach((entry) => {
          if (!entry || typeof entry !== "object") return;
          const langLabel = entry.language || "";
          if (/Translingual/i.test(langLabel)) {
            result.push(entry);
          }
        });
      });
    }

    return result.length > 0 ? result : null;
  },
};
