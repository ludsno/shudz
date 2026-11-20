import type {
  WiktionaryApiResponse,
  WiktionaryDefinition,
  WiktionaryEntry,
} from "../shared/types.ts";

export const WIKTIONARY_API_BASE =
  "https://en.wiktionary.org/api/rest_v1/page/definition/";
export const WIKTIONARY_HTML_BASE =
  "https://en.wiktionary.org/api/rest_v1/page/html/";
export const WIKTIONARY_PAGE_BASE = "https://en.wiktionary.org/wiki/";

export interface ResolvedWiktionaryData {
  definitions: WiktionaryEntry[];
  resolvedTerm: string;
  isFallback: boolean;
}

export const WiktionaryService = {
  async fetchApi(word: string): Promise<WiktionaryApiResponse | null> {
    const response = await fetch(
      `${WIKTIONARY_API_BASE}${encodeURIComponent(word)}`
    );
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as WiktionaryApiResponse;
  },

  async fetchHtml(word: string): Promise<string | null> {
    const response = await fetch(
      `${WIKTIONARY_HTML_BASE}${encodeURIComponent(word)}`
    );
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
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

  async fetchChineseFromHtml(
    word: string,
    visited: Set<string> = new Set()
  ): Promise<ResolvedWiktionaryData | null> {
    if (visited.has(word)) return null;
    visited.add(word);

    const html = await WiktionaryService.fetchHtml(word);
    if (!html) return null;

    const doc = new DOMParser().parseFromString(html, "text/html");
    const chineseHeading = doc.getElementById("Chinese");
    const chineseSection = chineseHeading?.closest("section");
    if (!chineseSection) return null;

    const zhSeeTarget = WiktionaryService.extractZhSeeTarget(chineseSection);
    if (zhSeeTarget && !visited.has(zhSeeTarget)) {
      const targetData = await WiktionaryService.fetchApi(zhSeeTarget);
      const targetDefs = targetData
        ? WiktionaryService.extractChineseDefinitions(targetData, {
            allowTranslingual: false,
          })
        : null;
      if (targetDefs && targetDefs.length > 0) {
        return {
          definitions: targetDefs,
          resolvedTerm: zhSeeTarget,
          isFallback: true,
        };
      }
      return await WiktionaryService.fetchChineseFromHtml(zhSeeTarget, visited);
    }

    const definitions =
      WiktionaryService.parseChineseSectionFromHtml(chineseSection);
    if (definitions.length > 0) {
      return {
        definitions,
        resolvedTerm: word,
        isFallback: true,
      };
    }
    return null;
  },

  async resolveDefinitions(word: string): Promise<ResolvedWiktionaryData | null> {
    const apiData = await WiktionaryService.fetchApi(word);
    let chineseDefinitions = apiData
      ? WiktionaryService.extractChineseDefinitions(apiData, {
          allowTranslingual: false,
        })
      : null;
    let resolvedTerm = word;
    let isFallback = false;

    if (!chineseDefinitions || chineseDefinitions.length === 0) {
      const htmlFallback = await WiktionaryService.fetchChineseFromHtml(word);
      if (htmlFallback && htmlFallback.definitions.length > 0) {
        chineseDefinitions = htmlFallback.definitions;
        resolvedTerm = htmlFallback.resolvedTerm || word;
        isFallback = true;
      } else if (apiData) {
        chineseDefinitions = WiktionaryService.extractChineseDefinitions(apiData, {
          allowTranslingual: true,
        });
      }
    }

    if (chineseDefinitions && chineseDefinitions.length > 0) {
      return {
        definitions: chineseDefinitions,
        resolvedTerm,
        isFallback,
      };
    }

    return null;
  },
};
