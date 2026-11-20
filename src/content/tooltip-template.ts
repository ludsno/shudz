export const TOOLTIP_TEMPLATE_HTML = `
<div id="shudz-tooltip" role="dialog" aria-label="Dictionary definition">
  <div class="shudz-header">
    <span class="word-text"></span>
    <div class="shudz-header-actions">
      <button type="button" class="open-saved-btn" aria-label="Open saved entry" title="Open saved entry" hidden>Saved ↗</button>
      <button type="button" class="save-btn" aria-label="Save word" aria-pressed="false" title="Save word" hidden>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
      </button>
      <button type="button" class="close-btn" aria-label="Close">✕</button>
    </div>
  </div>
  <div class="shudz-content"></div>
</div>
`.trim();

let cachedTemplate: HTMLTemplateElement | null = null;

export function createTooltipTemplateNode(): HTMLElement {
  if (!cachedTemplate) {
    cachedTemplate = document.createElement("template");
    cachedTemplate.innerHTML = TOOLTIP_TEMPLATE_HTML;
  }
  const child = cachedTemplate.content.firstElementChild;
  if (!child) {
    throw new Error("Failed to clone tooltip template");
  }
  return child.cloneNode(true) as HTMLElement;
}
