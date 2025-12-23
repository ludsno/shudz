document.addEventListener("DOMContentLoaded", async () => {
    const toggleCheckbox = document.getElementById("pinyinToggle");
    const statusText = document.getElementById("statusText");
    const segmentationToggle = document.getElementById("segmentationToggle");
    const segmentationStatusText = document.getElementById("segmentationStatusText");

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab.url) return;

    const url = new URL(tab.url);
    const domainKey = "pinyin_state_" + url.hostname;
    const segmentationKey = "useSmartSegmentation";

    chrome.storage.local.get([domainKey, segmentationKey], (result) => {
      const isEnabled = result[domainKey] === true;
      toggleCheckbox.checked = isEnabled;
      updateStatusText(isEnabled);

      const useSmartSegmentation =
        typeof result[segmentationKey] === "boolean"
          ? result[segmentationKey]
          : true; // default true
      segmentationToggle.checked = useSmartSegmentation;
      updateSegmentationStatusText(useSmartSegmentation);
    });

    toggleCheckbox.addEventListener("change", () => {
      const isChecked = toggleCheckbox.checked;
      updateStatusText(isChecked);
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: "togglePinyin" });
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

    function updateStatusText(isOn) {
      statusText.textContent = isOn ? "On" : "Off";
      statusText.classList.toggle("is-on", isOn);
    }

    function updateSegmentationStatusText(isSmart) {
      segmentationStatusText.textContent = isSmart ? "Words" : "Characters";
      segmentationStatusText.classList.toggle("is-on", true);
      // segmentation mode is always "active"; the text itself explains the mode
    }
});