/** Inline HTML for the web UI — no external dependencies */
export const UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Gateway2Models</title>
<style>
  :root { --bg: #0d1117; --surface: #161b22; --border: #30363d; --text: #e6edf3; --muted: #8b949e; --accent: #58a6ff; --green: #3fb950; --red: #f85149; --yellow: #d29922; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
  .container { max-width: 960px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 24px; margin-bottom: 4px; }
  .subtitle { color: var(--muted); margin-bottom: 24px; font-size: 14px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 500; }
  .badge-green { background: #238636; color: #fff; }
  .badge-blue { background: #1f6feb; color: #fff; }
  .badge-yellow { background: #9e6a03; color: #fff; }

  /* Tabs */
  .tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 20px; }
  .tab { padding: 10px 20px; cursor: pointer; color: var(--muted); border-bottom: 2px solid transparent; font-size: 14px; transition: all 0.15s; }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .panel { display: none; }
  .panel.active { display: block; }

  /* Chat */
  .chat-box { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; min-height: 300px; max-height: 500px; overflow-y: auto; margin-bottom: 12px; }
  .msg { margin-bottom: 12px; padding: 8px 12px; border-radius: 6px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
  .msg-user { background: #1f6feb22; border-left: 3px solid var(--accent); }
  .msg-assistant { background: #23862222; border-left: 3px solid var(--green); }
  .msg-system { background: #9e6a0322; border-left: 3px solid var(--yellow); color: var(--muted); font-size: 12px; }
  .msg-label { font-size: 11px; color: var(--muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .input-row { display: flex; gap: 8px; }
  .input-row textarea { flex: 1; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; color: var(--text); padding: 10px; font-size: 14px; font-family: inherit; resize: vertical; min-height: 60px; }
  .input-row textarea:focus { outline: none; border-color: var(--accent); }
  button { background: #238636; color: #fff; border: none; border-radius: 6px; padding: 8px 16px; cursor: pointer; font-size: 14px; font-weight: 500; transition: background 0.15s; }
  button:hover { background: #2ea043; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  button.secondary { background: var(--surface); border: 1px solid var(--border); color: var(--text); }
  button.secondary:hover { background: #21262d; }

  /* Controls row */
  .controls { display: flex; gap: 12px; margin-bottom: 12px; align-items: center; flex-wrap: wrap; }
  .controls select, .controls input { background: var(--surface); border: 1px solid var(--border); color: var(--text); border-radius: 6px; padding: 6px 10px; font-size: 13px; }
  .controls label { font-size: 13px; color: var(--muted); }

  /* Models table */
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 500; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }

  /* JSON viewer */
  pre { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 12px; overflow-x: auto; font-size: 13px; line-height: 1.5; }
  code { font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace; }

  /* Status cards */
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
  .card-label { font-size: 12px; color: var(--muted); margin-bottom: 4px; }
  .card-value { font-size: 20px; font-weight: 600; }

  .loading { display: inline-block; width: 16px; height: 16px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div class="container">
  <h1>⚡ Gateway2Models</h1>
  <p class="subtitle">Local AI Model Gateway — Agentware for multi-model orchestration</p>

  <div class="cards" id="statusCards">
    <div class="card"><div class="card-label">Status</div><div class="card-value" id="statusVal">Loading...</div></div>
    <div class="card"><div class="card-label">Active Requests</div><div class="card-value" id="activeVal">—</div></div>
    <div class="card"><div class="card-label">Models Available</div><div class="card-value" id="modelsVal">—</div></div>
    <div class="card"><div class="card-label">Sessions Run</div><div class="card-value" id="sessionsVal">—</div></div>
  </div>

  <div class="tabs">
    <div class="tab active" data-tab="chat">Chat</div>
    <div class="tab" data-tab="context">File Context</div>
    <div class="tab" data-tab="parallel">Parallel Sessions</div>
    <div class="tab" data-tab="models">Models</div>
    <div class="tab" data-tab="api">API Reference</div>
  </div>

  <!-- Chat panel -->
  <div class="panel active" id="panel-chat">
    <div class="controls">
      <label>Model:</label>
      <select id="modelSelect"><option value="auto">auto</option><option value="vscode-claude">vscode-claude</option><option value="agency-claude">agency-claude</option><option value="agency-copilot">agency-copilot</option></select>
      <label>Stream:</label>
      <input type="checkbox" id="streamCheck" checked>
      <label>Effort:</label>
      <select id="effortSelect"><option value="">auto</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="max">max</option></select>
      <button class="secondary" onclick="clearChat()">Clear</button>
    </div>
    <div class="chat-box" id="chatBox"></div>
    <div class="input-row">
      <textarea id="promptInput" placeholder="Type your message..." rows="2"></textarea>
      <button id="sendBtn" onclick="sendMessage()">Send</button>
    </div>
  </div>

  <!-- File context panel -->
  <div class="panel" id="panel-context">
    <div class="controls">
      <label>Path:</label>
      <input type="text" id="ctxPath" style="flex:1;min-width:300px" placeholder="C:\\Users\\...\\project">
      <button onclick="listDir()">List Dir</button>
      <button onclick="readCtxFile()">Read File</button>
    </div>
    <pre id="ctxOutput" style="margin-top:12px;min-height:200px"><code>Results will appear here...</code></pre>
  </div>

  <!-- Parallel sessions panel -->
  <div class="panel" id="panel-parallel">
    <p style="color:var(--muted);margin-bottom:12px;font-size:14px">Run multiple model requests in parallel. Define tasks as JSON.</p>
    <textarea id="parallelInput" style="width:100%;background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:12px;font-family:monospace;font-size:13px;min-height:150px;margin-bottom:12px">{
  "tasks": [
    { "model": "vscode-claude", "messages": [{"role":"user","content":"What is TypeScript?"}] },
    { "model": "agency-claude", "messages": [{"role":"user","content":"What is Rust?"}] }
  ],
  "concurrency": 2
}</textarea>
    <button onclick="runParallel()">Run Parallel</button>
    <pre id="parallelOutput" style="margin-top:12px;min-height:100px"><code>Results will appear here...</code></pre>
  </div>

  <!-- Models panel -->
  <div class="panel" id="panel-models">
    <table id="modelsTable"><thead><tr><th>Model ID</th><th>Backend</th><th>Description</th></tr></thead><tbody></tbody></table>
  </div>

  <!-- API Reference panel -->
  <div class="panel" id="panel-api">
    <h2 style="margin-bottom:16px;font-size:18px">Agent Usage Guide</h2>
    <pre><code>## Base URL: http://127.0.0.1:5555

## Chat Completions (OpenAI-compatible)
POST /v1/chat/completions
{
  "model": "auto",           // auto | vscode-claude | agency-claude | agency-copilot
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": true,            // SSE streaming
  "x-effort": "high"         // optional: low | medium | high | max
}

## Load File Context (read files from any directory)
POST /v1/context/read
{ "path": "C:\\\\path\\\\to\\\\file.ts", "startLine": 1, "endLine": 50 }

POST /v1/context/list
{ "path": "C:\\\\path\\\\to\\\\project", "recursive": true, "maxDepth": 3 }

POST /v1/context/glob
{ "directory": "C:\\\\path\\\\to\\\\project", "extensions": [".ts", ".js"] }

POST /v1/context/load
{ "paths": ["C:\\\\project1\\\\src", "C:\\\\project2\\\\main.py"], "maxTotalSize": 500000 }

## Parallel Sessions (multiple model requests simultaneously)
POST /v1/sessions/parallel
{
  "tasks": [
    { "model": "vscode-claude", "messages": [{"role":"user","content":"Q1"}] },
    { "model": "agency-claude", "messages": [{"role":"user","content":"Q2"}] }
  ],
  "concurrency": 3
}

GET /v1/sessions           — list all sessions
GET /v1/sessions/:id       — get session details

## Models
GET /v1/models             — list available models

## Health
GET /health                — server status
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

  // Status polling
  async function refreshStatus() {
    try {
      const h = await fetch('/health').then(r => r.json());
      document.getElementById('statusVal').textContent = h.status === 'ok' ? '🟢 Online' : '🔴 Error';
      document.getElementById('activeVal').textContent = h.activeRequests + ' / ' + h.maxConcurrency;
      const m = await fetch('/v1/models').then(r => r.json());
      document.getElementById('modelsVal').textContent = m.data.length;
      // Models table
      const tbody = document.querySelector('#modelsTable tbody');
      tbody.innerHTML = m.data.map(d => '<tr><td><code>' + d.id + '</code></td><td><span class="badge badge-blue">' + d.meta.backend + '</span></td><td>' + (d.meta.description||'') + '</td></tr>').join('');
      const s = await fetch('/v1/sessions').then(r => r.json());
      document.getElementById('sessionsVal').textContent = s.sessions.length;
    } catch(e) { document.getElementById('statusVal').textContent = '🔴 Offline'; }
  }
  refreshStatus(); setInterval(refreshStatus, 5000);

  // Chat
  const chatBox = document.getElementById('chatBox');
  const chatHistory = [];

  function addMsg(role, content) {
    const labels = { user: 'You', assistant: 'Assistant', system: 'System' };
    const div = document.createElement('div');
    div.className = 'msg msg-' + role;
    div.innerHTML = '<div class="msg-label">' + (labels[role]||role) + '</div>' + escapeHtml(content);
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  function escapeHtml(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

  function clearChat() { chatBox.innerHTML = ''; chatHistory.length = 0; }

  async function sendMessage() {
    const input = document.getElementById('promptInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    chatHistory.push({ role: 'user', content: text });
    addMsg('user', text);

    const model = document.getElementById('modelSelect').value;
    const stream = document.getElementById('streamCheck').checked;
    const effort = document.getElementById('effortSelect').value;
    const body = { model, messages: [...chatHistory], stream };
    if (effort) body['x-effort'] = effort;

    document.getElementById('sendBtn').disabled = true;

    if (stream) {
      const assistantDiv = document.createElement('div');
      assistantDiv.className = 'msg msg-assistant';
      assistantDiv.innerHTML = '<div class="msg-label">Assistant</div><span class="loading"></span>';
      chatBox.appendChild(assistantDiv);
      chatBox.scrollTop = chatBox.scrollHeight;
      let fullText = '';
      try {
        const res = await fetch('/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          for (const line of chunk.split('\\n')) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const j = JSON.parse(line.slice(6));
                const c = j.choices?.[0]?.delta?.content;
                if (c) { fullText += c; assistantDiv.innerHTML = '<div class="msg-label">Assistant</div>' + escapeHtml(fullText); chatBox.scrollTop = chatBox.scrollHeight; }
              } catch {}
            }
          }
        }
      } catch(e) { fullText = '[Error: ' + e.message + ']'; }
      assistantDiv.innerHTML = '<div class="msg-label">Assistant</div>' + escapeHtml(fullText);
      chatHistory.push({ role: 'assistant', content: fullText });
    } else {
      addMsg('system', 'Processing...');
      try {
        const res = await fetch('/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await res.json();
        chatBox.lastChild.remove(); // remove "Processing..."
        const content = j.choices?.[0]?.message?.content || j.error?.message || 'No response';
        addMsg('assistant', content);
        chatHistory.push({ role: 'assistant', content });
        if (j['x-routing']) addMsg('system', 'Routing: ' + j['x-routing'].reason + ' (effort: ' + j['x-routing'].effort + ')');
      } catch(e) { chatBox.lastChild.remove(); addMsg('system', 'Error: ' + e.message); }
    }
    document.getElementById('sendBtn').disabled = false;
  }

  document.getElementById('promptInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  // Context
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
