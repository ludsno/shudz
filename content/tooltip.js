const Tooltip = {
  async ensureTemplateLoaded() {
    if (shudzState.tooltipTemplateElement) return;
    try {
      const url = chrome.runtime.getURL("content/tooltip-template.html");
      const html = await (await fetch(url)).text();
      const container = document.createElement("div");
      container.innerHTML = html.trim();
      const template = container.querySelector("#shudz-tooltip-template");
      if (template && template.content) {
        shudzState.tooltipTemplateElement = template;
      } else {
        console.error("Shudz tooltip template not found or invalid.");
      }
    } catch (e) {
      console.error("Failed to load tooltip template", e);
    }
  },

  show(title, contentNode, range, saveOptions = null) {
    Tooltip.remove();
    const tooltip = Tooltip.createTooltipElement(
      title,
      contentNode,
      saveOptions
    );
    Tooltip.attachTooltipCloseBehavior(tooltip);
    document.body.appendChild(tooltip);
    shudzState.currentTooltip = tooltip;
    Tooltip.positionTooltip(tooltip, range);
    document.addEventListener("keydown", Tooltip.closeOnEscape);
    setTimeout(() => {
      document.addEventListener("click", Tooltip.closeOnClickOutside);
    }, 100);
  },

  createTooltipElement(title, contentNode, saveOptions = null) {
    let tooltip;
    if (shudzState.tooltipTemplateElement) {
      tooltip =
        shudzState.tooltipTemplateElement.content.firstElementChild.cloneNode(
          true
        );
    } else {
      tooltip = document.createElement("div");
      tooltip.id = "shudz-tooltip";
      tooltip.setAttribute("role", "dialog");
      tooltip.setAttribute("aria-label", "Dictionary definition");
      tooltip.innerHTML = `
        <div class="shudz-header">
          <span class="word-text"></span>
          <div class="shudz-header-actions">
            <button type="button" class="save-btn" aria-label="Save word" aria-pressed="false" title="Save word" hidden>☆</button>
            <button type="button" class="close-btn" aria-label="Close">✕</button>
          </div>
        </div>
        <div class="shudz-content"></div>
      `;
    }

    if (Tooltip.isPageDark()) {
      tooltip.classList.add("shudz-dark");
    }

    const wordSpan = tooltip.querySelector(".word-text");
    if (wordSpan) {
      wordSpan.textContent = title;
    }

    const saveBtn = tooltip.querySelector(".save-btn");
    if (saveBtn && saveOptions && typeof saveOptions.onToggleSave === "function") {
      saveBtn.hidden = false;
      Tooltip.updateSaveButtonState(saveBtn, Boolean(saveOptions.isSaved));
      saveBtn.addEventListener("click", async () => {
        saveBtn.disabled = true;
        try {
          const nowSaved = await saveOptions.onToggleSave();
          Tooltip.updateSaveButtonState(saveBtn, Boolean(nowSaved));
        } finally {
          saveBtn.disabled = false;
        }
      });
    }

    const contentEl = tooltip.querySelector(".shudz-content");
    if (contentEl) {
      contentEl.textContent = "";
      if (contentNode instanceof Node) {
        contentEl.appendChild(contentNode);
      }
    }

    return tooltip;
  },

  updateSaveButtonState(btn, isSaved) {
    btn.textContent = isSaved ? "★" : "☆";
    btn.classList.toggle("is-saved", isSaved);
    btn.setAttribute("aria-pressed", String(isSaved));
    const label = isSaved ? "Remove from saved words" : "Save word";
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
  },

  attachTooltipCloseBehavior(tooltip) {
    const closeBtn = tooltip.querySelector(".close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        Tooltip.remove();
      });
    }
  },

  positionTooltip(tooltip, range) {
    const rect = range.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    const top = rect.bottom + scrollY + TOOLTIP_OFFSET_Y;
    let left = rect.left + scrollX;
    if (left + TOOLTIP_MAX_WIDTH > window.innerWidth) {
      left = window.innerWidth - TOOLTIP_SAFE_MARGIN;
    }
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  },

  getBackgroundLuminance(el) {
    if (!el) return null;
    const color = window.getComputedStyle(el).backgroundColor;
    const match =
      color &&
      color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
    if (!match) return null;
    const alpha = match[4] !== undefined ? parseFloat(match[4]) : 1;
    if (alpha === 0) return null;
    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  },

  isPageDark() {
    if (shudzState.theme === "dark") return true;
    if (shudzState.theme === "light") return false;

    try {
      const bodyLum = Tooltip.getBackgroundLuminance(document.body);
      if (bodyLum !== null) return bodyLum < 0.4;

      const rootLum = Tooltip.getBackgroundLuminance(document.documentElement);
      if (rootLum !== null) return rootLum < 0.4;

      return (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      );
    } catch (e) {
      return false;
    }
  },

  remove() {
    if (shudzState.currentTooltip) {
      shudzState.currentTooltip.remove();
      shudzState.currentTooltip = null;
      document.removeEventListener("click", Tooltip.closeOnClickOutside);
      document.removeEventListener("keydown", Tooltip.closeOnEscape);
    }
  },

  closeOnEscape(e) {
    if (e.key === "Escape") {
      Tooltip.remove();
    }
  },

  closeOnClickOutside(e) {
    if (
      shudzState.currentTooltip &&
      !shudzState.currentTooltip.contains(e.target)
    ) {
      Tooltip.remove();
    }
  },
};
