import { SavedWordsService } from "../services/saved-words.service.ts";
import { htmlToPlainText } from "../shared/html.ts";
import type { SavedWord } from "../shared/types.ts";
import {
  appendHighlightedText,
  appendRichContent,
  normalizeText,
} from "./search-highlight.ts";

export class WordsController {
  private savedWordsMap: Record<string, SavedWord> = {};
  private selectedWords = new Set<string>();
  private isSelectionMode = false;
  private targetWordParam: string | null = null;

  constructor(
    private elements: {
      savedCountEl: HTMLElement;
      searchInput: HTMLInputElement;
      wordList: HTMLElement;
      exportJsonBtn: HTMLButtonElement;
      exportCsvBtn: HTMLButtonElement;
      exportTsvBtn: HTMLButtonElement;
      normalActions: HTMLElement;
      selectionActions: HTMLElement;
      enterSelectBtn: HTMLButtonElement;
      cancelSelectBtn: HTMLButtonElement;
      selectAllCheckbox: HTMLInputElement;
      selectAllLabel: HTMLElement;
      deleteSelectedBtn: HTMLButtonElement;
    }
  ) {
    this.targetWordParam = new URLSearchParams(window.location.search).get("word");
    if (this.targetWordParam) {
      this.elements.searchInput.value = this.targetWordParam;
    }
  }

  init(): void {
    const {
      searchInput,
      wordList,
      enterSelectBtn,
      cancelSelectBtn,
      selectAllCheckbox,
      deleteSelectedBtn,
      exportJsonBtn,
      exportCsvBtn,
      exportTsvBtn,
    } = this.elements;

    searchInput.addEventListener("input", () => this.render());

    enterSelectBtn.addEventListener("click", () => this.setSelectionMode(true));
    cancelSelectBtn.addEventListener("click", () => this.setSelectionMode(false));

    selectAllCheckbox.addEventListener("change", () => {
      const filtered = this.getFilteredWords();
      if (selectAllCheckbox.checked) {
        filtered.forEach((item) => this.selectedWords.add(item.word));
      } else {
        filtered.forEach((item) => this.selectedWords.delete(item.word));
      }
      this.render();
    });

    deleteSelectedBtn.addEventListener("click", async () => {
      const count = this.selectedWords.size;
      if (count === 0) return;
      if (
        !window.confirm(
          `Remove ${count} selected word(s)? This cannot be undone.`
        )
      ) {
        return;
      }
      await SavedWordsService.deleteWords(this.selectedWords);
      this.selectedWords.forEach((word) => {
        delete this.savedWordsMap[word];
      });
      this.selectedWords.clear();
      this.setSelectionMode(false);
    });

    exportJsonBtn.addEventListener("click", () => {
      const items = this.getFilteredWords();
      this.downloadFile(
        "shudz-saved-words.json",
        SavedWordsService.exportAsJson(items),
        "application/json;charset=utf-8"
      );
    });

    exportCsvBtn.addEventListener("click", () => {
      const items = this.getFilteredWords();
      this.downloadFile(
        "shudz-saved-words.csv",
        SavedWordsService.exportAsCsv(items),
        "text/csv;charset=utf-8"
      );
    });

    exportTsvBtn.addEventListener("click", () => {
      const items = this.getFilteredWords();
      this.downloadFile(
        "shudz-anki.tsv",
        SavedWordsService.exportAsAnkiTsv(items),
        "text/tab-separated-values;charset=utf-8"
      );
    });

    // Delegated click on wordList
    wordList.addEventListener("click", async (e) => {
      const target = e.target as HTMLElement;

      const deleteBtn = target.closest<HTMLButtonElement>(
        "[data-action='delete']"
      );
      if (deleteBtn) {
        const word = deleteBtn.dataset.word;
        if (!word) return;
        if (
          !window.confirm(
            `Remove "${word}" from saved words? This cannot be undone.`
          )
        ) {
          return;
        }
        await SavedWordsService.deleteWord(word);
        delete this.savedWordsMap[word];
        this.selectedWords.delete(word);
        this.render();
        return;
      }

      const expandBtn = target.closest<HTMLButtonElement>(
        "[data-action='expand']"
      );
      if (expandBtn) {
        const card = expandBtn.closest(".word-card");
        const details = card?.querySelector<HTMLElement>(".word-details");
        if (details) {
          const isHidden = details.hidden;
          details.hidden = !isHidden;
          expandBtn.textContent = isHidden ? "Hide" : "Details";
        }
      }
    });

    // Delegated checkbox change on wordList
    wordList.addEventListener("change", (e) => {
      const target = e.target as HTMLInputElement;
      if (target.matches(".word-select-checkbox")) {
        const word = target.dataset.word;
        if (!word) return;
        if (target.checked) {
          this.selectedWords.add(word);
        } else {
          this.selectedWords.delete(word);
        }
        const card = target.closest(".word-card");
        card?.classList.toggle("is-selected", target.checked);
        this.updateSelectionToolbar(this.getFilteredWords());
      }
    });
  }

  updateWords(map: Record<string, SavedWord>): void {
    this.savedWordsMap = map;
    this.render();
  }

  setSelectionMode(active: boolean): void {
    this.isSelectionMode = active;
    if (!active) {
      this.selectedWords.clear();
    }
    this.elements.normalActions.hidden = active;
    this.elements.selectionActions.hidden = !active;
    this.elements.wordList.classList.toggle("is-selecting", active);
    this.render();
  }

  getFilteredWords(): SavedWord[] {
    const rawQuery = this.elements.searchInput.value.trim();
    const entries = Object.values(this.savedWordsMap).reverse();
    if (!rawQuery) return entries;

    const query = normalizeText(rawQuery);
    const pinyinQuery = normalizeText(rawQuery, true);

    return entries.filter((item) => {
      if (normalizeText(item.word).includes(query)) return true;
      if (normalizeText(item.resolvedTerm).includes(query)) return true;
      if (normalizeText(item.pinyin, true).includes(pinyinQuery)) return true;

      const defs = Array.isArray(item.definitions) ? item.definitions : [];
      return defs.some((d) => {
        const defText = d.text || htmlToPlainText(d.html);
        if (normalizeText(defText).includes(query)) return true;
        return (
          Array.isArray(d.examples) &&
          d.examples.some((ex) =>
            normalizeText(htmlToPlainText(ex)).includes(query)
          )
        );
      });
    });
  }

  private updateSelectionToolbar(filtered: SavedWord[]): void {
    const { deleteSelectedBtn, selectAllCheckbox, selectAllLabel } =
      this.elements;

    for (const word of Array.from(this.selectedWords)) {
      if (!this.savedWordsMap[word]) {
        this.selectedWords.delete(word);
      }
    }

    const totalSelected = this.selectedWords.size;
    deleteSelectedBtn.disabled = totalSelected === 0;
    deleteSelectedBtn.textContent = `Delete (${totalSelected})`;

    const hasFiltered = filtered.length > 0;
    selectAllCheckbox.disabled = !hasFiltered;
    selectAllLabel.classList.toggle("is-disabled", !hasFiltered);

    if (!hasFiltered) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
      return;
    }

    const selectedFilteredCount = filtered.filter((item) =>
      this.selectedWords.has(item.word)
    ).length;
    selectAllCheckbox.checked = selectedFilteredCount === filtered.length;
    selectAllCheckbox.indeterminate =
      selectedFilteredCount > 0 && selectedFilteredCount < filtered.length;
  }

  render(): void {
    const {
      savedCountEl,
      exportJsonBtn,
      exportCsvBtn,
      exportTsvBtn,
      enterSelectBtn,
      wordList,
      searchInput,
    } = this.elements;

    const allCount = Object.keys(this.savedWordsMap).length;
    savedCountEl.textContent = String(allCount);

    const hasWords = allCount > 0;
    exportJsonBtn.disabled = !hasWords;
    exportCsvBtn.disabled = !hasWords;
    exportTsvBtn.disabled = !hasWords;
    enterSelectBtn.disabled = !hasWords;

    if (!hasWords && this.isSelectionMode) {
      this.setSelectionMode(false);
      return;
    }

    const filtered = this.getFilteredWords();
    this.updateSelectionToolbar(filtered);
    wordList.textContent = "";

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "card empty-state";
      empty.textContent =
        allCount === 0
          ? "No saved words yet. Click the bookmark icon in the dictionary tooltip to save words here."
          : "No saved words match your search.";
      wordList.appendChild(empty);
      return;
    }

    const rawQuery = searchInput.value.trim();

    filtered.forEach((item) => {
      const card = document.createElement("div");
      card.className = "card word-card";
      if (this.selectedWords.has(item.word)) {
        card.classList.add("is-selected");
      }

      const row = document.createElement("div");
      row.className = "word-row";

      const main = document.createElement("div");
      main.className = "word-main";

      const selectBox = document.createElement("input");
      selectBox.type = "checkbox";
      selectBox.className = "word-select-checkbox";
      selectBox.checked = this.selectedWords.has(item.word);
      selectBox.dataset.word = item.word;
      selectBox.setAttribute("aria-label", `Select ${item.word}`);
      main.appendChild(selectBox);

      const hanzi = document.createElement("span");
      hanzi.className = "word-hanzi";
      appendHighlightedText(hanzi, item.word, rawQuery);
      main.appendChild(hanzi);

      if (item.resolvedTerm && item.resolvedTerm !== item.word) {
        const trad = document.createElement("span");
        trad.className = "word-trad";
        appendHighlightedText(trad, `(${item.resolvedTerm})`, rawQuery);
        main.appendChild(trad);
      }

      if (item.pinyin) {
        const pinyin = document.createElement("span");
        pinyin.className = "word-pinyin";
        appendHighlightedText(pinyin, item.pinyin, rawQuery, { isPinyin: true });
        main.appendChild(pinyin);
      }

      const actions = document.createElement("div");
      actions.className = "word-actions";

      const expandBtn = document.createElement("button");
      expandBtn.type = "button";
      expandBtn.className = "btn";
      expandBtn.dataset.action = "expand";
      expandBtn.textContent = "Details";

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-danger";
      deleteBtn.dataset.action = "delete";
      deleteBtn.dataset.word = item.word;
      deleteBtn.textContent = "Delete";

      actions.appendChild(expandBtn);
      actions.appendChild(deleteBtn);
      row.appendChild(main);
      row.appendChild(actions);
      card.appendChild(row);

      const defs = Array.isArray(item.definitions) ? item.definitions : [];
      if (defs[0]?.html || defs[0]?.text) {
        const preview = document.createElement("div");
        preview.className = "word-preview";
        appendRichContent(preview, defs[0].html, defs[0].text, rawQuery);
        card.appendChild(preview);
      }

      const details = document.createElement("div");
      details.className = "word-details";
      details.hidden = true;

      defs.forEach((def) => {
        const defItem = document.createElement("div");
        defItem.className = "def-item";

        if (def.partOfSpeech) {
          const pos = document.createElement("span");
          pos.className = "def-pos";
          pos.textContent = def.partOfSpeech;
          defItem.appendChild(pos);
        }

        const textSpan = document.createElement("span");
        appendRichContent(textSpan, def.html, def.text || "", rawQuery);
        defItem.appendChild(textSpan);

        if (Array.isArray(def.examples) && def.examples.length > 0) {
          const exBox = document.createElement("div");
          exBox.className = "def-examples";
          def.examples.forEach((ex) => {
            const p = document.createElement("div");
            appendRichContent(p, ex, ex, rawQuery);
            exBox.appendChild(p);
          });
          defItem.appendChild(exBox);
        }

        details.appendChild(defItem);
      });

      const metaFooter = document.createElement("div");
      metaFooter.className = "word-meta-footer";

      const wikiLink = document.createElement("a");
      const target = item.resolvedTerm || item.word;
      wikiLink.href = `https://en.wiktionary.org/wiki/${encodeURIComponent(target)}#Chinese`;
      wikiLink.target = "_blank";
      wikiLink.rel = "noopener noreferrer";
      wikiLink.textContent = "Wiktionary ↗";
      metaFooter.appendChild(wikiLink);

      details.appendChild(metaFooter);
      card.appendChild(details);

      if (this.targetWordParam && item.word === this.targetWordParam) {
        details.hidden = false;
        expandBtn.textContent = "Hide";
      }

      wordList.appendChild(card);
    });
  }

  private downloadFile(filename: string, content: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}
