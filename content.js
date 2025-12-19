let pinyinHasBeenAdded = false;
const domainKey = "pinyin_state_" + window.location.hostname;
let observer = null;
let processingQueue = [];
let isProcessing = false;
chrome.storage.local.get([domainKey], (result) => {
  const savedState = result[domainKey];

  if (savedState === true) {
    if (document.readyState === "complete") {
      enablePinyin();
    } else {
      window.addEventListener("load", enablePinyin);
    }
  } else if (savedState === false) {
  } else {
    setTimeout(() => {
      if (detectPageLanguage()) {
        enablePinyin();
        chrome.storage.local.set({ [domainKey]: true });
      }
    }, 2000);
  }
});

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "togglePinyin") {
    const isCurrentlyOn = document.body.classList.contains("pinyin-visible");
    if (isCurrentlyOn) {
      disablePinyin();
      chrome.storage.local.set({ [domainKey]: false });
    } else {
      enablePinyin();
      chrome.storage.local.set({ [domainKey]: true });
    }
  }
});

function enablePinyin() {
  document.body.classList.add("pinyin-visible");

  if (!pinyinHasBeenAdded) {
    queueNodesForProcessing(document.body);
    pinyinHasBeenAdded = true;
  }

  startObserver();
  document.addEventListener("mouseup", handleTextSelection);
}

function disablePinyin() {
  document.body.classList.remove("pinyin-visible");
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  processingQueue = [];
  document.removeEventListener("mouseup", handleTextSelection);
  removeTooltip();
}

function queueNodesForProcessing(rootNode) {
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
      containsChinese(node.nodeValue) &&
      tag !== "SCRIPT" &&
      tag !== "STYLE" &&
      tag !== "TEXTAREA" &&
      tag !== "INPUT" &&
      tag !== "RUBY" &&
      tag !== "RT" &&
      !parent.isContentEditable
    ) {
      processingQueue.push(node);
    }
  }
  if (!isProcessing) {
    processQueueBatch();
  }
}

function processQueueBatch() {
  if (processingQueue.length === 0) {
    isProcessing = false;
    return;
  }

  isProcessing = true;

  const batchSize = 50;
  const batch = processingQueue.splice(0, batchSize);

  batch.forEach((textNode) => {
    if (!textNode.parentNode) return;

    let fontClass = "is-sans";
    try {
      const parentStyle = window.getComputedStyle(textNode.parentNode);
      const fontFamily = parentStyle.fontFamily.toLowerCase();
      if (isFontSerif(fontFamily)) {
        fontClass = "is-serif";
      }
    } catch (e) {}

    const fragment = document.createDocumentFragment();
    const text = textNode.nodeValue;

    const segmenter = getChineseWordSegmenter();

    if (segmenter) {
      const segments = segmenter.segment(text);
      for (const { segment, isWordLike } of segments) {
        if (isWordLike && containsChinese(segment)) {
          const ruby = document.createElement("ruby");
          ruby.textContent = segment;

          ruby.classList.add("shudz-word");

          const rt = document.createElement("rt");
          rt.textContent = convertToPinyin(segment);
          rt.className = fontClass;

          ruby.appendChild(rt);
          fragment.appendChild(ruby);
        } else {
          fragment.appendChild(document.createTextNode(segment));
        }
      }
    } else {
      for (const char of text) {
        if (containsChinese(char)) {
          const ruby = document.createElement("ruby");
          ruby.textContent = char;

          const rt = document.createElement("rt");
          rt.textContent = convertToPinyin(char);
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
    requestIdleCallback(() => processQueueBatch());
  } else {
    setTimeout(processQueueBatch, 10);
  }
}
function isFontSerif(fontString) {
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
}

function startObserver() {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          if (node.tagName === "RUBY" || node.tagName === "RT") return;
          queueNodesForProcessing(node);
        } else if (node.nodeType === 3) {
          if (containsChinese(node.nodeValue)) {
            if (node.parentNode) queueNodesForProcessing(node.parentNode);
          }
        }
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function containsChinese(text) {
  if (!text) return false;
  return /[\u4e00-\u9fff]/.test(text);
}

function convertToPinyin(text) {
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
}
let chineseWordSegmenter = null;

function getChineseWordSegmenter() {
  try {
    if (!window.Intl || !Intl.Segmenter) return null;
    if (!chineseWordSegmenter) {
      chineseWordSegmenter = new Intl.Segmenter("zh", {
        granularity: "word",
      });
    }
    return chineseWordSegmenter;
  } catch (e) {
    return null;
  }
}

function detectingPageLanguage() {
  const text = document.body.innerText.slice(0, 1000);
  return (text.match(/[\u4e00-\u9fa5]/g) || []).length > 10;
}
function detectPageLanguage() {
  return detectingPageLanguage();
}

let currentTooltip = null;

function handleTextSelection(event) {
  setTimeout(() => {
    const selection = window.getSelection();
    const rawText = selection.toString().trim();
    const text = normalizeChineseSelection(rawText);
    if (text && containsChinese(text) && text.length <= 20) {
      fetchDefinition(text, selection.getRangeAt(0));
    } else {
    }
  }, 10);
}
function normalizeChineseSelection(text) {
  if (!text) return "";

  const matches = text.match(/[\u4e00-\u9fff]+/g);
  if (!matches) return text;
  return matches.join("");
}

async function fetchDefinition(word, range) {
  showTooltip(word, "Loading definition...", range);

  try {
    const response = await fetch(
      `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(
        word
      )}`
    );
    if (response.status === 404) {
      const messageHtml = `<div class="def-text">The public Wiktionary API does not have a definition entry for this exact term.</div>`;
      const linkHtml = buildWiktionaryLink(
        word,
        "The entry may still exist on the main site; click to open the full page on Wiktionary."
      );
      showTooltip(word, messageHtml + linkHtml, range);
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    const chineseDefinitions = extractChineseDefinitions(data);

    if (chineseDefinitions && chineseDefinitions.length > 0) {
      const defsHtml = formatWiktionaryData(chineseDefinitions);
      const linkHtml = buildWiktionaryLink(
        word,
        "This definition was retrieved from the public Wiktionary API. Click to see the full entry."
      );
      showTooltip(word, defsHtml + linkHtml, range);
    } else {
      console.log("No Chinese definitions in Wiktionary response:", data);
      const messageHtml = `<div class="def-text">No Chinese definition is exposed by the public Wiktionary API for this term.</div>`;
      const linkHtml = buildWiktionaryLink(
        word,
        "The entry almost certainly exists on the main site; click to open the full page on Wiktionary."
      );
      showTooltip(word, messageHtml + linkHtml, range);
    }
  } catch (error) {
    console.error(error);
    const messageHtml = `<div class="def-text">The public Wiktionary API did not return a definition.</div>`;
    const linkHtml = buildWiktionaryLink(
      word,
      "The entry very likely exists on the website; click to open the Wiktionary page directly."
    );
    showTooltip(word, messageHtml + linkHtml, range);
  }
}

function buildWiktionaryLink(term, note) {
  const url = `https://en.wiktionary.org/wiki/${encodeURIComponent(term)}#Chinese`;
  const noteHtml = note ? `<span class="wiktionary-note">${note}</span>` : "";
  return `
    <div class="wiktionary-link">
      <a href="${url}" target="_blank" rel="noopener noreferrer">Open page on Wiktionary</a>
      ${noteHtml}
    </div>
  `;
}

function formatWiktionaryData(entries) {
  let itemsHtml = "";
  let count = 0;

  entries.forEach((entry) => {
    const pos = entry.partOfSpeech || "";
    const lang = entry.language || "";
    const defs = Array.isArray(entry.definitions) ? entry.definitions : [];

    defs.forEach((def) => {
      if (count >= 8) return;

      const definitionHtml = def.definition || "";

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

      let exampleHtml = "";
      if (examples.length > 0) {
        exampleHtml += '<ul class="example-list">';
        examples.slice(0, 2).forEach((ex) => {
          exampleHtml += `<li class="example-item">${ex}</li>`;
        });
        exampleHtml += "</ul>";
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

      let metaHtml = "";
      if (metaParts.length > 0) {
        metaHtml = `<div class="def-meta">${metaParts.join(" • ")}</div>`;
      }

      itemsHtml += "<li>";
      if (pos) {
        itemsHtml += `<span class="pos-tag">${pos}</span> `;
      }
      if (lang) {
        itemsHtml += `<span class="lang-tag">${lang}</span> `;
      }
      itemsHtml += `<div class="def-text">${definitionHtml}</div>`;
      itemsHtml += metaHtml;
      itemsHtml += exampleHtml;
      itemsHtml += "</li>";

      count++;
    });
  });

  if (!itemsHtml) return "Definition format not supported.";
  return `<ul>${itemsHtml}</ul>`;
}

function extractChineseDefinitions(data) {
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
}

function showTooltip(title, contentHTML, range) {
  removeTooltip(); // Remove anterior se existir

  const tooltip = document.createElement("div");
  tooltip.id = "shudz-tooltip";
  if (isPageDark()) {
    tooltip.classList.add("shudz-dark");
  }

  tooltip.innerHTML = `
    <h4>
      <span class="word-text">${title}</span>
      <span class="close-btn" onclick="this.parentElement.parentElement.remove()">✕</span>
    </h4>
    <div class="header-subtitle">Chinese dictionary · Wiktionary</div>
    <div class="shudz-content">${contentHTML}</div>
  `;

  document.body.appendChild(tooltip);
  currentTooltip = tooltip;

  // --- Posicionamento Inteligente ---
  const rect = range.getBoundingClientRect();
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;

  // Posiciona 10px abaixo da seleção
  let top = rect.bottom + scrollY + 10;
  let left = rect.left + scrollX;

  // Previne sair da tela (Direita)
  if (left + 300 > window.innerWidth) {
    left = window.innerWidth - 310;
  }

  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;

  // Listener para fechar se clicar fora
  setTimeout(() => {
    document.addEventListener("click", closeTooltipOnClickOutside);
  }, 100);
}

function isPageDark() {
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
}

function removeTooltip() {
  if (currentTooltip) {
    currentTooltip.remove();
    currentTooltip = null;
    document.removeEventListener("click", closeTooltipOnClickOutside);
  }
}

function closeTooltipOnClickOutside(e) {
  if (currentTooltip && !currentTooltip.contains(e.target)) {
    removeTooltip();
  }
}