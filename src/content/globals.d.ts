declare const pinyinPro:
  | {
      pinyin(text: string, options?: { toneType?: "symbol" | "num" | "none" | "mark" }): string;
    }
  | undefined;
