import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNormalizedIndex,
  containsChinese,
  normalizeChineseSelection,
} from "../src/shared/text.ts";

test("containsChinese detects CJK ideographs", () => {
  assert.equal(containsChinese("公司"), true);
  assert.equal(containsChinese("hello 世界"), true);
  assert.equal(containsChinese("hello world"), false);
  assert.equal(containsChinese(""), false);
});

test("normalizeChineseSelection strips punctuation and non-Chinese text", () => {
  assert.equal(normalizeChineseSelection("  公司 (gōngsī) "), "公司");
  assert.equal(normalizeChineseSelection("学习。"), "学习");
  assert.equal(normalizeChineseSelection("abc"), "abc");
});

test("buildNormalizedIndex strips pinyin tone marks and maps ranges accurately", () => {
  const { src, norm, ranges } = buildNormalizedIndex("zhōng guó", {
    isPinyin: true,
  });
  assert.equal(norm, "zhongguo");
  assert.equal(ranges.length, norm.length);

  const idx = norm.indexOf("guo");
  const start = ranges[idx][0];
  const end = ranges[idx + "guo".length - 1][1];
  assert.equal(src.slice(start, end), "guó");
});

test("buildNormalizedIndex handles u/v equivalence in pinyin", () => {
  const { norm } = buildNormalizedIndex("nǚ", { isPinyin: true });
  const queryNorm = buildNormalizedIndex("nv", { isPinyin: true }).norm;
  assert.equal(norm, "nu");
  assert.equal(norm.includes(queryNorm), true);
});
