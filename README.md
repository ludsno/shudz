## Shudz – Chinese helper

Shudz (*Shuzi* em transcrição Yale-Giles) é uma extensão para Google Chrome que ajuda a ler texto em chinês, adicionando Pinyin acima dos caracteres, separando palavras e exibindo definições rápidas a partir do dicionário Wiktionary.

O foco é a aprendizagem: a língua chinesa é caracterizada pelos seus incontáveis caracteres. Ao aprender a língua, um problema com que muitos se deparam é a compreensão desses caracteres. Sendo assim, Shudz pode ser usado como uma ferramenta leve e prática, mostrando a transcrição dos caracteres acima do texto e, assim, ajudando quem almeja aprender Chinês.

---

## Funcionalidades

- **Overlay de Pinyin por página (per-domain)**  
	Adiciona a transcrição Pinyin acima dos caracteres chineses usando anotações *ruby*. O estado é salvo por domínio: se você ativar o overlay em `example.com`, ele continuará ativo lá nas próximas visitas, mas não afeta outros sites.

- **Detecção automática de páginas em chinês**  
	A extensão analisa o texto da página; se encontrar conteúdo suficiente em chinês, pode ativar automaticamente o overlay (opção configurável no popup).

- **Segmentação de palavras (Word segmentation)**  
	Textos em chinês costumam vir sem espaços entre palavras. A Shudz usa `Intl.Segmenter` (quando disponível no navegador) para separar automaticamente o texto em palavras, o que melhora a leitura e o posicionamento do Pinyin. Você pode ligar/desligar esse modo pelo popup.

- **Dicionário integrado (Wiktionary)**  
	Ao selecionar uma palavra ou trecho em chinês na página, a extensão consulta a API pública do Wiktionary e exibe um tooltip com definições, exemplos e um link para o verbete completo. Esse comportamento pode ser ativado/desativado por um toggle próprio.

- **Master toggle (liga/desliga geral)**  
	Um botão mestre no popup que desativa completamente a extensão na aba atual. Quando você liga de novo, a Shudz restaura o último estado que você tinha configurado (overlay, segmentação, dicionário, auto-detect, etc.).

- **Configurações persistentes**  
	As preferências são salvas com `chrome.storage`: por site (estado do overlay) e globalmente (segmentação, dicionário, auto-ativação, master).

---

## Como usar

1. **Abra uma página em chinês.**  
	 Qualquer site com textos em chinês funciona.

2. **Clique no ícone da extensão (Shudz).**  
	 O popup mostra vários toggles:

	 - **Extension enabled** (master)
		 - Liga/desliga a extensão na aba atual.
	 - **Pinyin overlay**
		 - Ativa ou desativa a exibição do Pinyin acima dos caracteres chineses nesta página (estado salvo por domínio).
	 - **Word segmentation**
		 - Quando ligado, a extensão tenta separar o texto em palavras (quando o navegador suporta `Intl.Segmenter`).
	 - **Dictionary definitions**
		 - Liga/desliga o dicionário: quando ligado, selecionar texto em chinês abre o tooltip com definições do Wiktionary.
	 - **Auto-activate on Chinese pages**
		 - Se ligado, páginas detectadas como “principalmente em chinês” ativam automaticamente o overlay (e ligam segmentação + dicionário).

3. **Veja o Pinyin aparecer na página.**  
	 Quando o overlay é ativado, o script percorre o texto, identifica os caracteres chineses, converte para Pinyin usando a biblioteca `pinyin-pro` (via `pinyin-lib.js`) e injeta a transcrição como anotação *ruby*.

4. **Use o dicionário.**  
	 - Se o dicionário estiver ativo, selecione uma palavra ou expressão em chinês.  
	 - Um tooltip elegante aparecerá perto da seleção com definições, exemplos e um link para o Wiktionary.

5. **Ajuste tudo ao seu gosto.**  
	 Todos os toggles podem ser alterados a qualquer momento pelo popup. O master toggle coloca os demais em modo “stand-by” visual quando desligado, sem perder a configuração interna.

---

## Instalação (modo desenvolvedor)

Como o projeto ainda não está empacotado para a Chrome Web Store, você pode instalá-lo localmente em modo desenvolvedor:

1. Clone ou baixe este repositório.
2. No Chrome, abra `chrome://extensions/`.
3. Ative o **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** / **Load unpacked**.
5. Selecione a pasta do projeto (`shudz-wikt`).

O ícone da Shudz deve aparecer na barra de extensões. A partir daí você já pode abrir uma página em chinês e testar.

A extensão funciona também em qualquer navegador baseado em Chromium (ex.: MS Edge, Brave).

> Atenção: a extensão pede permissões de `activeTab`, `scripting` e `storage`, além de acesso ao domínio `en.wiktionary.org` para obter definições.

---

## Arquitetura do projeto

Principais arquivos:

- `manifest.json` – Manifesto MV3 da extensão (permissões, content scripts, popup, recursos acessíveis).
- `content.js` – Script injetado nas páginas; é responsável por:
	- Detectar texto em chinês.
	- Inserir/remover o overlay de Pinyin.
	- Tratar segmentação de palavras (smart segmentation) vs caractere a caractere.
	- Integrar com o dicionário (seleção de texto + tooltip).
	- Controlar o estado interno (`shudzState`), incluindo master toggle.
- `pinyin-lib.js` – Empacota a biblioteca de conversão para Pinyin (`pinyin-pro`).
- `styles.css` – Estilos do tooltip de dicionário e do overlay.
- `popup.html` / `popup.js` – Interface gráfica dos toggles (master, Pinyin, segmentação, dicionário, auto-detect) e integração com `chrome.storage` + mensagens para o `content.js`.

---

Contribuições e sugestões são bem-vindas.
