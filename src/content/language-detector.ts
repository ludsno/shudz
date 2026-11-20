import { LANGUAGE_MIN_CHARS, TEXT_SAMPLE_LENGTH } from "./state.ts";

export function detectPageLanguage(): boolean {
  const text = (document.body?.innerText || "").slice(0, TEXT_SAMPLE_LENGTH);
  return (text.match(/[\u4e00-\u9fa5]/g) || []).length > LANGUAGE_MIN_CHARS;
}
