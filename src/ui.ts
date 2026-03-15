/** Inline HTML for the web UI — mobile-friendly, multi-modal input */
export const UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<title>G2M</title>
<style>
  :root { --bg: #0d1117; --surface: #161b22; --border: #30363d; --text: #e6edf3; --muted: #8b949e; --accent: #58a6ff; --green: #3fb950; --red: #f85149; --yellow: #d29922; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; min-height: 100dvh; }
  .container { max-width: 960px; margin: 0 auto; padding: 12px; }
  h1 { font-size: 20px; margin-bottom: 2px; }
  .subtitle { color: var(--muted); margin-bottom: 16px; font-size: 12px; }

  /* Status cards */
  .cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 12px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 10px; }
  .card-label { font-size: 10px; color: var(--muted); }
  .card-value { font-size: 16px; font-weight: 600; }

  /* Tabs — horizontal scroll on mobile */
  .tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 12px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .tabs::-webkit-scrollbar { display: none; }
  .tab { padding: 8px 14px; cursor: pointer; color: var(--muted); border-bottom: 2px solid transparent; font-size: 13px; white-space: nowrap; flex-shrink: 0; transition: all 0.15s; -webkit-tap-highlight-color: transparent; }
  .tab:hover, .tab:active { color: var(--text); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .panel { display: none; }
  .panel.active { display: block; }

  /* Chat */
  .chat-box { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px; min-height: 40vh; max-height: 55vh; overflow-y: auto; margin-bottom: 8px; -webkit-overflow-scrolling: touch; }
  .msg { margin-bottom: 10px; padding: 8px 10px; border-radius: 6px; font-size: 14px; line-height: 1.5; word-break: break-word; }
  .msg-user { background: #1f6feb22; border-left: 3px solid var(--accent); }
  .msg-assistant { background: #23862222; border-left: 3px solid var(--green); }
  .msg-system { background: #9e6a0322; border-left: 3px solid var(--yellow); color: var(--muted); font-size: 12px; }
  .msg-label { font-size: 10px; color: var(--muted); margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.5px; }
  .msg pre { background: #0d1117; border: 1px solid var(--border); border-radius: 4px; padding: 8px; overflow-x: auto; margin: 6px 0; font-size: 12px; }
  .msg code { font-family: 'Cascadia Code', 'Fira Code', monospace; font-size: 13px; }
  .msg p { margin: 4px 0; }
  .msg ul, .msg ol { margin: 4px 0 4px 20px; }
  .msg strong { color: var(--accent); }
  .msg img { max-width: 100%; border-radius: 6px; margin: 6px 0; }
  .msg audio, .msg video { max-width: 100%; margin: 6px 0; }

  /* Input area */
  .input-area { display: flex; flex-direction: column; gap: 6px; }
  .input-row { display: flex; gap: 6px; align-items: flex-end; }
  .input-row textarea { flex: 1; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; color: var(--text); padding: 10px; font-size: 14px; font-family: inherit; resize: none; min-height: 44px; max-height: 120px; }
  .input-row textarea:focus { outline: none; border-color: var(--accent); }
  .input-actions { display: flex; gap: 6px; align-items: center; }

  /* Attachments preview */
  .attachments { display: flex; gap: 6px; flex-wrap: wrap; }
  .attachment-item { position: relative; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 4px; display: flex; align-items: center; gap: 6px; font-size: 12px; }
  .attachment-item img { width: 40px; height: 40px; object-fit: cover; border-radius: 4px; }
  .attachment-item .remove-btn { cursor: pointer; color: var(--red); font-size: 14px; padding: 2px 4px; }

  button { background: #238636; color: #fff; border: none; border-radius: 6px; padding: 8px 14px; cursor: pointer; font-size: 14px; font-weight: 500; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
  button:hover { background: #2ea043; }
  button:active { transform: scale(0.97); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  button.secondary { background: var(--surface); border: 1px solid var(--border); color: var(--text); }
  button.icon-btn { background: var(--surface); border: 1px solid var(--border); padding: 8px 10px; font-size: 16px; line-height: 1; }

  /* Controls */
  .controls { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; flex-wrap: wrap; }
  .controls select { background: var(--surface); border: 1px solid var(--border); color: var(--text); border-radius: 6px; padding: 6px 8px; font-size: 13px; }
  .controls label { font-size: 12px; color: var(--muted); }

  /* File input hidden */
  .file-input { display: none; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 500; font-size: 11px; text-transform: uppercase; }

  pre { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 10px; overflow-x: auto; font-size: 12px; line-height: 1.4; }

  .loading { display: inline-block; width: 14px; height: 14px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Mobile responsive */
  @media (max-width: 600px) {
    .container { padding: 8px; }
    h1 { font-size: 18px; }
    .cards { grid-template-columns: repeat(2, 1fr); gap: 6px; }
    .card { padding: 8px; }
    .card-value { font-size: 14px; }
    .chat-box { min-height: 35vh; max-height: 50vh; padding: 8px; }
    .msg { font-size: 13px; padding: 6px 8px; }
    .controls { gap: 6px; }
    .controls select { padding: 5px 6px; font-size: 12px; }
    .tab { padding: 8px 10px; font-size: 12px; }
    pre { font-size: 11px; padding: 8px; }
    table { font-size: 12px; }
    th, td { padding: 6px; }
  }

  @media (max-width: 400px) {
    .cards { grid-template-columns: 1fr 1fr; }
    .controls label { display: none; }
  }
</style>
</head>
<body>
<div class="container">
  <h1>⚡ G2M</h1>
  <p class="subtitle">Gateway2Models — The Model Gateway for AI Agents</p>

  <div class="cards">
    <div class="card"><div class="card-label">Status</div><div class="card-value" id="statusVal">...</div></div>
    <div class="card"><div class="card-label">Active</div><div class="card-value" id="activeVal">—</div></div>
    <div class="card"><div class="card-label">Models</div><div class="card-value" id="modelsVal">—</div></div>
    <div class="card"><div class="card-label">Sessions</div><div class="card-value" id="sessionsVal">—</div></div>
  </div>

  <div class="tabs">
    <div class="tab active" data-tab="chat">💬 Chat</div>
    <div class="tab" data-tab="context">📁 Context</div>
    <div class="tab" data-tab="parallel">⚡ Parallel</div>
    <div class="tab" data-tab="models">🤖 Models</div>
    <div class="tab" data-tab="api">📖 API</div>
  </div>

  <!-- Chat -->
  <div class="panel active" id="panel-chat">
    <div class="controls">
      <select id="modelSelect">
        <option value="auto">auto</option>
        <option value="vscode-claude">vscode-claude</option>
        <option value="agency-claude">agency-claude</option>
        <option value="agency-copilot">agency-copilot</option>
        <option value="ollama">ollama</option>
      </select>
      <label>Stream</label><input type="checkbox" id="streamCheck" checked>
      <select id="effortSelect"><option value="">effort: auto</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="max">max</option></select>
      <button class="secondary" onclick="clearChat()" style="margin-left:auto">Clear</button>
    </div>
    <!-- Session switcher -->
    <div style="display:flex;gap:6px;margin-bottom:8px;align-items:center;flex-wrap:wrap">
      <select id="sessionSelect" style="flex:1;background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:5px 8px;font-size:12px">
        <option value="">Loading sessions...</option>
      </select>
      <button class="secondary" onclick="newSession()" style="font-size:12px;padding:5px 10px">+ New</button>
      <span id="sessionStatus" style="font-size:11px;color:var(--muted)"></span>
    </div>
    <div class="chat-box" id="chatBox"></div>
    <div class="attachments" id="attachments"></div>
    <div class="input-area">
      <div class="input-row">
        <input type="file" id="fileInput" class="file-input" accept="image/*,audio/*,video/*" multiple>
        <button class="icon-btn" onclick="document.getElementById('fileInput').click()" title="Attach image, audio, or video">📎</button>
        <textarea id="promptInput" placeholder="Type a message..." rows="1"></textarea>
        <button id="sendBtn" onclick="sendMessage()">Send</button>
      </div>
    </div>
  </div>

  <!-- Context -->
  <div class="panel" id="panel-context">
    <!-- Context Overview (auto-loaded) -->
    <div id="ctxOverview" style="margin-bottom:16px">
      <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        <button class="secondary" onclick="refreshContext()" style="font-size:12px">🔄 Refresh</button>
        <span style="color:var(--muted);font-size:12px;line-height:32px" id="ctxLastUpdate"></span>
      </div>

      <!-- Agents -->
      <details open style="margin-bottom:8px">
        <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--accent);padding:6px 0">🤖 Registered Agents</summary>
        <div id="ctxAgents" style="padding:4px 0;font-size:13px;color:var(--muted)">Loading...</div>
      </details>

      <!-- Context Sessions -->
      <details open style="margin-bottom:8px">
        <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--green);padding:6px 0">💬 Context Sessions</summary>
        <div id="ctxSessions" style="padding:4px 0;font-size:13px;color:var(--muted)">Loading...</div>
      </details>

      <!-- Memories -->
      <details open style="margin-bottom:8px">
        <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--yellow);padding:6px 0">🧠 Memories</summary>
        <div id="ctxMemories" style="padding:4px 0;font-size:13px;color:var(--muted)">Loading...</div>
      </details>

      <!-- Storage -->
      <details style="margin-bottom:8px">
        <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--muted);padding:6px 0">📦 Storage</summary>
        <div id="ctxStorage" style="padding:4px 0;font-size:13px;color:var(--muted)">Loading...</div>
      </details>

      <!-- Tools -->
      <details style="margin-bottom:8px">
        <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--muted);padding:6px 0">🔧 Registered Tools</summary>
        <div id="ctxTools" style="padding:4px 0;font-size:13px;color:var(--muted)">Loading...</div>
      </details>

      <!-- Router Stats -->
      <details style="margin-bottom:8px">
        <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--muted);padding:6px 0">📊 Router Stats</summary>
        <div id="ctxRouterStats" style="padding:4px 0;font-size:13px;color:var(--muted)">Loading...</div>
      </details>
    </div>

    <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:8px">
      <div style="font-size:12px;color:var(--muted);margin-bottom:6px">📁 File Browser</div>
      <div class="controls">
        <input type="text" id="ctxPath" style="flex:1;min-width:0" placeholder="Enter path...">
        <button onclick="listDir()">List</button>
        <button onclick="readCtxFile()">Read</button>
      </div>
      <pre id="ctxOutput" style="margin-top:8px;min-height:100px;max-height:40vh;overflow:auto"><code></code></pre>
    </div>
  </div>

  <!-- Parallel -->
  <div class="panel" id="panel-parallel">
    <p style="color:var(--muted);margin-bottom:8px;font-size:13px">Run multiple models in parallel:</p>
    <textarea id="parallelInput" style="width:100%;background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:10px;font-family:monospace;font-size:12px;min-height:120px;margin-bottom:8px">{
  "tasks": [
    { "model": "vscode-claude", "messages": [{"role":"user","content":"What is TypeScript?"}] },
    { "model": "ollama", "messages": [{"role":"user","content":"What is Rust?"}] }
  ],
  "concurrency": 2
}</textarea>
    <button onclick="runParallel()">Run</button>
    <pre id="parallelOutput" style="margin-top:8px;min-height:80px;max-height:50vh;overflow:auto"><code></code></pre>
  </div>

  <!-- Models -->
  <div class="panel" id="panel-models">
    <div style="overflow-x:auto"><table id="modelsTable"><thead><tr><th>ID</th><th>Backend</th><th>Description</th></tr></thead><tbody></tbody></table></div>
  </div>

  <!-- API -->
  <div class="panel" id="panel-api">
    <pre style="max-height:70vh;overflow:auto"><code>Base URL: http://&lt;host&gt;:5555

── Chat (OpenAI-compatible) ──
POST /v1/chat/completions
  model: auto | vscode-claude | agency-claude | agency-copilot | ollama
  messages: [{role, content}]  (content can be string or ContentPart[])
  stream: true/false
  x-effort: low | medium | high | max

── Multi-modal (images/audio in messages) ──
content: [
  {"type":"text","text":"Describe this image"},
  {"type":"image_url","image_url":{"url":"data:image/png;base64,..."}}
]

── Generation ──
POST /v1/images/generations   {prompt, size, n}
POST /v1/audio/speech         {text, voice, speed}
POST /v1/audio/transcriptions {audio (base64), model}
POST /v1/video/generations    {prompt, duration}  → async job
GET  /v1/video/generations/:id

── Context ──
POST /v1/context/read      {path, startLine, endLine}
POST /v1/context/list      {path, recursive, maxDepth}
POST /v1/context/load      {paths[], maxTotalSize}
POST /v1/context/discover  {path}
POST /v1/context/git-diff  {path, commits}

── Sessions ──
POST /v1/context/sessions          auto-attribute
GET  /v1/context/sessions
GET  /v1/context/sessions/:id
POST /v1/context/sessions/:id/messages

── Agents ──
POST /v1/agents/intake     register agent
POST /v1/agents/chat       thread-aware chat
GET  /v1/agents

── Storage ──
POST /v1/storage           {data (base64), filename}
GET  /v1/storage
GET  /v1/storage/:id       file content
GET  /v1/storage/stats

── Tools/Router ──
POST /v1/tools             register tool
GET  /v1/tools
GET  /v1/router/stats      analytics
GET  /v1/router/policy
GET  /v1/cache/stats
GET  /v1/lan/policy
</code></pre>
  </div>
</div>

<script>
// Tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
  });
});

// Auto-resize textarea
const promptInput = document.getElementById('promptInput');
promptInput.addEventListener('input', () => {
  promptInput.style.height = 'auto';
  promptInput.style.height = Math.min(promptInput.scrollHeight, 120) + 'px';
});

// Status
async function refreshStatus() {
  try {
    const h = await fetch('/health').then(r => r.json());
    document.getElementById('statusVal').textContent = h.status === 'ok' ? '🟢' : '🔴';
    document.getElementById('activeVal').textContent = h.activeRequests + '/' + h.maxConcurrency;
    const m = await fetch('/v1/models').then(r => r.json());
    document.getElementById('modelsVal').textContent = m.data.length;
    const tbody = document.querySelector('#modelsTable tbody');
    tbody.innerHTML = m.data.map(d => '<tr><td><code>' + d.id + '</code></td><td>' + d.meta.backend + '</td><td style="color:var(--muted)">' + (d.meta.description||'') + '</td></tr>').join('');
    try { const s = await fetch('/v1/sessions').then(r => r.json()); document.getElementById('sessionsVal').textContent = s.sessions.length; } catch {}
  } catch { document.getElementById('statusVal').textContent = '🔴'; }
}
refreshStatus(); setInterval(refreshStatus, 8000);

// Attachments
const pendingFiles = [];
const fileInput = document.getElementById('fileInput');
const attachmentsDiv = document.getElementById('attachments');

fileInput.addEventListener('change', () => {
  for (const file of fileInput.files) {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      const dataUrl = reader.result;
      pendingFiles.push({ name: file.name, type: file.type, base64, dataUrl });
      renderAttachments();
    };
    reader.readAsDataURL(file);
  }
  fileInput.value = '';
});

function renderAttachments() {
  attachmentsDiv.innerHTML = pendingFiles.map((f, i) => {
    let preview = '';
    if (f.type.startsWith('image/')) preview = '<img src="' + f.dataUrl + '">';
    else if (f.type.startsWith('audio/')) preview = '🎵';
    else if (f.type.startsWith('video/')) preview = '🎬';
    return '<div class="attachment-item">' + preview + '<span>' + f.name.slice(0,20) + '</span><span class="remove-btn" onclick="removeAttachment(' + i + ')">✕</span></div>';
  }).join('');
}

function removeAttachment(i) { pendingFiles.splice(i, 1); renderAttachments(); }

// Markdown rendering (basic)
function renderMd(text) {
  let h = escapeHtml(text);
  // Code blocks
  h = h.replace(/\`\`\`(\\w*?)\\n([\\s\\S]*?)\`\`\`/g, '<pre><code>$2</code></pre>');
  h = h.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
  // Bold
  h = h.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
  // Lists
  h = h.replace(/^- (.+)$/gm, '<li>$1</li>');
  h = h.replace(/(<li>.*<\\/li>)/s, '<ul>$1</ul>');
  // Line breaks
  h = h.replace(/\\n/g, '<br>');
  return h;
}

// ── Push Notifications ──
let notifPermission = 'default';
if ('Notification' in window) {
  notifPermission = Notification.permission;
  if (notifPermission !== 'granted' && notifPermission !== 'denied') {
    Notification.requestPermission().then(p => { notifPermission = p; });
  }
}

function sendNotification(title, body) {
  if (notifPermission !== 'granted') return;
  try {
    const n = new Notification(title, {
      body: (body||'').slice(0, 200),
      tag: 'g2m-response',
      renotify: true,
    });
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    n.onclick = () => { window.focus(); n.close(); };
  } catch {}
}

// ── Device Identity ──
function getDeviceName() {
  let name = localStorage.getItem('g2m_device_name');
  if (name) return name;
  // Auto-detect from user-agent
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) name = 'iPhone';
  else if (/iPad/.test(ua)) name = 'iPad';
  else if (/Android/.test(ua)) name = 'Android';
  else if (/Windows/.test(ua)) name = 'Windows PC';
  else if (/Mac/.test(ua)) name = 'Mac';
  else if (/Linux/.test(ua)) name = 'Linux';
  else name = 'Device';
  localStorage.setItem('g2m_device_name', name);
  return name;
}

function getDeviceIp() {
  // Will be filled from server response
  return localStorage.getItem('g2m_device_ip') || '?';
}

// ── Session Management (per device, saved in localStorage) ──
let currentSessionId = localStorage.getItem('g2m_current_session') || null;
const sessionSelect = document.getElementById('sessionSelect');

// Get or store session IDs for this device
function getDeviceSessionIds() {
  try { return JSON.parse(localStorage.getItem('g2m_session_ids') || '[]'); } catch { return []; }
}
function addDeviceSessionId(id) {
  const ids = getDeviceSessionIds();
  if (!ids.includes(id)) { ids.unshift(id); localStorage.setItem('g2m_session_ids', JSON.stringify(ids.slice(0, 50))); }
}

// Resilient fetch — retries on failure (handles phone sleep/wake)
async function resilientFetch(url, opts, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, opts);
      if (r.ok) return r;
      if (i === retries) return r;
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
}

// Auto-reconnect when page becomes visible (phone wakes up)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    loadSessions().catch(() => {});
    refreshStatus();
  }
});

async function loadSessions() {
  try {
    const deviceIds = getDeviceSessionIds();
    const res = await resilientFetch('/v1/context/sessions');
    const data = await res.json();
    const allSessions = data.sessions || [];

    // Match by stored IDs OR by device owner type
    const mySessions = allSessions.filter(s =>
      deviceIds.includes(s.id) || s.ownerType === 'device'
    ).sort((a, b) => b.updatedAt - a.updatedAt);

    if (mySessions.length > 0 && mySessions[0].meta?.ip) {
      localStorage.setItem('g2m_device_ip', mySessions[0].meta.ip);
    }

    sessionSelect.innerHTML = '';
    if (mySessions.length === 0) {
      sessionSelect.innerHTML = '<option value="">No sessions — tap + New</option>';
    } else {
      mySessions.forEach(s => {
        const ago = Math.round((Date.now() - s.updatedAt) / 60000);
        const agoStr = ago < 60 ? ago + 'm' : Math.round(ago / 60) + 'h';
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.title + ' (' + s.messageCount + ' msgs, ' + agoStr + ')';
        sessionSelect.appendChild(opt);
      });
    }

    if (currentSessionId && [...sessionSelect.options].some(o => o.value === currentSessionId)) {
      sessionSelect.value = currentSessionId;
    } else if (mySessions.length > 0) {
      currentSessionId = mySessions[0].id;
      sessionSelect.value = currentSessionId;
      localStorage.setItem('g2m_current_session', currentSessionId);
      await loadSessionMessages(currentSessionId);
    }
    updateSessionStatus();
  } catch {
    sessionSelect.innerHTML = '<option value="">Offline — tap + New to retry</option>';
  }
}

async function loadSessionMessages(sid) {
  if (!sid) return;
  chatBox.innerHTML = '';
  chatHistory.length = 0;
  sessionNamed = true; // existing session already has a name
  try {
    const res = await resilientFetch('/v1/context/sessions/' + sid);
    const data = await res.json();
    const msgs = data.messages || [];
    msgs.forEach(m => {
      chatHistory.push({ role: m.role, content: m.content });
      addMsg(m.role, m.content);
    });
    updateSessionStatus();
  } catch {}
}

sessionSelect.addEventListener('change', () => {
  currentSessionId = sessionSelect.value;
  localStorage.setItem('g2m_current_session', currentSessionId);
  if (currentSessionId) loadSessionMessages(currentSessionId);
});

async function newSession() {
  try {
    const deviceName = getDeviceName();
    const res = await resilientFetch('/v1/context/sessions', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({}),
    });
    const data = await res.json();
    currentSessionId = data.id;
    localStorage.setItem('g2m_current_session', currentSessionId);
    addDeviceSessionId(data.id);
    // Temp name until first message provides a real name
    await resilientFetch('/v1/context/sessions/' + data.id, {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ title: deviceName + ' · New chat' }),
    });
    chatBox.innerHTML = '';
    chatHistory.length = 0;
    await loadSessions();
    updateSessionStatus();
  } catch {}
}

async function ensureSession() {
  if (currentSessionId) return;
  try {
    const deviceName = getDeviceName();
    const res = await resilientFetch('/v1/context/sessions', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({}),
    });
    const data = await res.json();
    currentSessionId = data.id;
    localStorage.setItem('g2m_current_session', currentSessionId);
    addDeviceSessionId(data.id);
    await resilientFetch('/v1/context/sessions/' + data.id, {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ title: deviceName + ' · New chat' }),
    });
    await loadSessions();
  } catch {}
}

// Auto-name session based on first user message (short concise name)
let sessionNamed = false;
async function autoNameSession(text) {
  if (sessionNamed || !currentSessionId) return;
  if (chatHistory.filter(m => m.role === 'user').length > 1) return; // only on first msg
  sessionNamed = true;
  const deviceName = getDeviceName();
  // Create concise name: first 30 chars of first message
  const shortName = text.slice(0, 30).replace(/[\\n\\r]+/g, ' ').trim();
  const title = deviceName + ' · ' + (shortName || 'Chat');
  try {
    await resilientFetch('/v1/context/sessions/' + currentSessionId, {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ title }),
    });
    loadSessions(); // refresh dropdown
  } catch {}
}

function updateSessionStatus() {
  const el = document.getElementById('sessionStatus');
  const deviceName = getDeviceName();
  const ip = getDeviceIp();
  if (currentSessionId) {
    el.textContent = '📌 ' + deviceName + ' (' + ip + ') · ' + chatHistory.length + ' msgs';
  } else {
    el.textContent = '';
  }
}

async function persistMessage(role, content, model) {
  if (!currentSessionId) return;
  try {
    await resilientFetch('/v1/context/sessions/' + currentSessionId + '/messages', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ role, content: typeof content === 'string' ? content : JSON.stringify(content), model }),
    });
  } catch {}
}

// Load sessions on page load
loadSessions();

// Chat
const chatBox = document.getElementById('chatBox');
const chatHistory = [];

function addMsg(role, content, isHtml) {
  const labels = { user: 'You', assistant: 'Assistant', system: 'System' };
  const div = document.createElement('div');
  div.className = 'msg msg-' + role;
  const inner = isHtml ? content : (role === 'assistant' ? renderMd(content) : escapeHtml(content));
  div.innerHTML = '<div class="msg-label">' + (labels[role]||role) + '</div>' + inner;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function clearChat() { chatBox.innerHTML = ''; chatHistory.length = 0; pendingFiles.length = 0; renderAttachments(); sessionNamed = false; newSession(); }

async function sendMessage() {
  const text = promptInput.value.trim();
  if (!text && pendingFiles.length === 0) return;
  promptInput.value = '';
  promptInput.style.height = 'auto';
  await ensureSession();

  // Build content parts (multi-modal)
  let content;
  let displayHtml = '';

  if (pendingFiles.length > 0) {
    content = [];
    if (text) content.push({ type: 'text', text });
    for (const f of pendingFiles) {
      if (f.type.startsWith('image/')) {
        content.push({ type: 'image_url', image_url: { url: f.dataUrl } });
        displayHtml += '<img src="' + f.dataUrl + '" style="max-width:200px;border-radius:6px;margin:4px 0">';
      } else if (f.type.startsWith('audio/')) {
        content.push({ type: 'input_audio', input_audio: { data: f.base64, format: 'wav' } });
        displayHtml += '<div>🎵 ' + escapeHtml(f.name) + '</div>';
      } else {
        displayHtml += '<div>📎 ' + escapeHtml(f.name) + '</div>';
      }
    }
    if (text) displayHtml = escapeHtml(text) + '<br>' + displayHtml;
    pendingFiles.length = 0;
    renderAttachments();
  } else {
    content = text;
    displayHtml = escapeHtml(text);
  }

  chatHistory.push({ role: 'user', content });
  addMsg('user', displayHtml, true);
  persistMessage('user', content);
  autoNameSession(typeof content === 'string' ? content : 'Multi-modal chat');

  const model = document.getElementById('modelSelect').value;
  const stream = document.getElementById('streamCheck').checked;
  const effort = document.getElementById('effortSelect').value;
  const body = { model, messages: [...chatHistory], stream };
  if (effort) body['x-effort'] = effort;

  document.getElementById('sendBtn').disabled = true;

  if (stream) {
    const div = document.createElement('div');
    div.className = 'msg msg-assistant';
    div.innerHTML = '<div class="msg-label">Assistant</div><span class="loading"></span> <span style="font-size:11px;color:var(--muted)" id="thinkTimer">Thinking...</span>';
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    let full = '';
    const startT = Date.now();
    const timerEl = div.querySelector('#thinkTimer');
    const thinkInterval = setInterval(() => {
      const sec = Math.round((Date.now() - startT) / 1000);
      if (timerEl && !full) timerEl.textContent = 'Thinking... ' + sec + 's';
    }, 1000);
    try {
      const res = await fetch('/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const c = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content;
              if (c) { full += c; div.innerHTML = '<div class="msg-label">Assistant</div>' + renderMd(full); chatBox.scrollTop = chatBox.scrollHeight; }
            } catch {}
          }
        }
      }
    } catch(e) { full = full || '[Error: ' + e.message + ']'; }
    clearInterval(thinkInterval);
    div.innerHTML = '<div class="msg-label">Assistant</div>' + renderMd(full);
    chatHistory.push({ role: 'assistant', content: full });
    persistMessage('assistant', full, model);
    sendNotification('G2M — Response Ready', full);
    updateSessionStatus();
  } else {
    const div = document.createElement('div');
    div.className = 'msg msg-system';
    const startT = Date.now();
    div.innerHTML = '<span class="loading"></span> <span id="waitTimer">Processing...</span>';
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    const waitInterval = setInterval(() => {
      const sec = Math.round((Date.now() - startT) / 1000);
      const el = div.querySelector('#waitTimer');
      if (el) el.textContent = 'Processing... ' + sec + 's';
    }, 1000);
    try {
      const res = await fetch('/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json();
      clearInterval(waitInterval);
      div.remove();
      const c = j.choices?.[0]?.message?.content || j.error?.message || 'No response';
      addMsg('assistant', c);
      chatHistory.push({ role: 'assistant', content: c });
      persistMessage('assistant', c, model);
      sendNotification('G2M — Response Ready', c);
      if (j['x-routing']) addMsg('system', j['x-routing'].reason + ' (effort: ' + j['x-routing'].effort + ')');
    } catch(e) { clearInterval(waitInterval); div.remove(); addMsg('system', 'Error: ' + e.message); }
  }
  document.getElementById('sendBtn').disabled = false;
  updateSessionStatus();
}

promptInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// Context overview (auto-load persisted data)
async function refreshContext() {
  const el = (id) => document.getElementById(id);
  el('ctxLastUpdate').textContent = 'Updated: ' + new Date().toLocaleTimeString();

  // Agents
  try {
    const data = await fetch('/v1/agents').then(r => r.json());
    const agents = data.agents || [];
    if (agents.length === 0) {
      el('ctxAgents').innerHTML = '<span style="color:var(--muted)">No agents registered yet.</span>';
    } else {
      el('ctxAgents').innerHTML = agents.map(a => {
        const skills = (a.skills||[]).slice(0,5).map(s => '<span style="background:var(--border);padding:1px 6px;border-radius:10px;font-size:11px">' + s + '</span>').join(' ');
        return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:6px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<strong style="color:var(--accent)">' + a.name + '</strong>' +
          '<code style="font-size:11px;color:var(--muted)">' + a.agentId + '</code></div>' +
          (a.description ? '<div style="font-size:12px;margin:4px 0">' + a.description + '</div>' : '') +
          '<div style="margin-top:4px">' + skills + '</div>' +
          (a.workspace?.path ? '<div style="font-size:11px;color:var(--muted);margin-top:4px">📁 ' + a.workspace.path + '</div>' : '') +
          '</div>';
      }).join('');
    }
  } catch { el('ctxAgents').innerHTML = '<span style="color:var(--red)">Failed to load</span>'; }

  // Context Sessions
  try {
    const data = await fetch('/v1/context/sessions').then(r => r.json());
    const sessions = data.sessions || [];
    if (sessions.length === 0) {
      el('ctxSessions').innerHTML = '<span style="color:var(--muted)">No sessions yet.</span>';
    } else {
      el('ctxSessions').innerHTML = sessions.map(s => {
        const ago = Math.round((Date.now() - s.updatedAt) / 60000);
        const agoStr = ago < 60 ? ago + 'm ago' : Math.round(ago/60) + 'h ago';
        return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">' +
          '<div><strong>' + s.title + '</strong>' +
          '<div style="font-size:11px;color:var(--muted)">' + s.ownerType + ' · ' + s.messageCount + ' msgs · ' + s.state + '</div></div>' +
          '<span style="font-size:11px;color:var(--muted)">' + agoStr + '</span></div>';
      }).join('');
    }
  } catch { el('ctxSessions').innerHTML = '<span style="color:var(--red)">Failed to load</span>'; }

  // Memories
  try {
    const data = await fetch('/v1/memories').then(r => r.json());
    const memories = data.memories || [];
    if (memories.length === 0) {
      el('ctxMemories').innerHTML = '<span style="color:var(--muted)">No memories saved yet.</span>';
    } else {
      el('ctxMemories').innerHTML = memories.map(m => {
        const catColors = {profile:'#58a6ff',preferences:'#d29922',entities:'#3fb950',events:'#f85149',cases:'#bc8cff',patterns:'#79c0ff'};
        return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:6px">' +
          '<span style="background:' + (catColors[m.category]||'var(--muted)') + '22;color:' + (catColors[m.category]||'var(--muted)') + ';padding:1px 8px;border-radius:10px;font-size:11px;font-weight:500">' + m.category + '</span> ' +
          '<span style="font-size:11px;color:var(--muted)">' + m.scope + '</span>' +
          '<div style="margin-top:4px;font-size:13px">' + m.content + '</div></div>';
      }).join('');
    }
  } catch { el('ctxMemories').innerHTML = '<span style="color:var(--red)">Failed to load</span>'; }

  // Storage
  try {
    const data = await fetch('/v1/storage/stats').then(r => r.json());
    const files = await fetch('/v1/storage?limit=10').then(r => r.json());
    el('ctxStorage').innerHTML =
      '<div style="font-size:12px;margin-bottom:6px">Total: <strong>' + data.totalFiles + '</strong> files · <strong>' + (data.totalSize/1024).toFixed(1) + ' KB</strong></div>' +
      Object.entries(data.byCategory).filter(([,v]) => v.count > 0).map(([k,v]) =>
        '<span style="margin-right:8px">' + ({image:'🖼️',audio:'🎵',video:'🎬',document:'📄',other:'📎'}[k]||'📎') + ' ' + k + ': ' + v.count + '</span>'
      ).join('') +
      ((files.files||[]).length > 0 ? '<div style="margin-top:6px">' + files.files.map(f =>
        '<div style="font-size:12px;color:var(--muted)">· ' + f.filename + ' (' + (f.size/1024).toFixed(1) + 'KB) <a href="' + f.url + '" target="_blank" style="color:var(--accent)">view</a></div>'
      ).join('') + '</div>' : '');
  } catch { el('ctxStorage').innerHTML = '<span style="color:var(--red)">Failed to load</span>'; }

  // Tools
  try {
    const data = await fetch('/v1/tools').then(r => r.json());
    const tools = data.tools || [];
    if (tools.length === 0) {
      el('ctxTools').innerHTML = '<span style="color:var(--muted)">No tools registered.</span>';
    } else {
      el('ctxTools').innerHTML = tools.map(t =>
        '<div style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:6px">' +
        '<strong style="color:var(--accent)">' + t.name + '</strong> <span style="font-size:11px;color:var(--muted)">by ' + t.registeredBy + '</span>' +
        '<div style="font-size:12px;margin-top:2px">' + t.description + '</div></div>'
      ).join('');
    }
  } catch { el('ctxTools').innerHTML = '<span style="color:var(--red)">Failed to load</span>'; }

  // Router Stats
  try {
    const s = await fetch('/v1/router/stats').then(r => r.json());
    const backends = Object.entries(s.byBackend || {});
    el('ctxRouterStats').innerHTML =
      '<div style="font-size:12px;margin-bottom:4px">Total: <strong>' + s.totalRequests + '</strong> requests · Cost: <strong>$' + (s.totalEstimatedCost||0).toFixed(4) + '</strong></div>' +
      (backends.length > 0 ? backends.map(([k,v]) =>
        '<div style="font-size:12px;color:var(--muted)">· ' + k + ': ' + v.totalRequests + ' reqs, avg ' + Math.round(v.avgLatencyMs) + 'ms</div>'
      ).join('') : '<span style="color:var(--muted)">No requests yet.</span>');
  } catch { el('ctxRouterStats').innerHTML = '<span style="color:var(--red)">Failed to load</span>'; }
}

// Load context on first visit to tab
let ctxLoaded = false;
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.dataset.tab === 'context' && !ctxLoaded) { ctxLoaded = true; refreshContext(); }
  });
});

// File browser
async function listDir() {
  const path = document.getElementById('ctxPath').value;
  try {
    const r = await fetch('/v1/context/list', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({path, recursive: true, maxDepth: 2}) });
    document.getElementById('ctxOutput').querySelector('code').textContent = JSON.stringify(await r.json(), null, 2);
  } catch(e) { document.getElementById('ctxOutput').querySelector('code').textContent = 'Error: ' + e.message; }
}
async function readCtxFile() {
  const path = document.getElementById('ctxPath').value;
  try {
    const r = await fetch('/v1/context/read', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({path}) });
    document.getElementById('ctxOutput').querySelector('code').textContent = JSON.stringify(await r.json(), null, 2);
  } catch(e) { document.getElementById('ctxOutput').querySelector('code').textContent = 'Error: ' + e.message; }
}

// Parallel
async function runParallel() {
  try {
    const body = JSON.parse(document.getElementById('parallelInput').value);
    const r = await fetch('/v1/sessions/parallel', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    document.getElementById('parallelOutput').querySelector('code').textContent = JSON.stringify(await r.json(), null, 2);
    refreshStatus();
  } catch(e) { document.getElementById('parallelOutput').querySelector('code').textContent = 'Error: ' + e.message; }
}
</script>
</body>
</html>`;
