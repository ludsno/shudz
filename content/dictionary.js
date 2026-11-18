const Dictionary = {
  normalizeChineseSelection(text) {
    if (!text) return "";

    const matches = text.match(/[\u4e00-\u9fff]+/g);
    if (!matches) return text;
    return matches.join("");
  },

  createMessageNode(text) {
    const div = document.createElement("div");
    div.className = "def-text";
    div.textContent = text;
    return div;
  },

  async fetchDefinition(word, range) {
    await Tooltip.ensureTemplateLoaded();

    const loading = Dictionary.createMessageNode("Loading definition...");
    Tooltip.show(word, loading, range);

    try {
      const data = await Dictionary.fetchWiktionaryData(word);
      Dictionary.handleWiktionaryResponse(word, data, range);
    } catch (error) {
      Dictionary.showErrorTooltip(word, range);
      console.error(error);
    }
  },

  async fetchWiktionaryData(word) {
    const response = await fetch(
      `${WIKTIONARY_API_BASE}${encodeURIComponent(word)}`
    );
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  },

  handleWiktionaryResponse(word, data, range) {
    const fragment = document.createDocumentFragment();

    if (!data) {
      fragment.appendChild(
        Dictionary.createMessageNode(
          "The public Wiktionary API does not have a definition entry for this exact term."
        )
      );
      fragment.appendChild(
        Dictionary.buildWiktionaryLink(
          word,
          "The entry may still exist on the main site; click to open the full page on Wiktionary."
        )
      );
      Tooltip.show(word, fragment, range);
      return;
    }

    const chineseDefinitions = Dictionary.extractChineseDefinitions(data);

    if (chineseDefinitions && chineseDefinitions.length > 0) {
      const defsNode = Dictionary.formatWiktionaryData(chineseDefinitions);
      if (defsNode) {
        fragment.appendChild(defsNode);
      }
      fragment.appendChild(
        Dictionary.buildWiktionaryLink(
          word,
          "This definition was retrieved from the public Wiktionary API. Click to see the full entry."
        )
      );
    } else {
      fragment.appendChild(
        Dictionary.createMessageNode(
          "No Chinese definition is exposed by the public Wiktionary API for this term."
        )
      );
      fragment.appendChild(
        Dictionary.buildWiktionaryLink(
          word,
          "The entry almost certainly exists on the main site; click to open the full page on Wiktionary."
        )
      );
    }

    Tooltip.show(word, fragment, range);
  },

  showErrorTooltip(word, range) {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(
      Dictionary.createMessageNode(
        "The public Wiktionary API did not return a definition."
      )
    );
    fragment.appendChild(
      Dictionary.buildWiktionaryLink(
        word,
        "The entry very likely exists on the website; click to open the Wiktionary page directly."
      )
    );
    Tooltip.show(word, fragment, range);
  },

  buildWiktionaryLink(term, note) {
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

  formatWiktionaryData(entries) {
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

        const examples = [];
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
            // exemplos podem conter marcação HTML da API do Wiktionary
            liEx.innerHTML = ex;
            exampleList.appendChild(liEx);
          });
          li.appendChild(exampleList);
        }

        const metaParts = [];

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
        // definitionText pode conter marcação HTML vinda da API do Wiktionary
        // (links, itálicos, etc.), então usamos innerHTML aqui.
        defDiv.innerHTML = definitionText;
        li.appendChild(defDiv);

        list.appendChild(li);
        count++;
      });
    });

    return list.children.length > 0 ? list : null;
  },

  extractChineseDefinitions(data) {
    if (!data || typeof data !== "object") return null;

    const chineseRegex = /(Chinese|Mandarin|Cantonese)/i;
    const result = [];

    Object.keys(data).forEach((key) => {
      const entries = data[key];
      if (!Array.isArray(entries)) return;

      entries.forEach((entry) => {
        if (!entry || typeof entry !== "object") return;
        const langLabel = entry.language || "";
        if (chineseRegex.test(langLabel)) {
          result.push(entry);
        }
      });
    });

    // Se nada em chinês for encontrado, tenta entradas "Translingual" como fallback
    if (result.length === 0) {
      Object.keys(data).forEach((key) => {
        const entries = data[key];
        if (!Array.isArray(entries)) return;

        entries.forEach((entry) => {
          if (!entry || typeof entry !== "object") return;
          const langLabel = entry.language || "";
          if (/Translingual/i.test(langLabel)) {
            result.push(entry);
          }
        });
      });
    }

    return result.length > 0 ? result : null;
  },
};
