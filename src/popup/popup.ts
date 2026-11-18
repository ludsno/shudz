import { SHUDZ_KEYS, normalizeTheme } from "../shared/storage";
import type { PinyinStateResponse, ShudzMessage, ThemeMode } from "../shared/types";

document.addEventListener("DOMContentLoaded", async () => {
  const masterToggle = document.getElementById(
    "masterToggle"
  ) as HTMLInputElement;
  const secondaryControls = document.getElementById(
    "secondaryControls"
  ) as HTMLElement;
  const toggleCheckbox = document.getElementById(
    "pinyinToggle"
  ) as HTMLInputElement;
  const segmentationToggle = document.getElementById(
    "segmentationToggle"
  ) as HTMLInputElement;
  const dictionaryToggle = document.getElementById(
    "dictionaryToggle"
  ) as HTMLInputElement;
  const autoDetectToggle = document.getElementById(
    "autoDetectToggle"
  ) as HTMLInputElement;
  const tabNotice = document.getElementById("tabNotice");
  const versionText = document.getElementById("versionText");
  const themeButtons =
    document.querySelectorAll<HTMLButtonElement>("[data-theme-value]");
  const clearCacheBtn = document.getElementById(
    "clearCacheBtn"
  ) as HTMLButtonElement | null;
  const openLibraryBtn = document.getElementById("openLibraryBtn");

  if (openLibraryBtn) {
    openLibraryBtn.addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });
  }

  const manifest = chrome.runtime.getManifest();
  if (versionText && manifest?.version) {
    versionText.textContent = `v${manifest.version}`;
  }

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  const isSupportedTab = Boolean(
    tab?.id && tab?.url && /^https?:|^file:/i.test(tab.url)
  );

  if (!isSupportedTab && tabNotice) {
    tabNotice.classList.add("is-visible");
  }

  const domainKey =
    isSupportedTab && tab?.url
      ? "pinyin_state_" + new URL(tab.url).hostname
      : null;

  const keysToLoad: string[] = [
    SHUDZ_KEYS.SEGMENTATION,
    SHUDZ_KEYS.AUTO_DETECT,
    SHUDZ_KEYS.DICTIONARY,
    SHUDZ_KEYS.MASTER_ENABLED,
    SHUDZ_KEYS.THEME,
  ];
  if (domainKey) {
    keysToLoad.push(domainKey);
  }

  chrome.storage.local.get(keysToLoad, (result) => {
    if (domainKey) {
      toggleCheckbox.checked = result[domainKey] === true;
      sendToTab<PinyinStateResponse>({ type: "getPinyinState" }, (response) => {
        if (response && typeof response.enabled === "boolean") {
          toggleCheckbox.checked = response.enabled;
        }
      });
    } else {
      toggleCheckbox.checked = false;
      toggleCheckbox.disabled = true;
    }

    segmentationToggle.checked =
      typeof result[SHUDZ_KEYS.SEGMENTATION] === "boolean"
        ? result[SHUDZ_KEYS.SEGMENTATION]
        : true;

    autoDetectToggle.checked =
      typeof result[SHUDZ_KEYS.AUTO_DETECT] === "boolean"
        ? result[SHUDZ_KEYS.AUTO_DETECT]
        : true;

    dictionaryToggle.checked =
      typeof result[SHUDZ_KEYS.DICTIONARY] === "boolean"
        ? result[SHUDZ_KEYS.DICTIONARY]
        : true;

    const masterEnabled =
      typeof result[SHUDZ_KEYS.MASTER_ENABLED] === "boolean"
        ? result[SHUDZ_KEYS.MASTER_ENABLED]
        : true;
    masterToggle.checked = masterEnabled;
    updateSecondaryState(masterEnabled);

    applyTheme(normalizeTheme(result[SHUDZ_KEYS.THEME]));
  });

  toggleCheckbox.addEventListener("change", () => {
    if (!domainKey) return;
    const enabled = toggleCheckbox.checked;
    chrome.storage.local.set({ [domainKey]: enabled });
    sendToTab({ type: "togglePinyin", value: enabled });
  });

  masterToggle.addEventListener("change", () => {
    const enabled = masterToggle.checked;
    updateSecondaryState(enabled);
    chrome.storage.local.set({ [SHUDZ_KEYS.MASTER_ENABLED]: enabled });
    sendToTab({ type: "setMasterEnabled", value: enabled });
  });

  segmentationToggle.addEventListener("change", () => {
    const useSmartSegmentation = segmentationToggle.checked;
    chrome.storage.local.set({
      [SHUDZ_KEYS.SEGMENTATION]: useSmartSegmentation,
    });
    sendToTab({ type: "setSegmentation", value: useSmartSegmentation });
  });

  autoDetectToggle.addEventListener("change", () => {
    chrome.storage.local.set({
      [SHUDZ_KEYS.AUTO_DETECT]: autoDetectToggle.checked,
    });
  });

  dictionaryToggle.addEventListener("change", () => {
    const useDictionary = dictionaryToggle.checked;
    chrome.storage.local.set({ [SHUDZ_KEYS.DICTIONARY]: useDictionary });
    sendToTab({ type: "setDictionaryEnabled", value: useDictionary });
  });

  themeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const theme: ThemeMode = normalizeTheme(btn.dataset.themeValue);
      applyTheme(theme);
      chrome.storage.local.set({ [SHUDZ_KEYS.THEME]: theme });
      sendToTab({ type: "setTheme", value: theme });
    });
  });

  if (clearCacheBtn) {
    clearCacheBtn.addEventListener("click", () => {
      chrome.storage.local.remove(SHUDZ_KEYS.DICT_CACHE, () => {
        sendToTab({ type: "clearDictionaryCache" });
        clearCacheBtn.textContent = "Cleared";
        setTimeout(() => {
          clearCacheBtn.textContent = "Clear";
        }, 1200);
      });
    });
  }

  function applyTheme(theme: ThemeMode): void {
    document.documentElement.dataset.theme = theme;
    themeButtons.forEach((btn) => {
      btn.setAttribute(
        "aria-pressed",
        String(btn.dataset.themeValue === theme)
      );
    });
  }

  function updateSecondaryState(isOn: boolean): void {
    secondaryControls.classList.toggle("is-disabled", !isOn);
    toggleCheckbox.disabled = !isOn || !isSupportedTab;
    segmentationToggle.disabled = !isOn;
    dictionaryToggle.disabled = !isOn;
    autoDetectToggle.disabled = !isOn;
  }

  function sendToTab<T = unknown>(
    message: ShudzMessage,
    callback?: (response: T) => void
  ): void {
    if (!isSupportedTab || !tab?.id) return;
    chrome.tabs.sendMessage(tab.id, message, (response: T) => {
      if (chrome.runtime.lastError) return;
      if (callback) callback(response);
    });
  }
});
