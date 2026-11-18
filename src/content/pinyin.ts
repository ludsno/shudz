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
