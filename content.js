let pinyinHasBeenAdded = false;
const domainKey = "pinyin_state_" + window.location.hostname;
let observer = null;
let processingQueue = []; // Fila de nós para processar
let isProcessing = false;

// --- 1. Inicialização ---
chrome.storage.local.get([domainKey], (result) => {
  const estadoSalvo = result[domainKey];

  if (estadoSalvo === true) {
    // IMPORTANTE: Espera a página "acalmar" antes de começar
    if (document.readyState === "complete") {
      enablePinyin();
    } else {
      window.addEventListener("load", enablePinyin);
    }
  } else if (estadoSalvo === false) {
    // Mantém desligado
  } else {
    // Tenta detectar
    setTimeout(() => {
      if (detectarLinguaDaPagina()) {
        enablePinyin();
        chrome.storage.local.set({ [domainKey]: true });
      }
    }, 2000); // Aumentei o delay inicial para 2s para garantir que o site carregou o principal
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

// --- Controle ---

function enablePinyin() {
  document.body.classList.add("pinyin-visible");

  if (!pinyinHasBeenAdded) {
    // Processa o corpo inicial
    queueNodesForProcessing(document.body);
    pinyinHasBeenAdded = true;
  }

  startObserver();
}

function disablePinyin() {
  document.body.classList.remove("pinyin-visible");
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  // Limpa a fila se o usuário desligar no meio do carregamento
  processingQueue = [];
}

// --- O SEGREDO DA PERFORMANCE: Processamento em Lotes ---

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

    // Filtros de segurança
    if (
      containsChinese(node.nodeValue) &&
      tag !== "SCRIPT" &&
      tag !== "STYLE" &&
      tag !== "TEXTAREA" &&
      tag !== "INPUT" &&
      tag !== "RUBY" &&
      tag !== "RT" &&
      // Evita quebrar ícones ou botões complexos
      !parent.isContentEditable
    ) {
      processingQueue.push(node);
    }
  }

  // Se não estiver processando, começa
  if (!isProcessing) {
    processQueueBatch();
  }
}

// ... (mantenha o código anterior até chegar na função processQueueBatch) ...

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

    // 1. DETECÇÃO INTELIGENTE DE FONTE
    // Pegamos o estilo computado do pai para decidir se é Serif ou Sans
    let fontClass = "is-sans"; // Padrão moderno
    try {
      const parentStyle = window.getComputedStyle(textNode.parentNode);
      const fontFamily = parentStyle.fontFamily.toLowerCase();

      // Se a fonte tiver "serif" no nome (e não for sans-serif) ou for uma fonte clássica chinesa
      if (isFontSerif(fontFamily)) {
        fontClass = "is-serif";
      }
    } catch (e) {
      // Se der erro, mantém o padrão Sans
    }

    const fragment = document.createDocumentFragment();
    const text = textNode.nodeValue;

    for (const char of text) {
      if (containsChinese(char)) {
        const ruby = document.createElement("ruby");
        ruby.textContent = char;

        const rt = document.createElement("rt");
        rt.textContent = convertToPinyin(char);

        // AQUI APLICAMOS A CLASSE
        rt.className = fontClass;

        ruby.appendChild(rt);
        fragment.appendChild(ruby);
      } else {
        fragment.appendChild(document.createTextNode(char));
      }
    }

    // Substituição segura
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

// ... (mantenha as outras funções) ...

// --- NOVA FUNÇÃO AUXILIAR (Coloque no final do arquivo) ---

function isFontSerif(fontString) {
  if (!fontString) return false;

  const lower = fontString.toLowerCase();

  // Se o CSS declara explicitamente sans-serif, respeitamos isso
  const hasSansGeneric = lower.includes("sans-serif");
  const hasSerifGeneric = lower.includes("serif");

  // Pega a primeira família declarada, que costuma ser a principal
  const families = lower
    .split(",")
    .map((f) => f.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);

  const firstFamily = families[0] || "";

  // Lista de famílias claramente serifadas (nomes completos, para evitar falsos positivos)
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

  // 1) Se a primeira família está em uma lista conhecida de serif, consideramos serif
  if (serifFamilies.some((name) => firstFamily.includes(name))) {
    return true;
  }

  // 2) Se o genérico é serif e NÃO é sans-serif, consideramos serif
  if (hasSerifGeneric && !hasSansGeneric) {
    return true;
  }

  // Caso contrário, tratamos como sem serifa (sans)
  return false;
}

// --- Observer (Mantido mas simplificado) ---

function startObserver() {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    // Debounce simples: se vier muita mutação, a gente só joga na fila
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          // Elemento
          if (node.tagName === "RUBY" || node.tagName === "RT") return;
          queueNodesForProcessing(node);
        } else if (node.nodeType === 3) {
          // Texto
          if (containsChinese(node.nodeValue)) {
            // Precisamos do pai para processar texto solto
            if (node.parentNode) queueNodesForProcessing(node.parentNode);
          }
        }
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// --- Utilitários ---

function containsChinese(text) {
  return /[\u4e00-\u9fa5]/.test(text);
}

function convertToPinyin(char) {
  try {
    if (typeof pinyinPro === "undefined") return "";
    return pinyinPro.pinyin(char, { toneType: "mark" });
  } catch (e) {
    return "";
  }
}

function detectingLinguaDaPagina() {
  const text = document.body.innerText.slice(0, 1000);
  return (text.match(/[\u4e00-\u9fa5]/g) || []).length > 10;
}
function detectarLinguaDaPagina() {
  return detectingLinguaDaPagina();
}
