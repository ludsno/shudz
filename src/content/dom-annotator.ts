import { containsChinese } from "../shared/text.ts";
import { convertToPinyin, convertToPinyinArray } from "./pinyin.ts";
import { PROCESS_BATCH_SIZE, shudzState } from "./state.ts";

export class DomAnnotator {
  private queue: Text[] = [];
  private isProcessing = false;
  private segmenter: Intl.Segmenter | null = null;
  public hasBeenAnnotated = false;

  queueNodes(rootNode: Node | null): void {
    if (!rootNode) return;

    const walker = document.createTreeWalker(
      rootNode,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node: Node | null;
    while ((node = walker.nextNode())) {
      const textNode = node as Text;
      const parent = textNode.parentElement;
      if (!parent) continue;
      const tag = parent.tagName;
      if (
        containsChinese(textNode.nodeValue || "") &&
        tag !== "SCRIPT" &&
        tag !== "STYLE" &&
        tag !== "TEXTAREA" &&
        tag !== "INPUT" &&
        tag !== "RUBY" &&
        tag !== "RT" &&
        !parent.isContentEditable &&
        !parent.closest("#shudz-tooltip")
      ) {
        this.queue.push(textNode);
      }
    }

    if (!this.isProcessing) {
      this.processBatch();
    }
  }

  processBatch(): void {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const batch = this.queue.splice(0, PROCESS_BATCH_SIZE);

    batch.forEach((textNode) => {
      if (!textNode.parentNode) return;

      let fontClass = "is-sans";
      try {
        if (textNode.parentElement) {
          const parentStyle = window.getComputedStyle(textNode.parentElement);
          const fontFamily = parentStyle.fontFamily.toLowerCase();
          if (this.isFontSerif(fontFamily)) {
            fontClass = "is-serif";
          }
        }
      } catch {
        // ignore style read errors
      }

      const fragment = document.createDocumentFragment();
      const text = textNode.nodeValue || "";
      const pinyinArray = convertToPinyinArray(text);
      const segmenter = this.getSegmenter();
      let offset = 0;

      if (segmenter) {
        const segments = segmenter.segment(text);
        for (const { segment, isWordLike } of segments) {
          const pinyin = pinyinArray
            ? pinyinArray.slice(offset, offset + segment.length).join("")
            : convertToPinyin(segment);
          offset += segment.length;

          if (isWordLike && containsChinese(segment)) {
            fragment.appendChild(
              this.createRubyNode(segment, fontClass, pinyin)
            );
          } else {
            fragment.appendChild(document.createTextNode(segment));
          }
        }
      } else {
        for (const char of text) {
          const pinyin = pinyinArray
            ? pinyinArray.slice(offset, offset + char.length).join("")
            : convertToPinyin(char);
          offset += char.length;

          if (containsChinese(char)) {
            fragment.appendChild(
              this.createRubyNode(char, fontClass, pinyin)
            );
          } else {
            fragment.appendChild(document.createTextNode(char));
          }
        }
      }

      if (textNode.parentNode) {
        textNode.parentNode.replaceChild(fragment, textNode);
      }
    });

    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => this.processBatch());
    } else {
      setTimeout(() => this.processBatch(), 10);
    }
  }

  createRubyNode(
    segment: string,
    fontClass: string,
    pinyinText?: string
  ): HTMLElement {
    const ruby = document.createElement("ruby");
    ruby.textContent = segment;
    ruby.classList.add("shudz-word");
    ruby.dataset.shudz = "1";
    ruby.dataset.segment = segment;

    const rt = document.createElement("rt");
    rt.textContent = pinyinText ?? convertToPinyin(segment);
    rt.className = fontClass;

    ruby.appendChild(rt);
    return ruby;
  }

  clear(): void {
    const body = document.body;
    if (!body) return;

    const rubyNodes = body.querySelectorAll<HTMLElement>(
      "ruby[data-shudz='1']"
    );
    rubyNodes.forEach((ruby) => {
      const segment = ruby.dataset.segment || ruby.textContent || "";
      const textNode = document.createTextNode(segment);
      if (ruby.parentNode) {
        ruby.parentNode.replaceChild(textNode, ruby);
      }
    });

    this.mergeAdjacentTextNodes(body);
    this.queue = [];
    this.isProcessing = false;
    this.segmenter = null;
    this.hasBeenAnnotated = false;
  }

  reapply(): void {
    this.clear();
    this.queueNodes(document.body);
  }

  mergeAdjacentTextNodes(rootNode: Node | null): void {
    if (!rootNode) return;

    const walker = document.createTreeWalker(
      rootNode,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node = walker.nextNode();
    while (node) {
      let next = node.nextSibling;
      while (next && next.nodeType === Node.TEXT_NODE) {
        node.nodeValue = (node.nodeValue || "") + (next.nodeValue || "");
        const toRemove = next;
        next = next.nextSibling;
        if (toRemove.parentNode) {
          toRemove.parentNode.removeChild(toRemove);
        }
      }
      node = walker.nextNode();
    }
  }

  updateSegmentationCssClass(): void {
    const body = document.body;
    if (!body) return;
    body.classList.remove("shudz-word-mode", "shudz-char-mode");
    body.classList.add(
      shudzState.useSmartSegmentation ? "shudz-word-mode" : "shudz-char-mode"
    );
  }

  getSegmenter(): Intl.Segmenter | null {
    if (!shudzState.useSmartSegmentation) {
      return null;
    }
    try {
      if (!window.Intl || !Intl.Segmenter) return null;
      if (!this.segmenter) {
        this.segmenter = new Intl.Segmenter("zh", {
          granularity: "word",
        });
      }
      return this.segmenter;
    } catch {
      return null;
    }
  }

  isFontSerif(fontString: string): boolean {
    if (!fontString) return false;

    const lower = fontString.toLowerCase();
    const hasSansGeneric = lower.includes("sans-serif");
    const hasSerifGeneric = lower.includes("serif");
    const families = lower
      .split(",")
      .map((f) => f.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);

    const firstFamily = families[0] || "";
    const serifFamilies = [
      "noto serif sc",
      "noto serif",
      "songti sc",
      "simsun",
      "pmingliu",
      "times new roman",
      "times",
      "georgia",
      "garamond",
      "palatino",
      "mincho",
    ];

    if (serifFamilies.some((name) => firstFamily.includes(name))) {
      return true;
    }
    if (hasSerifGeneric && !hasSansGeneric) {
      return true;
    }
    return false;
  }
}

export const defaultDomAnnotator = new DomAnnotator();
