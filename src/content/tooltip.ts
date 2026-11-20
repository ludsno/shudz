import {
  TOOLTIP_MAX_WIDTH,
  TOOLTIP_OFFSET_Y,
  TOOLTIP_SAFE_MARGIN,
  shudzState,
} from "./state";

export interface TooltipSaveOptions {
  isSaved: boolean;
  onToggleSave: () => Promise<boolean>;
}

export const Tooltip = {
  async ensureTemplateLoaded(): Promise<void> {
    if (shudzState.tooltipTemplateElement) return;
    try {
      const url = chrome.runtime.getURL("content/tooltip-template.html");
      const html = await (await fetch(url)).text();
      const container = document.createElement("div");
      container.innerHTML = html.trim();
      const template = container.querySelector(
        "#shudz-tooltip-template"
      ) as HTMLTemplateElement | null;
      if (template && template.content) {
        shudzState.tooltipTemplateElement = template;
      } else {
        console.error("Shudz tooltip template not found or invalid.");
      }
    } catch (e) {
      console.error("Failed to load tooltip template", e);
    }
  },

  show(
    title: string,
    contentNode: Node,
    range: Range,
    saveOptions: TooltipSaveOptions | null = null
  ): void {
    Tooltip.remove(false);
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
    document.addEventListener("mousedown", Tooltip.closeOnClickOutside);
  },

  createTooltipElement(
    title: string,
    contentNode: Node,
    saveOptions: TooltipSaveOptions | null = null
  ): HTMLElement {
    let tooltip: HTMLElement;
    const templateChild =
      shudzState.tooltipTemplateElement?.content.firstElementChild;
    if (templateChild) {
      tooltip = templateChild.cloneNode(true) as HTMLElement;
    } else {
      tooltip = document.createElement("div");
      tooltip.id = "shudz-tooltip";
      tooltip.setAttribute("role", "dialog");
      tooltip.setAttribute("aria-label", "Dictionary definition");
      tooltip.innerHTML = `
        <div class="shudz-header">
          <span class="word-text"></span>
          <div class="shudz-header-actions">
            <button type="button" class="open-saved-btn" aria-label="Open saved entry" title="Open saved entry" hidden>Saved ↗</button>
            <button type="button" class="save-btn" aria-label="Save word" aria-pressed="false" title="Save word" hidden><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg></button>
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

    const saveBtn = tooltip.querySelector(".save-btn") as HTMLButtonElement | null;
    const openSavedBtn = tooltip.querySelector(
      ".open-saved-btn"
    ) as HTMLButtonElement | null;

    if (openSavedBtn) {
      openSavedBtn.addEventListener("click", () => {
        const url = chrome.runtime.getURL(
          `library/library.html?word=${encodeURIComponent(title)}`
        );
        window.open(url, "_blank", "noopener");
      });
    }

    if (saveBtn && saveOptions && typeof saveOptions.onToggleSave === "function") {
      saveBtn.hidden = false;
      Tooltip.updateSaveButtonState(
        saveBtn,
        Boolean(saveOptions.isSaved),
        openSavedBtn
      );
      saveBtn.addEventListener("click", async () => {
        saveBtn.disabled = true;
        try {
          const nowSaved = await saveOptions.onToggleSave();
          Tooltip.updateSaveButtonState(
            saveBtn,
            Boolean(nowSaved),
            openSavedBtn
          );
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

  updateSaveButtonState(
    btn: HTMLButtonElement,
    isSaved: boolean,
    openSavedBtn?: HTMLButtonElement | null
  ): void {
    btn.classList.toggle("is-saved", isSaved);
    btn.setAttribute("aria-pressed", String(isSaved));
    if (openSavedBtn) {
      openSavedBtn.hidden = !isSaved;
    }
    const svg = btn.querySelector("svg");
    if (svg) {
      svg.setAttribute("fill", isSaved ? "currentColor" : "none");
    }
    const label = isSaved ? "Remove from saved words" : "Save word";
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
  },

  attachTooltipCloseBehavior(tooltip: HTMLElement): void {
    const closeBtn = tooltip.querySelector(".close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        Tooltip.remove(true);
      });
    }
  },

  positionTooltip(tooltip: HTMLElement, range: Range): void {
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

  getBackgroundLuminance(el: Element | null): number | null {
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

  isPageDark(): boolean {
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
    } catch {
      return false;
    }
  },

  remove(clearSelectionAndCancel = true): void {
    if (clearSelectionAndCancel) {
      shudzState.activeLookupId++;
      try {
        window.getSelection()?.removeAllRanges();
      } catch {
        // Ignore if selection is not available
      }
    }
    if (shudzState.currentTooltip) {
      shudzState.currentTooltip.remove();
      shudzState.currentTooltip = null;
    }
    document.removeEventListener("mousedown", Tooltip.closeOnClickOutside);
    document.removeEventListener("keydown", Tooltip.closeOnEscape);
  },

  closeOnEscape(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      Tooltip.remove(true);
    }
  },

  closeOnClickOutside(e: MouseEvent): void {
    if (
      shudzState.currentTooltip &&
      e.target instanceof Node &&
      !shudzState.currentTooltip.contains(e.target)
    ) {
      Tooltip.remove(true);
    }
  },
};
