import test from "node:test";
import assert from "node:assert/strict";
import { CacheService } from "../src/services/cache.service.ts";
import { SavedWordsService } from "../src/services/saved-words.service.ts";
import { WiktionaryService } from "../src/services/wiktionary.service.ts";
import type { SavedWord, WiktionaryEntry } from "../src/shared/types.ts";

test("CacheService trims definitions and examples according to limits", () => {
  const cache = new CacheService({ enabled: true, maxEntries: 10, ttlDays: 7 });
  const rawEntries: WiktionaryEntry[] = [
    {
      partOfSpeech: "verb",
      language: "Chinese",
      definitions: [
        {
          definition: "to go",
          examples: ["ex 1", "ex 2", "ex 3", "ex 4"],
        },
        {
          definition: "to cross",
        },
      ],
    },
  ];

  const trimmed = cache.trimEntriesForCache(rawEntries);
  assert.equal(trimmed.length, 1);
  assert.equal(trimmed[0].definitions?.length, 2);
  assert.equal(trimmed[0].definitions?.[0].examples?.length, 2); // Capped at MAX_EXAMPLES_PER_DEF (2)
});

test("SavedWordsService formats flat definitions and exports TSV, CSV, and JSON", () => {
  const item: SavedWord = {
    word: "过",
    resolvedTerm: "過",
    pinyin: "guò",
    definitions: [
      {
        partOfSpeech: "verb",
        language: "Chinese",
        text: "to pass; to cross",
        examples: ["过河 (guò hé)"],
      },
    ],
  };

  const flat = SavedWordsService.formatFlatDefinitions(item);
  assert.equal(flat, "[verb] to pass; to cross");

  const jsonStr = SavedWordsService.exportAsJson([item]);
  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].word, "过");

  const csvStr = SavedWordsService.exportAsCsv([item]);
  assert.ok(csvStr.includes('"过","過","guò","[verb] to pass; to cross"'));

  const tsvStr = SavedWordsService.exportAsAnkiTsv([item]);
  assert.ok(tsvStr.includes("过\t過\tguò\t[verb] to pass; to cross"));
});

test("WiktionaryService extracts Chinese and Translingual definitions correctly", () => {
  const apiData = {
    en: [
      {
        language: "French",
        partOfSpeech: "noun",
        definitions: [{ definition: "something in French" }],
      },
      {
        language: "Chinese",
        partOfSpeech: "verb",
        definitions: [{ definition: "to cross" }],
      },
      {
        language: "Translingual",
        partOfSpeech: "character",
        definitions: [{ definition: "Han character" }],
      },
    ],
  };

  const chineseOnly = WiktionaryService.extractChineseDefinitions(apiData, {
    allowTranslingual: false,
  });
  assert.equal(chineseOnly?.length, 1);
  assert.equal(chineseOnly?.[0].language, "Chinese");

  const chineseWithTranslingual = WiktionaryService.extractChineseDefinitions(
    { en: [apiData.en[2]] },
    { allowTranslingual: true }
  );
  assert.equal(chineseWithTranslingual?.length, 1);
  assert.equal(chineseWithTranslingual?.[0].language, "Translingual");
});
