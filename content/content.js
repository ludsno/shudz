const Overlay = {
  init() {
    chrome.storage.local.get(
      [
        shudzState.domainKey,
        "useSmartSegmentation",
        "useAutoDetect",
        "useDictionary",
        "shudz_masterEnabled",
        "shudz_theme",
      ],
      (result) => {
        const savedState = result[shudzState.domainKey];
        const savedSeg = result.useSmartSegmentation;
        const savedAuto = result.useAutoDetect;
        const savedDict = result.useDictionary;
        const savedMaster = result.shudz_masterEnabled;
        const savedTheme = result.shudz_theme;

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
        if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "auto") {
          shudzState.theme = savedTheme;
        }

        // Se a extensão está globalmente desativada, não ligamos o overlay
        // nem rodamos auto-detect. O usuário pode reativar depois via popup.
        if (!shudzState.masterEnabled) {
          return;
        }

        if (savedState === true) {
          if (document.readyState === "complete") {
            Overlay.enable();
          } else {
            window.addEventListener("load", Overlay.enable);
          }
        } else if (savedState === false) {
          Overlay.disable();
        } else if (shudzState.useAutoDetect) {
          Overlay.runAutoDetectOnce();
        }
      }
    );

    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
      if (request.type === "getPinyinState") {
        sendResponse({
          enabled: document.body.classList.contains("pinyin-visible"),
        });
      } else if (request.type === "togglePinyin" || request.type === "setPinyinEnabled") {
        const shouldEnable =
          typeof request.value === "boolean"
            ? request.value
            : !document.body.classList.contains("pinyin-visible");
        if (shouldEnable) {
          Overlay.enable();
        } else {
          Overlay.disable();
        }
        chrome.storage.local.set({ [shudzState.domainKey]: shouldEnable });
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
      } else if (request.type === "clearDictionaryCache") {
        Dictionary.clearCache();
      } else if (request.type === "setTheme") {
        const theme = request.value;
        if (theme === "light" || theme === "dark" || theme === "auto") {
          shudzState.theme = theme;
          if (shudzState.currentTooltip) {
            shudzState.currentTooltip.classList.toggle(
              "shudz-dark",
              Tooltip.isPageDark()
            );
          }
        }
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
        !parent.isContentEditable &&
        !parent.closest("#shudz-tooltip")
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
            if (
              node.tagName === "RUBY" ||
              node.tagName === "RT" ||
              node.id === "shudz-tooltip" ||
              node.closest?.("#shudz-tooltip")
            ) {
              return;
            }
            Overlay.queueNodesForProcessing(node);
          } else if (node.nodeType === 3) {
            if (
              Overlay.containsChinese(node.nodeValue) &&
              node.parentNode &&
              !node.parentElement?.closest("#shudz-tooltip")
            ) {
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

// Facade para inicialização e interface principal
const ShudzApp = {
  start() {
    Overlay.init();
  },
};

// Ponto de entrada único
ShudzApp.start();
