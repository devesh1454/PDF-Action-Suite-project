// ── CONFIG ─────────────────────────────────────────
// Connects to local secure Express backend proxy (which reads the API key securely from .env)
const BACKEND_API_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:3001/api/chat"
  : "/api/chat";
const DIRECT_API_URL  = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL  = "deepseek-chat";

// Chunking config — tuned for accuracy vs. latency
const CHUNK_SIZE    = 600;  // words per chunk
const CHUNK_OVERLAP = 80;   // word overlap between chunks
const TOP_K         = 6;    // chunks to inject into context

// PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// ── STATE ──────────────────────────────────────────
let pdfChunks     = [];   // { text, pageNums }[]
let pdfText       = "";
let pdfPageCount  = 0;
let pdfFileName   = "";
let isProcessing  = false;
let isStreaming   = false;
let chatHistory   = [];   // { role, content }[]

// ── DROP ZONE SETUP ────────────────────────────────
const dz       = document.getElementById("dropZone");
const pdfInput = document.getElementById("pdfInput");

dz.addEventListener("click",     () => pdfInput.click());
dz.addEventListener("dragover",  e  => { e.preventDefault(); dz.classList.add("dragging"); });
dz.addEventListener("dragleave", e  => { if (!dz.contains(e.relatedTarget)) dz.classList.remove("dragging"); });
dz.addEventListener("drop",      e  => { e.preventDefault(); dz.classList.remove("dragging"); handleFile(e.dataTransfer.files[0]); });
pdfInput.addEventListener("change", e => { if (e.target.files[0]) handleFile(e.target.files[0]); });

// ── FILE HANDLER ───────────────────────────────────
async function handleFile(file) {
  if (!file || file.type !== "application/pdf") return;
  pdfFileName = file.name;

  // Show doc info panel
  document.getElementById("uploadSection").classList.add("hidden");
  document.getElementById("docInfoSection").classList.remove("hidden");
  document.getElementById("docFileName").textContent = truncate(file.name, 28);
  document.getElementById("docFileMeta").textContent = `Loading… · ${formatBytes(file.size)}`;
  document.getElementById("processingBar").classList.remove("hidden");
  document.getElementById("readyBadge").classList.add("hidden");
  document.getElementById("docStats").classList.add("hidden");
  document.getElementById("suggestionsSection").classList.add("hidden");

  setProgress(5, "Reading PDF…");
  isProcessing = true;

  try {
    const arrayBuffer = await file.arrayBuffer();
    setProgress(15, "Parsing pages…");

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    pdfPageCount = pdf.numPages;

    setProgress(20, `Extracting ${pdfPageCount} pages…`);

    // Extract text page by page
    const pageTexts = [];
    for (let i = 1; i <= pdfPageCount; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text    = content.items.map(s => s.str).join(" ").replace(/\s+/g, " ").trim();
      pageTexts.push(text);
      const pct = 20 + Math.round((i / pdfPageCount) * 50);
      setProgress(pct, `Extracting page ${i}/${pdfPageCount}…`);
    }

    pdfText = pageTexts.join("\n\n");
    const wordCount = pdfText.split(/\s+/).filter(Boolean).length;

    setProgress(72, "Chunking document…");
    pdfChunks = chunkDocument(pageTexts);

    setProgress(90, "Finalising…");
    document.getElementById("docFileMeta").textContent = `${pdfPageCount} pages · ${formatBytes(file.size)}`;
    document.getElementById("statPages").textContent  = pdfPageCount;
    document.getElementById("statWords").textContent  = wordCount.toLocaleString();
    document.getElementById("statChunks").textContent = pdfChunks.length;
    document.getElementById("chunkCount").textContent = `${pdfChunks.length} chunks`;

    setProgress(100, "Done!");
    await sleep(300);

    document.getElementById("processingBar").classList.add("hidden");
    document.getElementById("readyBadge").classList.remove("hidden");
    document.getElementById("docStats").classList.remove("hidden");

    // Enable input
    const input = document.getElementById("questionInput");
    input.placeholder = "Ask anything about this document…";
    input.disabled    = false;
    document.getElementById("sendBtn").disabled = false;
    document.getElementById("inputDocChip").classList.remove("hidden");
    document.getElementById("inputDocName").textContent = truncate(file.name, 22);

    // Generate suggestions
    generateSuggestions();

    // Clear chat for new doc
    chatHistory = [];
    document.getElementById("messagesArea").innerHTML = "";
    document.getElementById("emptyState").style.display = "flex";

    isProcessing = false;
    input.focus();

  } catch (err) {
    setProgress(0, "Error reading PDF");
    document.getElementById("processingBar").querySelector(".processing-inner").style.color = "#c0392b";
    console.error(err);
    isProcessing = false;
  }
}

// ── CHUNK DOCUMENT ─────────────────────────────────
// Splits into overlapping word-window chunks, tracking source pages
function chunkDocument(pageTexts) {
  const chunks = [];
  // Build word list with page tracking
  const wordList = []; // { word, page }
  pageTexts.forEach((text, pageIdx) => {
    text.split(/\s+/).filter(Boolean).forEach(w => {
      wordList.push({ word: w, page: pageIdx + 1 });
    });
  });

  const total = wordList.length;
  let i = 0;
  while (i < total) {
    const slice = wordList.slice(i, i + CHUNK_SIZE);
    const text  = slice.map(x => x.word).join(" ");
    const pages = [...new Set(slice.map(x => x.page))];
    chunks.push({ text, pageNums: pages });
    i += (CHUNK_SIZE - CHUNK_OVERLAP);
  }
  return chunks;
}

// ── SEMANTIC RETRIEVAL ─────────────────────────────
// Fast TF-IDF-style keyword + bigram scoring (no embedding API needed = zero latency)
function retrieveChunks(query, k) {
  const qTokens = tokenize(query);
  const qBigrams = bigrams(qTokens);

  const scored = pdfChunks.map((chunk, idx) => {
    const cTokens  = tokenize(chunk.text);
    const cBigrams = bigrams(cTokens);
    const cSet     = new Set(cTokens);
    const cBiSet   = new Set(cBigrams);

    // Unigram overlap (TF-weighted)
    let score = 0;
    qTokens.forEach(t => {
      if (cSet.has(t)) {
        // TF: count occurrences
        const tf = cTokens.filter(x => x === t).length / cTokens.length;
        score += 1 + tf * 5;
      }
    });

    // Bigram bonus — rewards phrase matches heavily
    qBigrams.forEach(bg => { if (cBiSet.has(bg)) score += 3; });

    // Exact query substring bonus
    const queryLower = query.toLowerCase();
    if (chunk.text.toLowerCase().includes(queryLower)) score += 10;

    // Recency bias: slightly prefer earlier chunks (usually intro/summary)
    score -= idx * 0.001;

    return { chunk, score, idx };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .sort((a, b) => a.idx - b.idx); // restore document order
}

function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function bigrams(tokens) {
  const bg = [];
  for (let i = 0; i < tokens.length - 1; i++) bg.push(tokens[i] + "_" + tokens[i+1]);
  return bg;
}

// ── SEND QUESTION ──────────────────────────────────
async function sendQuestion() {
  if (isStreaming || isProcessing) return;
  const input   = document.getElementById("questionInput");
  const question = input.value.trim();
  if (!question || pdfChunks.length === 0) return;

  // Clear empty state
  document.getElementById("emptyState").style.display = "none";

  // Append user message
  appendMessage("user", question);
  chatHistory.push({ role: "user", content: question });
  input.value = "";
  autoResize(input);

  // Retrieve relevant chunks
  const relevant = retrieveChunks(question, TOP_K);
  const context  = relevant.map((r, i) =>
    `[Chunk ${i+1} | Page(s) ${r.chunk.pageNums.join(",")}]\n${r.chunk.text}`
  ).join("\n\n---\n\n");

  const pageRefs = [...new Set(relevant.flatMap(r => r.chunk.pageNums))].sort((a,b)=>a-b);

  // Build system prompt — highly detailed for accuracy
  const systemPrompt = buildSystemPrompt(context);

  // Show typing indicator
  const typingId = appendTyping();
  isStreaming = true;
  document.getElementById("sendBtn").disabled = true;

  try {
    // Build messages: system + condensed history (last 6 turns) + current
    const historySlice = chatHistory.slice(-7, -1); // last 3 Q/A pairs
    const messages = [
      { role: "system", content: systemPrompt },
      ...historySlice,
      { role: "user", content: question }
    ];

    const payload = {
      model: DEEPSEEK_MODEL,
      messages,
      stream: true,
      max_tokens: 1200,
      temperature: 0.15,
      top_p: 0.9,
      frequency_penalty: 0.1
    };

    let response;
    const sessionKey = sessionStorage.getItem("DEEPSEEK_API_KEY");

    // 1. Try secure backend proxy first (which holds the API key safely in .env)
    let backendAvailable = false;
    if (!sessionKey) {
      try {
        response = await fetch(BACKEND_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (response.ok) {
          backendAvailable = true;
        }
      } catch (_) {
        // Backend offline or unreachable
      }
    }

    // 2. If backend is not available, check for session-stored key
    if (!backendAvailable) {
      let keyToUse = sessionKey;
      if (!keyToUse) {
        keyToUse = prompt(
          "Backend proxy not detected on http://localhost:3001.\n\nTo use the secure proxy, run:\ncd pdf4/semantic && npm start\n\nOr enter a DeepSeek API key for this browser session only (stored in temporary session memory):"
        );
        if (keyToUse) {
          keyToUse = keyToUse.trim();
          sessionStorage.setItem("DEEPSEEK_API_KEY", keyToUse);
        }
      }

      if (!keyToUse) {
        throw new Error("No backend server running and no session API key provided.");
      }

      response = await fetch(DIRECT_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${keyToUse}`
        },
        body: JSON.stringify(payload)
      });
    }

    if (!response || !response.ok) {
      const err = await response?.json().catch(() => ({}));
      throw new Error(err?.error?.message || `API error ${response?.status || 500}`);
    }

    removeTyping(typingId);

    // Stream response token by token
    const msgEl = appendMessage("assistant", "", pageRefs);
    const bubbleEl = msgEl.querySelector(".msg-bubble");
    let fullText = "";

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter(l => l.startsWith("data: "));

      for (const line of lines) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") break;
        try {
          const parsed = JSON.parse(data);
          const delta  = parsed.choices?.[0]?.delta?.content || "";
          if (delta) {
            fullText += delta;
            bubbleEl.innerHTML = markdownToHtml(fullText);
            scrollMessages();
          }
        } catch (_) { /* ignore parse errors in stream */ }
      }
    }

    // Save to history
    chatHistory.push({ role: "assistant", content: fullText });

  } catch (err) {
    removeTyping(typingId);
    let errMsg = `⚠️ Error: ${err.message}`;
    if (err.message.includes("API key") || err.message.includes("401")) {
      sessionStorage.removeItem("DEEPSEEK_API_KEY");
      errMsg = "⚠️ Authentication error: Please verify your API key in pdf4/semantic/.env and ensure the backend is running (npm start).";
    }
    appendMessage("assistant", errMsg, []);
    console.error("DeepSeek error:", err);
  }

  isStreaming = false;
  document.getElementById("sendBtn").disabled = false;
  document.getElementById("questionInput").focus();
}

// ── SYSTEM PROMPT ──────────────────────────────────
function buildSystemPrompt(context) {
  return `You are an expert document analyst performing semantic search and question answering on a PDF document. Your goal is to provide accurate, helpful, and well-structured answers based strictly on the document content.

DOCUMENT CONTEXT (most relevant sections retrieved for this query):
===
${context}
===

INSTRUCTIONS:
1. ACCURACY FIRST: Only state facts that are clearly supported by the document context above. Never hallucinate or add information not present in the document.
2. DIRECT ANSWERS: Start with a direct, concise answer to the question. Avoid unnecessary preamble like "Based on the document..." — just answer.
3. CITE PAGES: When referencing specific information, mention the page number in parentheses, e.g. "(p. 3)". Use the [Page(s) X] markers in the context.
4. STRUCTURE: For complex answers, use clear formatting:
   - Use **bold** for key terms or important points
   - Use bullet lists for enumerations
   - Use numbered lists for steps or sequences
5. COMPLETENESS: If the context contains the answer, provide it fully. If the answer requires synthesizing multiple sections, do so carefully.
6. HONEST GAPS: If the specific information is not found in the retrieved context, say: "This information wasn't found in the retrieved sections. Try rephrasing your question or asking about a related aspect." Never guess.
7. QUOTE SPARINGLY: Only use direct quotes when the exact wording is important. Paraphrase otherwise.
8. CONCISENESS: Be comprehensive but not verbose. Aim for clarity. Avoid repeating the question back.
9. MULTI-PART QUESTIONS: Address each part separately and clearly.
10. FOLLOW-UP AWARENESS: This may be part of a conversation. Maintain context from previous messages.

TONE: Professional, precise, and helpful. Like a knowledgeable research assistant.`;
}

// ── SUGGESTIONS ────────────────────────────────────
function generateSuggestions() {
  // Generic high-value questions that work for most documents
  const defaults = [
    "Summarize the main points",
    "What are the key findings or conclusions?",
    "List the most important topics covered",
    "What recommendations are made?",
    "What data or statistics are mentioned?"
  ];

  // Try to detect domain from text snippet
  const sample = pdfText.slice(0, 2000).toLowerCase();
  let domainQs = [];

  if (sample.includes("revenue") || sample.includes("profit") || sample.includes("financial"))
    domainQs = ["What are the revenue figures?", "What financial risks are mentioned?"];
  else if (sample.includes("research") || sample.includes("hypothesis") || sample.includes("methodology"))
    domainQs = ["What is the research methodology?", "What are the study limitations?"];
  else if (sample.includes("contract") || sample.includes("clause") || sample.includes("agreement"))
    domainQs = ["What are the key obligations?", "What are the termination conditions?"];
  else if (sample.includes("patient") || sample.includes("treatment") || sample.includes("clinical"))
    domainQs = ["What treatments are discussed?", "What are the side effects mentioned?"];

  const suggestions = [...domainQs, ...defaults].slice(0, 4);
  const list = document.getElementById("suggestionsList");
  list.innerHTML = "";
  suggestions.forEach(s => {
    const btn = document.createElement("button");
    btn.className = "suggestion-chip";
    btn.textContent = s;
    btn.onclick = () => { setInputText(s); sendQuestion(); };
    list.appendChild(btn);
  });
  document.getElementById("suggestionsSection").classList.remove("hidden");
}

// ── DOM HELPERS ────────────────────────────────────
function appendMessage(role, text, pageRefs) {
  const area = document.getElementById("messagesArea");
  const wrap = document.createElement("div");
  wrap.className = `msg ${role}`;

  const avatarText = role === "user" ? "U" : "PDF";
  const avatar = `<div class="msg-avatar">${avatarText}</div>`;

  const bubble = `<div class="msg-bubble">${markdownToHtml(text)}</div>`;

  let sources = "";
  if (role === "assistant" && pageRefs && pageRefs.length > 0) {
    const chips = pageRefs.map(p =>
      `<span class="source-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>p. ${p}</span>`
    ).join("");
    sources = `<div class="source-chips">${chips}</div>`;
  }

  wrap.innerHTML = role === "user"
    ? `${avatar}<div class="msg-body">${bubble}</div>`
    : `${avatar}<div class="msg-body">${bubble}${sources}</div>`;

  area.appendChild(wrap);
  scrollMessages();
  return wrap;
}

function appendTyping() {
  const area = document.getElementById("messagesArea");
  const id   = "typing-" + Date.now();
  const wrap = document.createElement("div");
  wrap.className = "msg assistant";
  wrap.id = id;
  wrap.innerHTML = `
    <div class="msg-avatar">PDF</div>
    <div class="msg-body">
      <div class="msg-bubble typing-bubble">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>`;
  area.appendChild(wrap);
  scrollMessages();
  return id;
}

function removeTyping(id) {
  document.getElementById(id)?.remove();
}

function scrollMessages() {
  const area = document.getElementById("messagesArea");
  area.scrollTop = area.scrollHeight;
}

function setInputText(text) {
  const input = document.getElementById("questionInput");
  input.value = text;
  autoResize(input);
}

// ── MARKDOWN → HTML ────────────────────────────────
function markdownToHtml(md) {
  if (!md) return "";
  return md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") // escape
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^### (.+)$/gm, "<strong>$1</strong>")
    .replace(/^## (.+)$/gm,  "<strong>$1</strong>")
    .replace(/^# (.+)$/gm,   "<strong>$1</strong>")
    .replace(/^\s*[-*]\s+(.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
    .replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^(.+)$/, "<p>$1</p>")
    .replace(/<p><\/p>/g, "");
}

// ── UTILITIES ──────────────────────────────────────
function resetDocument() {
  pdfChunks    = [];
  pdfText      = "";
  pdfPageCount = 0;
  pdfFileName  = "";
  chatHistory  = [];

  document.getElementById("uploadSection").classList.remove("hidden");
  document.getElementById("docInfoSection").classList.add("hidden");
  document.getElementById("messagesArea").innerHTML = "";
  document.getElementById("emptyState").style.display = "flex";

  const input = document.getElementById("questionInput");
  input.value       = "";
  input.placeholder = "Upload a PDF first…";
  input.disabled    = true;
  document.getElementById("sendBtn").disabled = true;
  document.getElementById("inputDocChip").classList.add("hidden");
  document.getElementById("pdfInput").value = "";
}

function setProgress(pct, text) {
  document.getElementById("progressFill").style.width = pct + "%";
  document.getElementById("processingText").textContent = text;
}

function formatBytes(bytes) {
  if (bytes < 1024)       return bytes + " B";
  if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function truncate(str, n) {
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── INPUT HANDLING ─────────────────────────────────
function handleKeydown(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendQuestion();
  }
}

function autoResize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 120) + "px";
}

function useExample(el) {
  if (pdfChunks.length === 0) return;
  setInputText(el.textContent.replace(/['"]/g, ""));
  document.getElementById("questionInput").focus();
}

// ── DROPDOWN ──────────────────────────────────────
function toggleDropdown() {
  document.getElementById("profileDropdown").classList.toggle("open");
}
document.addEventListener("click", e => {
  const wrap = document.getElementById("profileWrap");
  if (wrap && !wrap.contains(e.target))
    document.getElementById("profileDropdown").classList.remove("open");
});
function handleLogout() {
  localStorage.removeItem("loggedInUserId");
  window.location.href = "../index.html";
}

// Expose globals
window.sendQuestion  = sendQuestion;
window.handleKeydown = handleKeydown;
window.autoResize    = autoResize;
window.resetDocument = resetDocument;
window.toggleDropdown = toggleDropdown;
window.handleLogout  = handleLogout;
window.useExample    = useExample;

// ── STOP WORDS (improves retrieval precision) ──────
const STOP_WORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with",
  "is","are","was","were","be","been","being","have","has","had","do",
  "does","did","will","would","could","should","may","might","shall",
  "this","that","these","those","it","its","they","their","there","here",
  "from","by","as","not","no","so","if","then","than","when","where",
  "what","who","how","which","all","any","each","both","more","also",
  "about","into","through","during","before","after","above","below",
  "between","out","up","down","over","under","again","further","just",
  "because","while","although","however","therefore","thus","hence",
  "i","we","you","he","she","they","me","him","her","us","them"
]);
