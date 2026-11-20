import { buildSafeHtmlFragment } from "../shared/html.ts";
import { buildNormalizedIndex } from "../shared/text.ts";

export function normalizeText(value: unknown, isPinyin = false): string {
  return buildNormalizedIndex(String(value || ""), { isPinyin }).norm;
}

export function appendHighlightedText(
  container: Node,
  text: string,
  rawQuery: string,
  options: { isPinyin?: boolean } = {}
): void {
  const str = String(text || "");
  const q = (rawQuery || "").trim();
  if (!q) {
    container.appendChild(document.createTextNode(str));
    return;
  }

  const normQuery = buildNormalizedIndex(q, options).norm;
  if (!normQuery) {
    container.appendChild(document.createTextNode(str));
    return;
  }

  const { src, norm, ranges } = buildNormalizedIndex(str, options);
  const matches: Array<[number, number]> = [];
  let pos = 0;

  while (pos <= norm.length - normQuery.length) {
    const idx = norm.indexOf(normQuery, pos);
    if (idx === -1) break;
    const start = ranges[idx][0];
    const end = ranges[idx + normQuery.length - 1][1];
    matches.push([start, end]);
    pos = idx + normQuery.length;
  }

  if (matches.length === 0) {
    container.appendChild(document.createTextNode(str));
    return;
  }

  let cursor = 0;
  matches.forEach(([start, end]) => {
    if (start > cursor) {
      container.appendChild(document.createTextNode(src.slice(cursor, start)));
    }
    const mark = document.createElement("mark");
    mark.className = "search-highlight";
    mark.textContent = src.slice(start, end);
    container.appendChild(mark);
    cursor = end;
  });

  if (cursor < src.length) {
    container.appendChild(document.createTextNode(src.slice(cursor)));
  }
}

export function appendRichContent(
  container: Node,
  html: string | undefined,
  fallbackText: string | undefined,
  rawQuery: string
): void {
  if (!html) {
    appendHighlightedText(container, fallbackText || "", rawQuery);
    return;
  }

  container.appendChild(
    buildSafeHtmlFragment(html, (text) => {
      const frag = document.createDocumentFragment();
      appendHighlightedText(frag, text, rawQuery);
      return frag;
    })
  );
}
