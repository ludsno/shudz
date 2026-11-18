export interface NormalizedIndex {
  src: string;
  norm: string;
  ranges: Array<[number, number]>;
}

export function containsChinese(text: string): boolean {
  if (!text) return false;
  return /[\u4e00-\u9fff]/.test(text);
}

export function normalizeChineseSelection(text: string): string {
  if (!text) return "";
  const matches = text.match(/[\u4e00-\u9fff]+/g);
  if (!matches) return text;
  return matches.join("");
}

export function buildNormalizedIndex(
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
