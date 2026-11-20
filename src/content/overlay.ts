import {
  DEFAULT_CACHE_CONFIG,
  SHUDZ_KEYS,
  normalizeTheme,
} from "../shared/storage";
import type { CacheConfig, ShudzMessage } from "../shared/types";
import { Dictionary } from "./dictionary";
import { convertToPinyin, convertToPinyinArray } from "./pinyin";
import {
  LANGUAGE_MIN_CHARS,
  PROCESS_BATCH_SIZE,
  SELECTION_MAX_LENGTH,
  TEXT_SAMPLE_LENGTH,
  shudzState,
} from "./state";
import { Tooltip } from "./tooltip";

let lastMouseDownPos = { x: 0, y: 0 };

export const Overlay = {
  init(): void {
    chrome.storage.local.get(
      [
        shudzState.domainKey,
        SHUDZ_KEYS.SEGMENTATION,
        SHUDZ_KEYS.AUTO_DETECT,
        SHUDZ_KEYS.DICTIONARY,
        SHUDZ_KEYS.MASTER_ENABLED,
        SHUDZ_KEYS.THEME,
        SHUDZ_KEYS.CACHE_CONFIG,
      ],
      (result) => {
        const savedState = result[shudzState.domainKey];
        const savedSeg = result[SHUDZ_KEYS.SEGMENTATION];
        const savedAuto = result[SHUDZ_KEYS.AUTO_DETECT];
        const savedDict = result[SHUDZ_KEYS.DICTIONARY];
        const savedMaster = result[SHUDZ_KEYS.MASTER_ENABLED];
        const savedTheme = result[SHUDZ_KEYS.THEME];
        const savedCacheConfig = result[SHUDZ_KEYS.CACHE_CONFIG] as
          | Partial<CacheConfig>
          | undefined;

        if (typeof savedSeg === "boolean") {
          shudzState.useSmartSegmentation = savedSeg;
        }
        if (typeof savedAuto === "boolean") {
          shudzState.useAutoDetect = savedAuto;
        }
        if (typeof savedDict === "boolean") {
          shudzState.dictionaryEnabled = savedDict;
        }
        if (typeof savedMaster === "boolean") {
          shudzState.masterEnabled = savedMaster;
        }
        if (savedTheme) {
          shudzState.theme = normalizeTheme(savedTheme);
        }
        if (savedCacheConfig && typeof savedCacheConfig === "object") {
          shudzState.cacheConfig = {
            ...DEFAULT_CACHE_CONFIG,
            ...savedCacheConfig,
          };
        }

        if (!shudzState.masterEnabled) {
          return;
        }

        if (savedState === true) {
          if (document.readyState === "complete") {
            Overlay.enable();
          } else {
            window.addEventListener("load", () => Overlay.enable());
          }
        } else if (savedState === false) {
          Overlay.disable(shudzState.useSmartSegmentation);
          if (shudzState.useSmartSegmentation) {
            if (document.readyState === "complete") {
              Overlay.ensureAnnotated();
            } else {
              window.addEventListener("load", () => Overlay.ensureAnnotated());
            }
          }
        } else if (shudzState.useAutoDetect) {
          Overlay.runAutoDetectOnce();
          if (shudzState.useSmartSegmentation) {
            if (document.readyState === "complete") {
              Overlay.ensureAnnotated();
            } else {
              window.addEventListener("load", () => Overlay.ensureAnnotated());
            }
          }
        } else if (shudzState.useSmartSegmentation) {
          if (document.readyState === "complete") {
            Overlay.ensureAnnotated();
          } else {
            window.addEventListener("load", () => Overlay.ensureAnnotated());
          }
        }
      }
    );

    chrome.runtime.onMessage.addListener(
      (request: ShudzMessage, _sender, sendResponse) => {
        if (request.type === "getPinyinState") {
          sendResponse({
            enabled: document.body.classList.contains("pinyin-visible"),
          });
        } else if (
          request.type === "togglePinyin" ||
          request.type === "setPinyinEnabled"
        ) {
          const shouldEnable =
            typeof request.value === "boolean"
              ? request.value
              : !document.body.classList.contains("pinyin-visible");
          if (shouldEnable) {
            Overlay.enable();
          } else {
            Overlay.disable(shudzState.useSmartSegmentation);
          }
          chrome.storage.local.set({ [shudzState.domainKey]: shouldEnable });
        } else if (request.type === "setSegmentation") {
          const newValue = !!request.value;
          if (shudzState.useSmartSegmentation === newValue) {
            return;
          }
          shudzState.useSmartSegmentation = newValue;
          if (!shudzState.masterEnabled) return;

          const isPinyinVisible =
            document.body.classList.contains("pinyin-visible");
          if (newValue || isPinyinVisible) {
            Overlay.updateSegmentationCssClass();
            Overlay.reapplyPinyinWithCurrentSegmentation();
            Overlay.startObserver();
          } else {
            Overlay.disable(false);
          }
        } else if (request.type === "setDictionaryEnabled") {
          shudzState.dictionaryEnabled = !!request.value;
        } else if (request.type === "clearDictionaryCache") {
          Dictionary.clearCache();
        } else if (request.type === "setTheme") {
          shudzState.theme = normalizeTheme(request.value);
          if (shudzState.currentTooltip) {
            shudzState.currentTooltip.classList.toggle(
              "shudz-dark",
              Tooltip.isPageDark()
            );
          }
        } else if (request.type === "setMasterEnabled") {
          const enabled = !!request.value;
          shudzState.masterEnabled = enabled;
          chrome.storage.local.set({ [SHUDZ_KEYS.MASTER_ENABLED]: enabled });

          if (!enabled) {
            Overlay.disable();
            return;
          }

          chrome.storage.local.get([shudzState.domainKey], (res) => {
            const state = res[shudzState.domainKey];
            if (state === true) {
              Overlay.enable();
            } else if (state === false) {
              if (shudzState.useSmartSegmentation) {
                Overlay.ensureAnnotated();
              }
            } else if (shudzState.useAutoDetect) {
              Overlay.runAutoDetectOnce();
              if (shudzState.useSmartSegmentation) {
                Overlay.ensureAnnotated();
              }
            } else if (shudzState.useSmartSegmentation) {
              Overlay.ensureAnnotated();
            }
          });
        }
      }
    );

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (changes[SHUDZ_KEYS.CACHE_CONFIG]?.newValue) {
        shudzState.cacheConfig = {
          ...DEFAULT_CACHE_CONFIG,
          ...(changes[SHUDZ_KEYS.CACHE_CONFIG].newValue as Partial<CacheConfig>),
        };
        if (!shudzState.cacheConfig.enabled) {
          Dictionary.clearCache();
        }
      }
      if (
        changes[SHUDZ_KEYS.DICT_CACHE] &&
        !changes[SHUDZ_KEYS.DICT_CACHE].newValue
      ) {
        Dictionary.clearCache();
      }
      if (changes[SHUDZ_KEYS.THEME]?.newValue) {
        shudzState.theme = normalizeTheme(changes[SHUDZ_KEYS.THEME].newValue);
        if (shudzState.currentTooltip) {
          shudzState.currentTooltip.classList.toggle(
            "shudz-dark",
            Tooltip.isPageDark()
          );
        }
      }
    });

    document.addEventListener("mousedown", (e: MouseEvent) => {
      lastMouseDownPos = { x: e.clientX, y: e.clientY };
    });
    document.addEventListener("mouseup", Overlay.handleTextSelection);
  },

  ensureAnnotated(): void {
    Overlay.updateSegmentationCssClass();

    if (!shudzState.pinyinHasBeenAdded) {
      Overlay.queueNodesForProcessing(document.body);
      shudzState.pinyinHasBeenAdded = true;
    }

    Overlay.startObserver();
  },

  enable(): void {
    document.body.classList.add("pinyin-visible");
    Overlay.ensureAnnotated();
  },

  disable(keepSegmentation = false): void {
    document.body.classList.remove("pinyin-visible");
    if (keepSegmentation) {
      Overlay.updateSegmentationCssClass();
      return;
    }
    document.body.classList.remove("shudz-word-mode", "shudz-char-mode");
    if (shudzState.observer) {
      shudzState.observer.disconnect();
      shudzState.observer = null;
    }
    shudzState.processingQueue = [];
    shudzState.isProcessing = false;
    Tooltip.remove();
  },

  queueNodesForProcessing(rootNode: Node | null): void {
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
        Overlay.containsChinese(textNode.nodeValue || "") &&
        tag !== "SCRIPT" &&
        tag !== "STYLE" &&
        tag !== "TEXTAREA" &&
        tag !== "INPUT" &&
        tag !== "RUBY" &&
        tag !== "RT" &&
        !parent.isContentEditable &&
        !parent.closest("#shudz-tooltip")
      ) {
        shudzState.processingQueue.push(textNode);
      }
    }
    if (!shudzState.isProcessing) {
      Overlay.processQueueBatch();
    }
  },

  processQueueBatch(): void {
    if (shudzState.processingQueue.length === 0) {
      shudzState.isProcessing = false;
      return;
    }

    shudzState.isProcessing = true;

    const batch = shudzState.processingQueue.splice(0, PROCESS_BATCH_SIZE);

    batch.forEach((textNode) => {
      if (!textNode.parentNode) return;

      let fontClass = "is-sans";
      try {
        if (textNode.parentElement) {
          const parentStyle = window.getComputedStyle(textNode.parentElement);
          const fontFamily = parentStyle.fontFamily.toLowerCase();
          if (Overlay.isFontSerif(fontFamily)) {
            fontClass = "is-serif";
          }
        }
      } catch {
        // ignore style read errors
      }

      const fragment = document.createDocumentFragment();
      const text = textNode.nodeValue || "";
      const pinyinArray = convertToPinyinArray(text);
      const segmenter = Overlay.getChineseWordSegmenter();
      let offset = 0;

      if (segmenter) {
        const segments = segmenter.segment(text);
        for (const { segment, isWordLike } of segments) {
          const pinyin = pinyinArray
            ? pinyinArray.slice(offset, offset + segment.length).join("")
            : convertToPinyin(segment);
          offset += segment.length;

          if (isWordLike && Overlay.containsChinese(segment)) {
            fragment.appendChild(
              Overlay.createRubyNode(segment, fontClass, pinyin)
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

          if (Overlay.containsChinese(char)) {
            fragment.appendChild(
              Overlay.createRubyNode(char, fontClass, pinyin)
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
      window.requestIdleCallback(() => Overlay.processQueueBatch());
    } else {
      setTimeout(() => Overlay.processQueueBatch(), 10);
    }
  },

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
  },

  clearExistingPinyin(): void {
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

    Overlay.mergeAdjacentTextNodes(body);

    shudzState.processingQueue = [];
    shudzState.isProcessing = false;
    shudzState.chineseWordSegmenter = null;
    shudzState.pinyinHasBeenAdded = false;
  },

  reapplyPinyinWithCurrentSegmentation(): void {
    Overlay.clearExistingPinyin();
    Overlay.queueNodesForProcessing(document.body);
  },

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
  },

  updateSegmentationCssClass(): void {
    const body = document.body;
    if (!body) return;
    body.classList.remove("shudz-word-mode", "shudz-char-mode");
    body.classList.add(
      shudzState.useSmartSegmentation ? "shudz-word-mode" : "shudz-char-mode"
    );
  },

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
  },

  startObserver(): void {
    if (shudzState.observer) return;

    shudzState.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const elem = node as Element;
            if (
              elem.tagName === "RUBY" ||
              elem.tagName === "RT" ||
              elem.id === "shudz-tooltip" ||
              elem.closest("#shudz-tooltip")
            ) {
              return;
            }
            Overlay.queueNodesForProcessing(elem);
          } else if (node.nodeType === Node.TEXT_NODE) {
            if (
              Overlay.containsChinese(node.nodeValue || "") &&
              node.parentNode &&
              !node.parentElement?.closest("#shudz-tooltip")
            ) {
              Overlay.queueNodesForProcessing(node.parentNode);
            }
          }
        });
      });
    });

    shudzState.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  },

  containsChinese(text: string): boolean {
    if (!text) return false;
    return /[\u4e00-\u9fff]/.test(text);
  },

  convertToPinyin(text: string): string {
    return convertToPinyin(text);
  },

  getChineseWordSegmenter(): Intl.Segmenter | null {
    if (!shudzState.useSmartSegmentation) {
      return null;
    }
    try {
      if (!window.Intl || !Intl.Segmenter) return null;
      if (!shudzState.chineseWordSegmenter) {
        shudzState.chineseWordSegmenter = new Intl.Segmenter("zh", {
          granularity: "word",
        });
      }
      return shudzState.chineseWordSegmenter;
    } catch {
      return null;
    }
  },

  detectPageLanguage(): boolean {
    const text = (document.body.innerText || "").slice(0, TEXT_SAMPLE_LENGTH);
    return (text.match(/[\u4e00-\u9fa5]/g) || []).length > LANGUAGE_MIN_CHARS;
  },

  handleTextSelection(event: MouseEvent): void {
    if (!shudzState.masterEnabled || !shudzState.dictionaryEnabled) return;
    if (
      event.target instanceof Node &&
      shudzState.currentTooltip?.contains(event.target)
    ) {
      return;
    }

    const isDrag =
      Math.hypot(
        event.clientX - lastMouseDownPos.x,
        event.clientY - lastMouseDownPos.y
      ) >= 4;
    const isMultiClick = event.detail >= 2;
    if (!isDrag && !isMultiClick) {
      return;
    }

    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        return;
      }
      const rawText = selection.toString().trim();
      const text = Dictionary.normalizeChineseSelection(rawText);
      if (
        text &&
        Overlay.containsChinese(text) &&
        text.length <= SELECTION_MAX_LENGTH
      ) {
        void Dictionary.fetchDefinition(text, selection.getRangeAt(0));
      }
    }, 10);
  },

  runAutoDetectOnce(): void {
    setTimeout(() => {
      if (!shudzState.masterEnabled || !shudzState.useAutoDetect) return;
      if (Overlay.detectPageLanguage()) {
        shudzState.useSmartSegmentation = true;
        shudzState.dictionaryEnabled = true;
        Overlay.updateSegmentationCssClass();
        Overlay.enable();
        chrome.storage.local.set({
          [shudzState.domainKey]: true,
          [SHUDZ_KEYS.SEGMENTATION]: true,
          [SHUDZ_KEYS.DICTIONARY]: true,
        });
      }
    }, 2000);
  },
};
