document.addEventListener("DOMContentLoaded", async () => {
  const masterToggle = document.getElementById("masterToggle");
  const secondaryControls = document.getElementById("secondaryControls");
  const toggleCheckbox = document.getElementById("pinyinToggle");
  const segmentationToggle = document.getElementById("segmentationToggle");
  const dictionaryToggle = document.getElementById("dictionaryToggle");
  const autoDetectToggle = document.getElementById("autoDetectToggle");

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.url) return;

  const url = new URL(tab.url);
  const domainKey = "pinyin_state_" + url.hostname;
  const segmentationKey = "useSmartSegmentation";
  const autoDetectKey = "useAutoDetect";
  const dictionaryKey = "useDictionary";
  const masterKey = "shudz_masterEnabled";

  chrome.storage.local.get(
    [domainKey, segmentationKey, autoDetectKey, dictionaryKey, masterKey],
    (result) => {
      toggleCheckbox.checked = result[domainKey] === true;

      if (tab.id) {
        chrome.tabs.sendMessage(
          tab.id,
          { type: "getPinyinState" },
          (response) => {
            if (chrome.runtime.lastError) return;
            if (response && typeof response.enabled === "boolean") {
              toggleCheckbox.checked = response.enabled;
            }
          }
        );
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
    }
  );

  toggleCheckbox.addEventListener("change", () => {
    const enabled = toggleCheckbox.checked;
    chrome.storage.local.set({ [domainKey]: enabled });
    if (tab.id) {
      chrome.tabs.sendMessage(
        tab.id,
        {
          type: "togglePinyin",
          value: enabled,
        },
        () => {
          void chrome.runtime.lastError;
        }
      );
    }
  });

  masterToggle.addEventListener("change", () => {
    const enabled = masterToggle.checked;
    updateSecondaryState(enabled);
    chrome.storage.local.set({ [masterKey]: enabled });
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: "setMasterEnabled",
        value: enabled,
      });
    }
  });

  segmentationToggle.addEventListener("change", () => {
    const useSmartSegmentation = segmentationToggle.checked;
    chrome.storage.local.set({ [segmentationKey]: useSmartSegmentation });
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: "setSegmentation",
        value: useSmartSegmentation,
      });
    }
  });

  autoDetectToggle.addEventListener("change", () => {
    chrome.storage.local.set({ [autoDetectKey]: autoDetectToggle.checked });
  });

  dictionaryToggle.addEventListener("change", () => {
    const useDictionary = dictionaryToggle.checked;
    chrome.storage.local.set({ [dictionaryKey]: useDictionary });
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: "setDictionaryEnabled",
        value: useDictionary,
      });
    }
  });

  function updateSecondaryState(isOn) {
    secondaryControls.classList.toggle("is-disabled", !isOn);
    toggleCheckbox.disabled = !isOn;
    segmentationToggle.disabled = !isOn;
    dictionaryToggle.disabled = !isOn;
    autoDetectToggle.disabled = !isOn;
  }
});
