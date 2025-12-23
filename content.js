// Configurações e constantes reutilizáveis
const TEXT_SAMPLE_LENGTH = 1000;
const LANGUAGE_MIN_CHARS = 10;
const PROCESS_BATCH_SIZE = 50;
const SELECTION_MAX_LENGTH = 20;
const MAX_DEFINITIONS = 8;
const MAX_EXAMPLES_PER_DEF = 2;
const TOOLTIP_OFFSET_Y = 10;
const TOOLTIP_MAX_WIDTH = 300;
const TOOLTIP_SAFE_MARGIN = 310;
const WIKTIONARY_API_BASE =
  "https://en.wiktionary.org/api/rest_v1/page/definition/";
const WIKTIONARY_PAGE_BASE = "https://en.wiktionary.org/wiki/";

const shudzState = {
  pinyinHasBeenAdded: false,
  domainKey: "pinyin_state_" + window.location.hostname,
  observer: null,
  processingQueue: [],
  isProcessing: false,
  chineseWordSegmenter: null,
  currentTooltip: null,
  useSmartSegmentation: true,
  useAutoDetect: true,
  dictionaryEnabled: true,
  masterEnabled: true,
};

const Overlay = {
  init() {
    chrome.storage.local.get(
      [
        shudzState.domainKey,
        "useSmartSegmentation",
        "useAutoDetect",
        "useDictionary",
        "shudz_masterEnabled",
      ],
      (result) => {
        const savedState = result[shudzState.domainKey];
        const savedSeg = result.useSmartSegmentation;
        const savedAuto = result.useAutoDetect;
        const savedDict = result.useDictionary;
        const savedMaster = result.shudz_masterEnabled;

        if (typeof savedSeg === "boolean") {
          shudzState.useSmartSegmentation = savedSeg;
        }
        if (typeof savedAuto === "boolean") {
          shudzState.useAutoDetect = savedAuto;
        }
        if (typeof savedDict === "boolean") {
          shudzState.dictionaryEnabled = savedDict;
        }
        if (typeof savedMaster === "boolean") {
          shudzState.masterEnabled = savedMaster;
        }

        // Se a extensão está globalmente desativada, não ligamos o overlay
        // nem rodamos auto-detect. O usuário pode reativar depois via popup.
        if (!shudzState.masterEnabled) {
          return;
        }

        // Quando o auto-activate está ligado, ele tem precedência sobre o
        // estado salvo por domínio: sempre tentamos detectar chinês e ligar
        // automaticamente nesta página.
        if (shudzState.useAutoDetect) {
          Overlay.runAutoDetectOnce();
          return;
        }

        // Auto-activate desligado: obedece apenas ao estado salvo por domínio.
        if (savedState === true) {
          if (document.readyState === "complete") {
            Overlay.enable();
          } else {
            window.addEventListener("load", Overlay.enable);
          }
        } else if (savedState === false) {
          // explicitamente desligado: não faz nada (permanece desativado)
          Overlay.disable();
        }
        // Se não há estado salvo e auto-activate está desligado, deixamos
        // o overlay desativado até o usuário ligá-lo manualmente no popup.
      }
    );

    chrome.runtime.onMessage.addListener((request) => {
      if (request.type === "togglePinyin") {
        const isCurrentlyOn =
          document.body.classList.contains("pinyin-visible");
        if (isCurrentlyOn) {
          Overlay.disable();
          chrome.storage.local.set({ [shudzState.domainKey]: false });
        } else {
          Overlay.enable();
          chrome.storage.local.set({ [shudzState.domainKey]: true });
        }
      } else if (request.type === "setSegmentation") {
        const newValue = !!request.value;
        if (shudzState.useSmartSegmentation === newValue) {
          return;
        }
        shudzState.useSmartSegmentation = newValue;
        Overlay.updateSegmentationCssClass();
        if (document.body.classList.contains("pinyin-visible")) {
          Overlay.reapplyPinyinWithCurrentSegmentation();
        }
      } else if (request.type === "setDictionaryEnabled") {
        shudzState.dictionaryEnabled = !!request.value;
      } else if (request.type === "setMasterEnabled") {
        const enabled = !!request.value;
        shudzState.masterEnabled = enabled;
        chrome.storage.local.set({ shudz_masterEnabled: enabled });

        if (!enabled) {
          // Desliga tudo na página atual (overlay e dicionário); estados
          // salvos continuam intactos para futura reativação.
          Overlay.disable();
          return;
        }

        // Reativando: restaura o último estado salvo / auto-detect.
        chrome.storage.local.get([shudzState.domainKey], (res) => {
          const state = res[shudzState.domainKey];
          if (state === true) {
            Overlay.enable();
          } else if (state === false) {
            // mantemos desligado
          } else if (shudzState.useAutoDetect) {
            Overlay.runAutoDetectOnce();
          }
        });
      }
    });

    // Sempre ouvimos seleções de texto; o próprio handleTextSelection
    // respeita o flag dictionaryEnabled, então o dicionário funciona
    // mesmo com o overlay de Pinyin desligado.
    document.addEventListener("mouseup", Overlay.handleTextSelection);
  },

  enable() {
    document.body.classList.add("pinyin-visible");
    Overlay.updateSegmentationCssClass();

    if (!shudzState.pinyinHasBeenAdded) {
      Overlay.queueNodesForProcessing(document.body);
      shudzState.pinyinHasBeenAdded = true;
    }

    Overlay.startObserver();
  },

  disable() {
    document.body.classList.remove("pinyin-visible");
    document.body.classList.remove("shudz-word-mode", "shudz-char-mode");
    if (shudzState.observer) {
      shudzState.observer.disconnect();
      shudzState.observer = null;
    }
    shudzState.processingQueue = [];
    shudzState.isProcessing = false;
    Tooltip.remove();
  },

  /**
   * Enfileira os nós de texto contendo caracteres chineses para processamento.
   * @param {Node} rootNode - O nó raiz para iniciar a busca.
   */
  queueNodesForProcessing(rootNode) {
    if (!rootNode) return;

    const walker = document.createTreeWalker(
      rootNode,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent) continue;
      const tag = parent.tagName;
      if (
        Overlay.containsChinese(node.nodeValue) &&
        tag !== "SCRIPT" &&
        tag !== "STYLE" &&
        tag !== "TEXTAREA" &&
        tag !== "INPUT" &&
        tag !== "RUBY" &&
        tag !== "RT" &&
        !parent.isContentEditable
      ) {
        shudzState.processingQueue.push(node);
      }
    }
    if (!shudzState.isProcessing) {
      Overlay.processQueueBatch();
    }
  },

  /**
   * Processa o lote de nós de texto enfileirados, convertendo caracteres chineses em pinyin.
   */
  processQueueBatch() {
    if (shudzState.processingQueue.length === 0) {
      shudzState.isProcessing = false;
      return;
    }

    shudzState.isProcessing = true;

    const batch = shudzState.processingQueue.splice(0, PROCESS_BATCH_SIZE);

    batch.forEach((textNode) => {
      if (!textNode.parentNode) return;

      let fontClass = "is-sans";
      try {
        const parentStyle = window.getComputedStyle(textNode.parentNode);
        const fontFamily = parentStyle.fontFamily.toLowerCase();
        if (Overlay.isFontSerif(fontFamily)) {
          fontClass = "is-serif";
        }
      } catch (e) {}

      const fragment = document.createDocumentFragment();
      const text = textNode.nodeValue;

      const segmenter = Overlay.getChineseWordSegmenter();

      if (segmenter) {
        const segments = segmenter.segment(text);
        for (const { segment, isWordLike } of segments) {
          if (isWordLike && Overlay.containsChinese(segment)) {
            const ruby = document.createElement("ruby");
            ruby.textContent = segment;

            ruby.classList.add("shudz-word");
            ruby.dataset.shudz = "1";
            ruby.dataset.segment = segment;

            const rt = document.createElement("rt");
            rt.textContent = Overlay.convertToPinyin(segment);
            rt.className = fontClass;

            ruby.appendChild(rt);
            fragment.appendChild(ruby);
          } else {
            fragment.appendChild(document.createTextNode(segment));
          }
        }
      } else {
        for (const char of text) {
          if (Overlay.containsChinese(char)) {
            const ruby = document.createElement("ruby");
            ruby.textContent = char;

            ruby.classList.add("shudz-word");
            ruby.dataset.shudz = "1";
            ruby.dataset.segment = char;

            const rt = document.createElement("rt");
            rt.textContent = Overlay.convertToPinyin(char);
            rt.className = fontClass;

            ruby.appendChild(rt);
            fragment.appendChild(ruby);
          } else {
            fragment.appendChild(document.createTextNode(char));
          }
        }
      }

      if (textNode.parentNode) {
        textNode.parentNode.replaceChild(fragment, textNode);
      }
    });

    if (window.requestIdleCallback) {
      requestIdleCallback(() => Overlay.processQueueBatch());
    } else {
      setTimeout(Overlay.processQueueBatch, 10);
    }
  },

  clearExistingPinyin() {
    const body = document.body;
    if (!body) return;

    const rubyNodes = body.querySelectorAll("ruby[data-shudz='1']");
    rubyNodes.forEach((ruby) => {
      const segment = ruby.dataset.segment || ruby.textContent || "";
      const textNode = document.createTextNode(segment);
      if (ruby.parentNode) {
        ruby.parentNode.replaceChild(textNode, ruby);
      }
    });

    // Depois de substituir rubies por texto, vários TextNodes adjacentes
    // podem representar o que antes era uma palavra inteira. Unificamos
    // nós de texto adjacentes para que o segmentador funcione em strings
    // contínuas, e não caractere por caractere.
    Overlay.mergeAdjacentTextNodes(body);

    shudzState.processingQueue = [];
    shudzState.isProcessing = false;
    shudzState.chineseWordSegmenter = null;
    shudzState.pinyinHasBeenAdded = false;
  },

  reapplyPinyinWithCurrentSegmentation() {
    Overlay.clearExistingPinyin();
    Overlay.queueNodesForProcessing(document.body);
  },

  mergeAdjacentTextNodes(rootNode) {
    if (!rootNode) return;

    const walker = document.createTreeWalker(
      rootNode,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node = walker.nextNode();
    while (node) {
      let next = node.nextSibling;
      while (next && next.nodeType === Node.TEXT_NODE) {
        node.nodeValue += next.nodeValue;
        const toRemove = next;
        next = next.nextSibling;
        if (toRemove.parentNode) {
          toRemove.parentNode.removeChild(toRemove);
        }
      }
      node = walker.nextNode();
    }
  },

  updateSegmentationCssClass() {
    const body = document.body;
    if (!body) return;
    body.classList.remove("shudz-word-mode", "shudz-char-mode");
    body.classList.add(
      shudzState.useSmartSegmentation ? "shudz-word-mode" : "shudz-char-mode"
    );
  },

  /**
   * Determina se a fonte fornecida é serifada.
   */
  isFontSerif(fontString) {
    if (!fontString) return false;

    const lower = fontString.toLowerCase();

    const hasSansGeneric = lower.includes("sans-serif");
    const hasSerifGeneric = lower.includes("serif");
    const families = lower
      .split(",")
      .map((f) => f.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);

    const firstFamily = families[0] || "";

    const serifFamilies = [
      "noto serif sc",
      "noto serif",
      "songti sc",
      "simsun",
      "pmingliu",
      "times new roman",
      "times",
      "georgia",
      "garamond",
      "palatino",
      "mincho",
    ];

    if (serifFamilies.some((name) => firstFamily.includes(name))) {
      return true;
    }
    if (hasSerifGeneric && !hasSansGeneric) {
      return true;
    }
    return false;
  },

  startObserver() {
    if (shudzState.observer) return;

    shudzState.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            if (node.tagName === "RUBY" || node.tagName === "RT") return;
            Overlay.queueNodesForProcessing(node);
          } else if (node.nodeType === 3) {
            if (Overlay.containsChinese(node.nodeValue)) {
              if (node.parentNode)
                Overlay.queueNodesForProcessing(node.parentNode);
            }
          }
        });
      });
    });

    shudzState.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  },

  containsChinese(text) {
    if (!text) return false;
    return /[\u4e00-\u9fff]/.test(text);
  },

  convertToPinyin(text) {
    try {
      if (typeof pinyinPro === "undefined") return "";
      const raw = pinyinPro.pinyin(text, { toneType: "mark" });
      if (!raw) return "";
      if (text && text.length > 1) {
        return String(raw).replace(/\s+/g, "");
      }
      return raw;
    } catch (e) {
      return "";
    }
  },

  getChineseWordSegmenter() {
    if (!shudzState.useSmartSegmentation) {
      return null; // força fallback caractere-a-caractere
    }
    try {
      if (!window.Intl || !Intl.Segmenter) return null;
      if (!shudzState.chineseWordSegmenter) {
        shudzState.chineseWordSegmenter = new Intl.Segmenter("zh", {
          granularity: "word",
        });
      }
      return shudzState.chineseWordSegmenter;
    } catch (e) {
      return null;
    }
  },

  detectPageLanguage() {
    const text = document.body.innerText.slice(0, TEXT_SAMPLE_LENGTH);
    return (text.match(/[\u4e00-\u9fa5]/g) || []).length > LANGUAGE_MIN_CHARS;
  },

  handleTextSelection(event) {
    if (!shudzState.masterEnabled || !shudzState.dictionaryEnabled) return;
    setTimeout(() => {
      const selection = window.getSelection();
      const rawText = selection.toString().trim();
      const text = Dictionary.normalizeChineseSelection(rawText);
      if (
        text &&
        Overlay.containsChinese(text) &&
        text.length <= SELECTION_MAX_LENGTH
      ) {
        Dictionary.fetchDefinition(text, selection.getRangeAt(0));
      }
    }, 10);
  },
};

Overlay.runAutoDetectOnce = function () {
  // Função auxiliar fora do objeto literal para poder ser reutilizada
  // tanto na inicialização quanto quando o master é reativado.
  setTimeout(() => {
    if (!shudzState.masterEnabled || !shudzState.useAutoDetect) return;
    if (Overlay.detectPageLanguage()) {
      // Auto-activate sempre usa word segmentation e liga o dicionário
      shudzState.useSmartSegmentation = true;
      shudzState.dictionaryEnabled = true;
      Overlay.updateSegmentationCssClass();
      Overlay.enable();
      chrome.storage.local.set({
        [shudzState.domainKey]: true,
        useSmartSegmentation: true,
        useDictionary: true,
      });
    }
  }, 2000);
};

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

const Tooltip = {
  async ensureTemplateLoaded() {
    if (shudzState.tooltipTemplateElement) return;
    try {
      const url = chrome.runtime.getURL("tooltip-template.html");
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

  show(title, contentNode, range) {
    Tooltip.remove();
    const tooltip = Tooltip.createTooltipElement(title, contentNode);
    Tooltip.attachTooltipCloseBehavior(tooltip);
    document.body.appendChild(tooltip);
    shudzState.currentTooltip = tooltip;
    Tooltip.positionTooltip(tooltip, range);
    setTimeout(() => {
      document.addEventListener("click", Tooltip.closeOnClickOutside);
    }, 100);
  },

  createTooltipElement(title, contentNode) {
    let tooltip;
    if (shudzState.tooltipTemplateElement) {
      tooltip =
        shudzState.tooltipTemplateElement.content.firstElementChild.cloneNode(
          true
        );
    } else {
      tooltip = document.createElement("div");
      tooltip.id = "shudz-tooltip";
      if (Tooltip.isPageDark()) {
        tooltip.classList.add("shudz-dark");
      }
      tooltip.innerHTML = `
        <h4>
          <span class="word-text"></span>
          <span class="close-btn">✕</span>
        </h4>
        <div class="header-subtitle">Chinese dictionary · Wiktionary</div>
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

    const contentEl = tooltip.querySelector(".shudz-content");
    if (contentEl) {
      contentEl.textContent = "";
      if (contentNode instanceof Node) {
        contentEl.appendChild(contentNode);
      }
    }

    return tooltip;
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
    let top = rect.bottom + scrollY + TOOLTIP_OFFSET_Y;
    let left = rect.left + scrollX;
    if (left + TOOLTIP_MAX_WIDTH > window.innerWidth) {
      left = window.innerWidth - TOOLTIP_SAFE_MARGIN;
    }
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  },

  isPageDark() {
    try {
      const style = window.getComputedStyle(document.body);
      const color = style.backgroundColor;
      const match = color && color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (!match) return false;
      const r = parseInt(match[1], 10);
      const g = parseInt(match[2], 10);
      const b = parseInt(match[3], 10);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance < 0.4;
    } catch (e) {
      return false;
    }
  },

  remove() {
    if (shudzState.currentTooltip) {
      shudzState.currentTooltip.remove();
      shudzState.currentTooltip = null;
      document.removeEventListener("click", Tooltip.closeOnClickOutside);
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

// Facade para inicialização e interface principal
const ShudzApp = {
  start() {
    Overlay.init();
  },
};

// Ponto de entrada único
ShudzApp.start();
