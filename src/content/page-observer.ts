import { containsChinese } from "../shared/text.ts";

export class PageObserver {
  private observer: MutationObserver | null = null;

  start(onNodeAdded: (node: Node) => void): void {
    if (this.observer || !document.body) return;

    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const elem = node as Element;
            if (
              elem.tagName === "RUBY" ||
              elem.tagName === "RT" ||
              elem.id === "shudz-tooltip" ||
              elem.closest("#shudz-tooltip")
            ) {
              return;
            }
            onNodeAdded(elem);
          } else if (node.nodeType === Node.TEXT_NODE) {
            if (
              containsChinese(node.nodeValue || "") &&
              node.parentNode &&
              !node.parentElement?.closest("#shudz-tooltip")
            ) {
              onNodeAdded(node.parentNode);
            }
          }
        });
      });
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  isActive(): boolean {
    return this.observer !== null;
  }
}

export const defaultPageObserver = new PageObserver();
