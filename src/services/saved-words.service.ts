import { convertToPinyin } from "../content/pinyin.ts";
import { htmlToPlainText, sanitizeWiktionaryHtml } from "../shared/html.ts";
import { SHUDZ_KEYS, storageGet, storageSet } from "../shared/storage.ts";
import type {
  SavedDefinition,
  SavedWord,
  WiktionaryEntry,
} from "../shared/types.ts";

const MAX_SAVED_DEFINITIONS = 8;
const MAX_EXAMPLES_PER_DEF = 2;

export const SavedWordsService = {
  async getAll(): Promise<Record<string, SavedWord>> {
    const result = await storageGet<Record<string, Record<string, SavedWord>>>([
      SHUDZ_KEYS.SAVED_WORDS,
    ]);
    const rawSaved = result[SHUDZ_KEYS.SAVED_WORDS];
    return rawSaved && typeof rawSaved === "object" ? rawSaved : {};
  },

  async isSaved(word: string): Promise<boolean> {
    const all = await SavedWordsService.getAll();
    return Boolean(all[word]);
  },

  async saveWord(
    word: string,
    resolvedTerm: string,
    entries: WiktionaryEntry[]
  ): Promise<SavedWord> {
    const all = { ...(await SavedWordsService.getAll()) };
    const pinyin = convertToPinyin(word);
    const item: SavedWord = {
      word,
      resolvedTerm: resolvedTerm || word,
      pinyin,
      definitions: SavedWordsService.extractSavedDefinitions(entries),
    };
    all[word] = item;
    await storageSet({ [SHUDZ_KEYS.SAVED_WORDS]: all });
    return item;
  },

  async deleteWord(word: string): Promise<void> {
    const all = { ...(await SavedWordsService.getAll()) };
    delete all[word];
    await storageSet({ [SHUDZ_KEYS.SAVED_WORDS]: all });
  },

  async deleteWords(words: string[] | Set<string>): Promise<void> {
    const all = { ...(await SavedWordsService.getAll()) };
    words.forEach((w) => delete all[w]);
    await storageSet({ [SHUDZ_KEYS.SAVED_WORDS]: all });
  },

  async toggleWord(
    word: string,
    resolvedTerm: string,
    entries: WiktionaryEntry[]
  ): Promise<boolean> {
    const all = { ...(await SavedWordsService.getAll()) };
    if (all[word]) {
      delete all[word];
      await storageSet({ [SHUDZ_KEYS.SAVED_WORDS]: all });
      return false;
    }
    const pinyin = convertToPinyin(word);
    all[word] = {
      word,
      resolvedTerm: resolvedTerm || word,
      pinyin,
      definitions: SavedWordsService.extractSavedDefinitions(entries),
    };
    await storageSet({ [SHUDZ_KEYS.SAVED_WORDS]: all });
    return true;
  },

  extractSavedDefinitions(entries: WiktionaryEntry[]): SavedDefinition[] {
    const result: SavedDefinition[] = [];
    let count = 0;

    for (const entry of entries) {
      if (count >= MAX_SAVED_DEFINITIONS) break;
      const defs = Array.isArray(entry.definitions) ? entry.definitions : [];
      for (const def of defs) {
        if (count >= MAX_SAVED_DEFINITIONS) break;
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

  formatFlatDefinitions(item: SavedWord): string {
    const defs = Array.isArray(item.definitions) ? item.definitions : [];
    return defs
      .map((d) => {
        const prefix = d.partOfSpeech ? `[${d.partOfSpeech}] ` : "";
        const body = d.text || htmlToPlainText(d.html);
        return `${prefix}${body}`.trim();
      })
      .filter(Boolean)
      .join("; ");
  },

  exportAsJson(items: SavedWord[]): string {
    return JSON.stringify(items, null, 2);
  },

  exportAsCsv(items: SavedWord[]): string {
    const escapeCsv = (val: string) =>
      `"${String(val ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["word", "traditional", "pinyin", "definitions"].join(","),
      ...items.map((item) =>
        [
          escapeCsv(item.word),
          escapeCsv(item.resolvedTerm || ""),
          escapeCsv(item.pinyin || ""),
          escapeCsv(SavedWordsService.formatFlatDefinitions(item)),
        ].join(",")
      ),
    ];
    return "\uFEFF" + rows.join("\r\n");
  },

  exportAsAnkiTsv(items: SavedWord[]): string {
    const sanitizeTsv = (val: string) =>
      String(val ?? "")
        .replace(/\t/g, " ")
        .replace(/\r?\n/g, " ")
        .trim();
    const rows = items.map((item) =>
      [
        sanitizeTsv(item.word),
        sanitizeTsv(item.resolvedTerm || item.word),
        sanitizeTsv(item.pinyin || ""),
        sanitizeTsv(SavedWordsService.formatFlatDefinitions(item)),
      ].join("\t")
    );
    return rows.join("\n");
  },
};
