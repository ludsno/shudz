document.addEventListener("DOMContentLoaded", async () => {
  const masterToggle = document.getElementById("masterToggle");
  const secondaryControls = document.getElementById("secondaryControls");
  const toggleCheckbox = document.getElementById("pinyinToggle");
  const segmentationToggle = document.getElementById("segmentationToggle");
  const dictionaryToggle = document.getElementById("dictionaryToggle");
  const autoDetectToggle = document.getElementById("autoDetectToggle");
  const tabNotice = document.getElementById("tabNotice");
  const versionText = document.getElementById("versionText");
  const themeButtons = document.querySelectorAll("[data-theme-value]");

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

  const domainKey = isSupportedTab
    ? "pinyin_state_" + new URL(tab.url).hostname
    : null;
  const segmentationKey = "useSmartSegmentation";
  const autoDetectKey = "useAutoDetect";
  const dictionaryKey = "useDictionary";
  const masterKey = "shudz_masterEnabled";
  const themeKey = "shudz_theme";

  const keysToLoad = [
    segmentationKey,
    autoDetectKey,
    dictionaryKey,
    masterKey,
    themeKey,
  ];
  if (domainKey) {
    keysToLoad.push(domainKey);
  }

  chrome.storage.local.get(keysToLoad, (result) => {
    if (domainKey) {
      toggleCheckbox.checked = result[domainKey] === true;
      sendToTab({ type: "getPinyinState" }, (response) => {
        if (response && typeof response.enabled === "boolean") {
          toggleCheckbox.checked = response.enabled;
        }
      });
    } else {
      toggleCheckbox.checked = false;
      toggleCheckbox.disabled = true;
    }

    segmentationToggle.checked =
      typeof result[segmentationKey] === "boolean"
        ? result[segmentationKey]
        : true;

    autoDetectToggle.checked =
      typeof result[autoDetectKey] === "boolean"
        ? result[autoDetectKey]
        : true;

    dictionaryToggle.checked =
      typeof result[dictionaryKey] === "boolean"
        ? result[dictionaryKey]
        : true;

    const masterEnabled =
      typeof result[masterKey] === "boolean" ? result[masterKey] : true;
    masterToggle.checked = masterEnabled;
    updateSecondaryState(masterEnabled);

    const savedTheme =
      result[themeKey] === "light" ||
      result[themeKey] === "dark" ||
      result[themeKey] === "auto"
        ? result[themeKey]
        : "auto";
    applyTheme(savedTheme);
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
    chrome.storage.local.set({ [masterKey]: enabled });
    sendToTab({ type: "setMasterEnabled", value: enabled });
  });

  segmentationToggle.addEventListener("change", () => {
    const useSmartSegmentation = segmentationToggle.checked;
    chrome.storage.local.set({ [segmentationKey]: useSmartSegmentation });
    sendToTab({ type: "setSegmentation", value: useSmartSegmentation });
  });

  autoDetectToggle.addEventListener("change", () => {
    chrome.storage.local.set({ [autoDetectKey]: autoDetectToggle.checked });
  });

  dictionaryToggle.addEventListener("change", () => {
    const useDictionary = dictionaryToggle.checked;
    chrome.storage.local.set({ [dictionaryKey]: useDictionary });
    sendToTab({ type: "setDictionaryEnabled", value: useDictionary });
  });

  themeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const theme = btn.dataset.themeValue || "auto";
      applyTheme(theme);
      chrome.storage.local.set({ [themeKey]: theme });
      sendToTab({ type: "setTheme", value: theme });
    });
  });

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeButtons.forEach((btn) => {
      btn.setAttribute(
        "aria-pressed",
        String(btn.dataset.themeValue === theme)
      );
    });
  }

  function updateSecondaryState(isOn) {
    secondaryControls.classList.toggle("is-disabled", !isOn);
    toggleCheckbox.disabled = !isOn || !isSupportedTab;
    segmentationToggle.disabled = !isOn;
    dictionaryToggle.disabled = !isOn;
    autoDetectToggle.disabled = !isOn;
  }

  function sendToTab(message, callback) {
    if (!isSupportedTab) return;
    chrome.tabs.sendMessage(tab.id, message, (response) => {
      if (chrome.runtime.lastError) return;
      if (callback) callback(response);
    });
  }
});
