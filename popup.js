document.addEventListener("DOMContentLoaded", async () => {
  const masterToggle = document.getElementById("masterToggle");
  const masterStatusText = document.getElementById("masterStatusText");
  const toggleCheckbox = document.getElementById("pinyinToggle");
  const statusText = document.getElementById("statusText");
  const segmentationToggle = document.getElementById("segmentationToggle");
  const segmentationStatusText = document.getElementById(
    "segmentationStatusText"
  );
  const dictionaryToggle = document.getElementById("dictionaryToggle");
  const dictionaryStatusText = document.getElementById("dictionaryStatusText");
  const autoDetectToggle = document.getElementById("autoDetectToggle");
  const autoDetectStatusText = document.getElementById("autoDetectStatusText");

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab.url) return;

  const url = new URL(tab.url);
  const domainKey = "pinyin_state_" + url.hostname;
  const segmentationKey = "useSmartSegmentation";
  const autoDetectKey = "useAutoDetect";
  const dictionaryKey = "useDictionary";
  const masterKey = "shudz_masterEnabled";

  chrome.storage.local.get(
    [domainKey, segmentationKey, autoDetectKey, dictionaryKey, masterKey],
    (result) => {
      const isEnabled = result[domainKey] === true;
      toggleCheckbox.checked = isEnabled;
      updateStatusText(isEnabled);

      const useSmartSegmentation =
        typeof result[segmentationKey] === "boolean"
          ? result[segmentationKey]
          : true; // default true
      segmentationToggle.checked = useSmartSegmentation;
      updateSegmentationStatusText(useSmartSegmentation);

      const useAutoDetect =
        typeof result[autoDetectKey] === "boolean"
          ? result[autoDetectKey]
          : true; // default true
      autoDetectToggle.checked = useAutoDetect;
      updateAutoDetectStatusText(useAutoDetect);

      const useDictionary =
        typeof result[dictionaryKey] === "boolean"
          ? result[dictionaryKey]
          : true; // default true
      dictionaryToggle.checked = useDictionary;
      updateDictionaryStatusText(useDictionary);

      const masterEnabled =
        typeof result[masterKey] === "boolean" ? result[masterKey] : true; // default true
      masterToggle.checked = masterEnabled;
      updateMasterStatusText(masterEnabled);
    }
  );

  toggleCheckbox.addEventListener("change", () => {
    const isChecked = toggleCheckbox.checked;
    updateStatusText(isChecked);
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: "togglePinyin" });
    }
  });

  masterToggle.addEventListener("change", () => {
    const enabled = masterToggle.checked;
    updateMasterStatusText(enabled);
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
    updateSegmentationStatusText(useSmartSegmentation);
    chrome.storage.local.set({ [segmentationKey]: useSmartSegmentation });
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: "setSegmentation",
        value: useSmartSegmentation,
      });
    }
  });

  autoDetectToggle.addEventListener("change", () => {
    const useAutoDetect = autoDetectToggle.checked;
    updateAutoDetectStatusText(useAutoDetect);
    chrome.storage.local.set({ [autoDetectKey]: useAutoDetect });
    // não precisamos avisar o content.js agora; o flag será lido na próxima inicialização da página
  });

  dictionaryToggle.addEventListener("change", () => {
    const useDictionary = dictionaryToggle.checked;
    updateDictionaryStatusText(useDictionary);
    chrome.storage.local.set({ [dictionaryKey]: useDictionary });
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: "setDictionaryEnabled",
        value: useDictionary,
      });
    }
  });

  function updateStatusText(isOn) {
    statusText.textContent = isOn ? "On" : "Off";
    statusText.classList.toggle("is-on", isOn);
  }

  function updateSegmentationStatusText(isSmart) {
    segmentationStatusText.textContent = isSmart ? "On" : "Off";
    segmentationStatusText.classList.toggle("is-on", isSmart);
  }

  function updateAutoDetectStatusText(isOn) {
    autoDetectStatusText.textContent = isOn ? "Enabled" : "Disabled";
    autoDetectStatusText.classList.toggle("is-on", isOn);
  }

  function updateDictionaryStatusText(isOn) {
    dictionaryStatusText.textContent = isOn ? "On" : "Off";
    dictionaryStatusText.classList.toggle("is-on", isOn);
  }

  function updateMasterStatusText(isOn) {
    masterStatusText.textContent = isOn ? "On" : "Off";
    masterStatusText.classList.toggle("is-on", isOn);

    // Desabilita/abilita os demais toggles na UI, mas mantém seus estados
    toggleCheckbox.disabled = !isOn;
    segmentationToggle.disabled = !isOn;
    dictionaryToggle.disabled = !isOn;
    autoDetectToggle.disabled = !isOn;

    if (!isOn) {
      // Quando o master está OFF, os outros ficam em modo "stand-by":
      // mantêm o check real, mas o texto e a cor mudam.

      statusText.textContent = "Stand-by";
      statusText.classList.remove("is-on");
      statusText.classList.add("is-standby");

      segmentationStatusText.textContent = "Stand-by";
      segmentationStatusText.classList.remove("is-on");
      segmentationStatusText.classList.add("is-standby");

      dictionaryStatusText.textContent = "Stand-by";
      dictionaryStatusText.classList.remove("is-on");
      dictionaryStatusText.classList.add("is-standby");

      autoDetectStatusText.textContent = "Stand-by";
      autoDetectStatusText.classList.remove("is-on");
      autoDetectStatusText.classList.add("is-standby");
    } else {
      // Quando o master volta a ON, tiramos o "stand-by" e
      // restauramos os textos normais a partir do estado de cada toggle.

      statusText.classList.remove("is-standby");
      segmentationStatusText.classList.remove("is-standby");
      dictionaryStatusText.classList.remove("is-standby");
      autoDetectStatusText.classList.remove("is-standby");

      updateStatusText(toggleCheckbox.checked);
      updateSegmentationStatusText(segmentationToggle.checked);
      updateDictionaryStatusText(dictionaryToggle.checked);
      updateAutoDetectStatusText(autoDetectToggle.checked);
    }
  }
});
