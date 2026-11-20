import {
  DEFAULT_CACHE_CONFIG,
  SHUDZ_KEYS,
  normalizeTheme,
} from "../shared/storage.ts";
import { containsChinese } from "../shared/text.ts";
import type { CacheConfig, ShudzMessage } from "../shared/types.ts";
import { Dictionary } from "./dictionary.ts";
import { defaultDomAnnotator } from "./dom-annotator.ts";
import { detectPageLanguage } from "./language-detector.ts";
import { defaultPageObserver } from "./page-observer.ts";
import { SELECTION_MAX_LENGTH, shudzState } from "./state.ts";
import { Tooltip } from "./tooltip.ts";

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

        const onPageReady = (action: () => void) => {
          if (document.readyState === "complete") {
            action();
          } else {
            window.addEventListener("load", action);
          }
        };

        if (savedState === true) {
          onPageReady(() => Overlay.enable());
        } else if (savedState === false) {
          Overlay.disable(shudzState.useSmartSegmentation);
          if (shudzState.useSmartSegmentation) {
            onPageReady(() => Overlay.ensureAnnotated());
          }
        } else if (shudzState.useAutoDetect) {
          Overlay.runAutoDetectOnce();
          if (shudzState.useSmartSegmentation) {
            onPageReady(() => Overlay.ensureAnnotated());
          }
        } else if (shudzState.useSmartSegmentation) {
          onPageReady(() => Overlay.ensureAnnotated());
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
            defaultDomAnnotator.updateSegmentationCssClass();
            defaultDomAnnotator.reapply();
            defaultPageObserver.start((node) => defaultDomAnnotator.queueNodes(node));
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
            } else if (state === false || shudzState.useAutoDetect || shudzState.useSmartSegmentation) {
              if (shudzState.useAutoDetect) {
                Overlay.runAutoDetectOnce();
              }
              if (shudzState.useSmartSegmentation) {
                Overlay.ensureAnnotated();
              }
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
    defaultDomAnnotator.updateSegmentationCssClass();

    if (!defaultDomAnnotator.hasBeenAnnotated) {
      defaultDomAnnotator.queueNodes(document.body);
      defaultDomAnnotator.hasBeenAnnotated = true;
    }

    defaultPageObserver.start((node) => defaultDomAnnotator.queueNodes(node));
  },

  enable(): void {
    document.body.classList.add("pinyin-visible");
    Overlay.ensureAnnotated();
  },

  disable(keepSegmentation = false): void {
    document.body.classList.remove("pinyin-visible");
    if (keepSegmentation) {
      defaultDomAnnotator.updateSegmentationCssClass();
      return;
    }
    document.body.classList.remove("shudz-word-mode", "shudz-char-mode");
    defaultPageObserver.stop();
    defaultDomAnnotator.clear();
    Tooltip.remove();
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
        containsChinese(text) &&
        text.length <= SELECTION_MAX_LENGTH
      ) {
        void Dictionary.fetchDefinition(text, selection.getRangeAt(0));
      }
    }, 10);
  },

  runAutoDetectOnce(): void {
    setTimeout(() => {
      if (!shudzState.masterEnabled || !shudzState.useAutoDetect) return;
      if (detectPageLanguage()) {
        shudzState.useSmartSegmentation = true;
        shudzState.dictionaryEnabled = true;
        defaultDomAnnotator.updateSegmentationCssClass();
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
