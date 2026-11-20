import type { DictionaryLookupResult } from "../services/dictionary.service";
import { WIKTIONARY_PAGE_BASE } from "../services/wiktionary.service";
import { buildSafeHtmlFragment } from "../shared/html";
import type { WiktionaryEntry } from "../shared/types";
import { MAX_DEFINITIONS, MAX_EXAMPLES_PER_DEF } from "./state";
import type { TooltipSaveOptions } from "./tooltip";

export const TooltipRenderer = {
  createMessageNode(text: string): HTMLDivElement {
    const div = document.createElement("div");
    div.className = "def-text";
    div.textContent = text;
    return div;
  },

  buildWiktionaryLink(term: string, note?: string | null): HTMLDivElement {
    const url = `${WIKTIONARY_PAGE_BASE}${encodeURIComponent(term)}#Chinese`;
    const container = document.createElement("div");
    container.className = "wiktionary-link";

    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open page on Wiktionary";
    container.appendChild(link);

    if (note) {
      const noteSpan = document.createElement("span");
      noteSpan.className = "wiktionary-note";
      noteSpan.textContent = note;
      container.appendChild(noteSpan);
    }

    return container;
  },

  formatDefinitions(entries: WiktionaryEntry[]): HTMLUListElement | null {
    const list = document.createElement("ul");
    let count = 0;

    entries.forEach((entry) => {
      const pos = entry.partOfSpeech || "";
      const lang = entry.language || "";
      const defs = Array.isArray(entry.definitions) ? entry.definitions : [];

      defs.forEach((def) => {
        if (count >= MAX_DEFINITIONS) return;

        const li = document.createElement("li");
        const definitionText = def.definition || "";

        if (pos) {
          const posSpan = document.createElement("span");
          posSpan.className = "pos-tag";
          posSpan.textContent = pos;
          li.appendChild(posSpan);
          li.appendChild(document.createTextNode(" "));
        }

        if (lang) {
          const langSpan = document.createElement("span");
          langSpan.className = "lang-tag";
          langSpan.textContent = lang;
          li.appendChild(langSpan);
          li.appendChild(document.createTextNode(" "));
        }

        const defDiv = document.createElement("div");
        defDiv.className = "def-text";
        defDiv.appendChild(buildSafeHtmlFragment(definitionText));
        li.appendChild(defDiv);

        const metaParts: string[] = [];
        if (Array.isArray(def.tags) && def.tags.length > 0) {
          const tags = def.tags
            .map((t) => (typeof t === "string" ? t : ""))
            .filter(Boolean)
            .join(", ");
          if (tags) metaParts.push(tags);
        }

        if (Array.isArray(def.glosses) && def.glosses.length > 0) {
          const glosses = def.glosses
            .map((g) => (typeof g === "string" ? g : ""))
            .filter(Boolean)
            .join("; ");
          if (glosses) metaParts.push(glosses);
        }

        if (def.note && typeof def.note === "string") {
          metaParts.push(def.note);
        }

        if (def.senseid && typeof def.senseid === "string") {
          metaParts.push(`#${def.senseid}`);
        }

        if (metaParts.length > 0) {
          const metaDiv = document.createElement("div");
          metaDiv.className = "def-meta";
          metaDiv.textContent = metaParts.join(" • ");
          li.appendChild(metaDiv);
        }

        const examples: string[] = [];
        if (Array.isArray(def.examples)) {
          examples.push(...def.examples);
        }
        if (Array.isArray(def.parsedExamples)) {
          def.parsedExamples.forEach((ex) => {
            if (ex.example) {
              if (ex.translation) {
                examples.push(`${ex.example} — ${ex.translation}`);
              } else {
                examples.push(ex.example);
              }
            }
          });
        }

        if (examples.length > 0) {
          const exampleList = document.createElement("ul");
          exampleList.className = "example-list";
          examples.slice(0, MAX_EXAMPLES_PER_DEF).forEach((ex) => {
            const liEx = document.createElement("li");
            liEx.className = "example-item";
            liEx.appendChild(buildSafeHtmlFragment(ex));
            if ((liEx.textContent || "").trim()) {
              exampleList.appendChild(liEx);
            }
          });
          if (exampleList.children.length > 0) {
            li.appendChild(exampleList);
          }
        }

        list.appendChild(li);
        count++;
      });
    });

    return list.children.length > 0 ? list : null;
  },

  renderLookupResult(
    result: DictionaryLookupResult,
    onToggleSave?: () => Promise<boolean>
  ): {
    title: string;
    content: DocumentFragment;
    saveOptions: TooltipSaveOptions | null;
  } {
    const fragment = document.createDocumentFragment();

    if (result.status === "success") {
      const defsNode = TooltipRenderer.formatDefinitions(result.definitions);
      if (defsNode) {
        fragment.appendChild(defsNode);
      }
      const note =
        result.resolvedTerm !== result.word
          ? `Showing traditional entry for ${result.resolvedTerm}.`
          : null;
      fragment.appendChild(
        TooltipRenderer.buildWiktionaryLink(result.resolvedTerm, note)
      );

      const saveOptions: TooltipSaveOptions | null = onToggleSave
        ? {
            isSaved: result.isSaved,
            onToggleSave,
          }
        : null;

      return {
        title: result.word,
        content: fragment,
        saveOptions,
      };
    }

    if (result.status === "not_found") {
      fragment.appendChild(
        TooltipRenderer.createMessageNode(
          "The public Wiktionary API does not have a definition entry for this exact term."
        )
      );
      fragment.appendChild(
        TooltipRenderer.buildWiktionaryLink(
          result.word,
          "The entry may still exist on the main site; click to open the full page on Wiktionary."
        )
      );
      return { title: result.word, content: fragment, saveOptions: null };
    }

    if (result.status === "no_chinese") {
      fragment.appendChild(
        TooltipRenderer.createMessageNode(
          "No Chinese definition is exposed by the public Wiktionary API for this term."
        )
      );
      fragment.appendChild(
        TooltipRenderer.buildWiktionaryLink(
          result.word,
          "The entry almost certainly exists on the main site; click to open the full page on Wiktionary."
        )
      );
      return { title: result.word, content: fragment, saveOptions: null };
    }

    // error
    fragment.appendChild(
      TooltipRenderer.createMessageNode(
        "The public Wiktionary API did not return a definition."
      )
    );
    fragment.appendChild(
      TooltipRenderer.buildWiktionaryLink(
        result.word,
        "The entry very likely exists on the website; click to open the Wiktionary page directly."
      )
    );
    return { title: result.word, content: fragment, saveOptions: null };
  },
};
