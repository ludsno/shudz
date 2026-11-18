export function convertToPinyin(text: string): string {
  try {
    if (typeof pinyinPro === "undefined") return "";
    const raw = pinyinPro.pinyin(text, { toneType: "mark" });
    if (!raw) return "";
    if (text && text.length > 1) {
      return String(raw).replace(/\s+/g, "");
    }
    return raw;
  } catch {
    return "";
  }
}

export function convertToPinyinArray(text: string): string[] | null {
  try {
    if (typeof pinyinPro === "undefined" || !text) return null;
    const arr = pinyinPro.pinyin(text, { toneType: "mark", type: "array" });
    if (Array.isArray(arr) && arr.length === text.length) {
      return arr;
    }
    return null;
  } catch {
    return null;
  }
}
