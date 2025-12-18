document.addEventListener("DOMContentLoaded", async () => {
        const toggleCheckbox = document.getElementById("pinyinToggle");
        const statusText = document.getElementById("statusText");

        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });

        if (!tab.url) return;

        const url = new URL(tab.url);
        const domainKey = "pinyin_state_" + url.hostname;

        chrome.storage.local.get([domainKey], (result) => {
          const isEnabled = result[domainKey] === true;
          toggleCheckbox.checked = isEnabled;
          updateStatusText(isEnabled);
        });

        toggleCheckbox.addEventListener("change", () => {
          const isChecked = toggleCheckbox.checked;
          updateStatusText(isChecked);
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, { action: "togglePinyin" });
          }
        });

        function updateStatusText(isOn) {
          statusText.textContent = isOn ? "ON" : "OFF";
          statusText.style.color = isOn ? "#4CAF50" : "#777";
        }
      });