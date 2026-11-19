const ALLOWED_WIKTIONARY_TAGS = new Set([
  "SPAN",
  "B",
  "I",
  "STRONG",
  "EM",
  "SMALL",
  "SUB",
  "SUP",
  "BR",
]);

export function htmlToPlainText(html?: string): string {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(String(html), "text/html");
  doc.body.querySelectorAll("br").forEach((br) => {
    br.replaceWith("\n");
  });
  return (doc.body.textContent || "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export function buildSafeHtmlFragment(
  html: string,
  renderText: (text: string) => Node = (text) => document.createTextNode(text)
): DocumentFragment {
  const output = document.createDocumentFragment();
  if (!html) return output;

  const doc = new DOMParser().parseFromString(String(html), "text/html");

  function importSafe(node: ChildNode): Node | null {
    if (node.nodeType === Node.TEXT_NODE) {
      return renderText(node.textContent || "");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const elem = node as Element;
    const tag = elem.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "LINK") {
      return null;
    }
    if (tag === "BR") {
      return document.createElement("br");
    }

    const frag = document.createDocumentFragment();
    elem.childNodes.forEach((child) => {
      const imported = importSafe(child);
      if (imported) frag.appendChild(imported);
    });

    if (!ALLOWED_WIKTIONARY_TAGS.has(tag)) {
      return frag;
    }

    const el = document.createElement(tag.toLowerCase());
    const style = elem.getAttribute("style");
    if (style) el.setAttribute("style", style);
    const cls = elem.getAttribute("class");
    if (cls) el.setAttribute("class", cls);
    const lang = elem.getAttribute("lang");
    if (lang) el.setAttribute("lang", lang);
    el.appendChild(frag);
    return el;
  }

  doc.body.childNodes.forEach((child) => {
    const imported = importSafe(child);
    if (imported) output.appendChild(imported);
  });

  return output;
}

export function sanitizeWiktionaryHtml(html: string): string {
  if (!html) return "";
  const wrapper = document.createElement("div");
  wrapper.appendChild(buildSafeHtmlFragment(html));
  return wrapper.innerHTML.trim();
}
