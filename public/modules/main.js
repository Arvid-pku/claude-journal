import { state, DEFAULTS, api, apiPost, apiPut, IC, setAfterRender, setOnSessionSelect,
  showModal, hideModal, renderMarkdown, escapeHtml, applySettings } from './state.js';
import { renderSidebar, loadSessions, renderSessionList, updateSidebarActive,
  hideContextMenu, renameSession, duplicateSession, moveSession, deleteSession, setupResize } from './sidebar.js';
import { processMessages, renderMessages, updateSessionInfo, updateStats, startEditing } from './messages.js';
import { renderRail, updateRailActive } from './rail.js';

// ── Wire callbacks ──────────────────────────────────────────────────────

setAfterRender(() => { renderRail(); });
setOnSessionSelect((projectId, sessionId) => loadSession(projectId, sessionId));

// ── Data loading ────────────────────────────────────────────────────────

async function loadProjects() {
  state.projects = await api('/api/projects');
  renderSidebar();
}

async function loadSession(projectId, sessionId) {
  state.currentProject = projectId;
  state.currentSession = sessionId;
  localStorage.setItem('lastSession', JSON.stringify({ projectId, sessionId }));
  state.favoritesOnly = false;
  state.subagentIndex = {};
  state.subagentMsgs = {};
  document.getElementById('btn-favorites').classList.remove('toggled');

  const [messages, annotations] = await Promise.all([
    api(`/api/messages/${encodeURIComponent(projectId)}/${encodeURIComponent(sessionId)}`),
    api(`/api/annotations/${encodeURIComponent(projectId)}/${encodeURIComponent(sessionId)}`),
  ]);

  state.rawMessages = messages;
  state.annotations = annotations;
  state.displayMessages = processMessages(messages);

  renderMessages();
  updateSessionInfo();
  updateSidebarActive();
  watchSession();
}

// ── WebSocket ───────────────────────────────────────────────────────────

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  state.ws = new WebSocket(`${proto}//${location.host}`);
  state.ws.onopen = () => {
    setStatus('connected', 'Connected');
    if (state.currentProject && state.currentSession && state.liveEnabled) watchSession();
  };
  state.ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'update') {
      const scrolled = isScrolledToBottom();
      state.rawMessages = msg.messages;
      state.displayMessages = processMessages(msg.messages);
      api(`/api/annotations/${encodeURIComponent(state.currentProject)}/${encodeURIComponent(state.currentSession)}`)
        .then(a => { state.annotations = a; renderMessages(); if (scrolled && state.settings.autoScrollLive) scrollToBottom(); });
    }
  };
  state.ws.onclose = () => { setStatus('', 'Disconnected'); setTimeout(connectWS, 3000); };
  state.ws.onerror = () => state.ws.close();
}

function watchSession() {
  if (!state.ws || state.ws.readyState !== 1) return;
  if (!state.liveEnabled) { state.ws.send(JSON.stringify({ type: 'unwatch' })); setStatus('connected', 'Connected'); return; }
  state.ws.send(JSON.stringify({ type: 'watch', project: state.currentProject, session: state.currentSession }));
  setStatus('watching', 'Watching');
}

function setStatus(cls, text) {
  document.querySelector('#status-connection .dot').className = `dot ${cls}`;
  document.getElementById('status-text').textContent = text;
}

// ── Annotations ─────────────────────────────────────────────────────────

async function setAnnotation(uuid, key, value) {
  state.annotations = await apiPost(
    `/api/annotations/${encodeURIComponent(state.currentProject)}/${encodeURIComponent(state.currentSession)}`,
    { uuid, key, value }
  );
  renderMessages();
}

// ── Memory Panel ────────────────────────────────────────────────────────

async function showMemory() {
  if (!state.currentProject) return;
  const key = state.currentProject;
  if (!state.memoryCache[key]) {
    try { state.memoryCache[key] = await api(`/api/memory/${encodeURIComponent(key)}`); } catch { state.memoryCache[key] = []; }
  }
  const files = state.memoryCache[key];
  const container = document.getElementById('memory-content');
  if (!files.length) { container.innerHTML = '<p style="color:var(--text-muted)">No memory files for this project</p>'; }
  else {
    container.innerHTML = files.map(f => `
      <div class="memory-file">
        <div class="memory-filename">${escapeHtml(f.filename)}</div>
        <div class="memory-body">${renderMarkdown(f.content)}</div>
      </div>
    `).join('');
  }
  showModal('memory-modal');
}

// ── Settings ────────────────────────────────────────────────────────────

const SETTING_FIELDS = [
  { id: 'setting-projects-dir',       key: 'projectsDir',         type: 'text' },
  { id: 'setting-auto-open',          key: 'autoOpen',            type: 'checkbox' },
  { id: 'setting-font-size',          key: 'fontSize',            type: 'select' },
  { id: 'setting-compact',            key: 'compactMode',         type: 'checkbox' },
  { id: 'setting-msg-width',          key: 'messageWidth',        type: 'number' },
  { id: 'setting-tokens',             key: 'showTokenUsage',      type: 'checkbox' },
  { id: 'setting-cost',               key: 'showCost',            type: 'checkbox' },
  { id: 'setting-thinking',           key: 'showThinking',        type: 'checkbox' },
  { id: 'setting-timestamps',         key: 'showTimestamps',      type: 'checkbox' },
  { id: 'setting-hide-tags',          key: 'hideSystemTags',      type: 'checkbox' },
  { id: 'setting-tool-expanded',      key: 'defaultToolExpanded', type: 'checkbox' },
  { id: 'setting-tool-max-output',    key: 'maxToolOutput',       type: 'number' },
  { id: 'setting-session-sort',       key: 'sessionSort',         type: 'select' },
  { id: 'setting-auto-scroll',        key: 'autoScrollLive',      type: 'checkbox' },
];

async function showSettings() {
  const s = await api('/api/settings');
  const merged = { ...DEFAULTS, ...s };
  for (const f of SETTING_FIELDS) {
    const el = document.getElementById(f.id);
    if (!el) continue;
    if (f.type === 'checkbox') el.checked = !!merged[f.key];
    else if (f.type === 'number') el.value = merged[f.key] ?? '';
    else el.value = merged[f.key] || '';
  }
  showModal('settings-modal');
}

async function saveSettings() {
  const payload = {};
  for (const f of SETTING_FIELDS) {
    const el = document.getElementById(f.id);
    if (!el) continue;
    if (f.type === 'checkbox') payload[f.key] = el.checked;
    else if (f.type === 'number') payload[f.key] = parseInt(el.value) || DEFAULTS[f.key];
    else payload[f.key] = el.value.trim() || DEFAULTS[f.key];
  }
  const saved = await apiPut('/api/settings', payload);
  state.settings = { ...DEFAULTS, ...saved };
  applySettings();
  hideModal('settings-modal');
  // Re-render to apply display settings
  if (state.displayMessages.length) renderMessages();
  // Re-sort sidebar sessions
  for (const [pid, sessions] of Object.entries(state.sessions)) {
    const c = document.querySelector(`.project-sessions[data-project="${pid}"]`);
    if (c) renderSessionList(pid, sessions, c);
  }
}

// ── Export ───────────────────────────────────────────────────────────────

function exportSession() {
  if (!state.displayMessages.length) return;
  let md = `# Claude Conversation\n\n`;
  const session = (state.sessions[state.currentProject] || []).find(s => s.sessionId === state.currentSession);
  if (session) md += `**Session:** ${session.customName || session.summary || state.currentSession}\n\n---\n\n`;
  for (const msg of state.displayMessages) {
    const time = formatTime(msg.timestamp);
    const anno = state.annotations[msg.uuid] || {};
    const star = anno.favorite ? ' \u2B50' : '';
    if (msg.role === 'user') md += `## You (${time})${star}\n\n${msg.content}\n\n`;
    else {
      md += `## Claude (${time})${star}\n\n`;
      for (const p of msg.parts) { if (p.type === 'text') md += `${p.content}\n\n`; else if (p.type === 'tool_use') md += `> **Tool: ${p.name}**\n\n`; }
      if (anno.note) md += `> **Note:** ${anno.note}\n\n`;
    }
    md += '---\n\n';
  }
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `claude-${state.currentSession?.slice(0, 8) || 'export'}.md`; a.click();
  URL.revokeObjectURL(url);
}

function formatTime(ts) { return ts ? new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''; }

// ── Events ──────────────────────────────────────────────────────────────

function setupEvents() {
  // Message actions (delegated)
  document.getElementById('messages').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, uuid } = btn.dataset;
    switch (action) {
      case 'favorite': setAnnotation(uuid, 'favorite', !(state.annotations[uuid]?.favorite)); break;
      case 'highlight': {
        const picker = document.getElementById('highlight-picker');
        const rect = btn.getBoundingClientRect();
        picker.style.top = `${rect.bottom + 4}px`; picker.style.left = `${rect.left}px`;
        picker.classList.remove('hidden'); picker.dataset.uuid = uuid; break;
      }
      case 'note': state.noteTarget = uuid; document.getElementById('note-text').value = state.annotations[uuid]?.note || ''; showModal('note-modal'); document.getElementById('note-text').focus(); break;
      case 'edit': startEditing(uuid); break;
      case 'copy': {
        const msg = state.displayMessages.find(m => m.uuid === uuid);
        if (!msg) break;
        const text = msg.role === 'user' ? msg.content : msg.parts.filter(p => p.type === 'text').map(p => p.content).join('\n\n');
        navigator.clipboard.writeText(text);
        btn.innerHTML = IC.check; setTimeout(() => btn.innerHTML = IC.copy, 1500); break;
      }
    }
  });

  // Highlight picker
  document.getElementById('highlight-picker').addEventListener('click', (e) => {
    const dot = e.target.closest('[data-color]');
    if (!dot) return;
    setAnnotation(document.getElementById('highlight-picker').dataset.uuid, 'highlight', dot.dataset.color || false);
    document.getElementById('highlight-picker').classList.add('hidden');
  });

  // Note save
  document.getElementById('note-save').addEventListener('click', () => {
    const text = document.getElementById('note-text').value.trim();
    if (state.noteTarget) setAnnotation(state.noteTarget, 'note', text || false);
    hideModal('note-modal'); state.noteTarget = null;
  });

  // Context menu actions
  document.getElementById('context-menu').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ctx]');
    if (!btn) return;
    ({ rename: renameSession, duplicate: duplicateSession, move: moveSession, delete: deleteSession })[btn.dataset.ctx]?.();
  });

  // Close popups on outside click
  document.addEventListener('click', (e) => {
    if (!document.getElementById('context-menu').classList.contains('hidden') && !e.target.closest('#context-menu,.session-menu-btn')) hideContextMenu();
    const picker = document.getElementById('highlight-picker');
    if (!picker.classList.contains('hidden') && !picker.contains(e.target) && !e.target.closest('[data-action="highlight"]')) picker.classList.add('hidden');
  });

  // Modal dismiss
  document.querySelectorAll('[data-dismiss]').forEach(el => el.addEventListener('click', () => hideModal(el.dataset.dismiss)));

  // Search
  document.getElementById('btn-search').addEventListener('click', () => {
    const box = document.getElementById('search-box'); box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) document.getElementById('message-search').focus();
    else { state.searchQuery = ''; renderMessages(); }
  });
  document.getElementById('btn-search-close').addEventListener('click', () => {
    document.getElementById('search-box').classList.add('hidden'); state.searchQuery = ''; document.getElementById('message-search').value = '';
    document.getElementById('search-count').textContent = ''; renderMessages();
  });
  document.getElementById('message-search').addEventListener('input', (e) => {
    state.searchQuery = e.target.value; renderMessages();
    document.getElementById('search-count').textContent = state.searchQuery ? `${document.getElementById('messages').querySelectorAll('.message').length} found` : '';
  });

  // Toolbar buttons
  document.getElementById('btn-favorites').addEventListener('click', () => { state.favoritesOnly = !state.favoritesOnly; document.getElementById('btn-favorites').classList.toggle('toggled', state.favoritesOnly); renderMessages(); });
  document.getElementById('btn-live').addEventListener('click', () => { state.liveEnabled = !state.liveEnabled; document.getElementById('btn-live').classList.toggle('active', state.liveEnabled); watchSession(); });
  document.getElementById('btn-export').addEventListener('click', exportSession);
  document.getElementById('btn-memory').addEventListener('click', showMemory);
  document.getElementById('btn-settings').addEventListener('click', showSettings);
  document.getElementById('settings-save').addEventListener('click', saveSettings);
  document.getElementById('btn-theme').addEventListener('click', () => {
    const html = document.documentElement; html.dataset.theme = html.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', html.dataset.theme);
  });
  document.getElementById('btn-sidebar-toggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('collapsed'));

  // Sidebar search
  document.getElementById('sidebar-search').addEventListener('input', () => {
    for (const [pid, sessions] of Object.entries(state.sessions)) {
      const c = document.querySelector(`.project-sessions[data-project="${pid}"]`);
      if (c) renderSessionList(pid, sessions, c);
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'f') { e.preventDefault(); document.getElementById('btn-search').click(); }
    if (e.ctrlKey && e.key === 'b') { e.preventDefault(); document.getElementById('sidebar').classList.toggle('collapsed'); }
    if (e.ctrlKey && e.key === 'e') { e.preventDefault(); exportSession(); }
    if (e.key === 'Escape') {
      hideContextMenu(); document.getElementById('highlight-picker').classList.add('hidden');
      ['note-modal', 'move-modal', 'delete-modal', 'memory-modal', 'settings-modal'].forEach(id => hideModal(id));
      const box = document.getElementById('search-box');
      if (!box.classList.contains('hidden')) { box.classList.add('hidden'); state.searchQuery = ''; document.getElementById('message-search').value = ''; renderMessages(); }
    }
  });

  // Scroll tracking for rail
  document.getElementById('messages').addEventListener('scroll', updateRailActive, { passive: true });

  setupResize();
}

// ── Helpers ─────────────────────────────────────────────────────────────

function isScrolledToBottom() { const el = document.getElementById('messages'); return el.scrollHeight - el.scrollTop - el.clientHeight < 100; }
function scrollToBottom() { document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight; }

// ── Init ────────────────────────────────────────────────────────────────

(async () => {
  const saved = localStorage.getItem('theme');
  if (saved) document.documentElement.dataset.theme = saved;
  // Load settings
  try {
    const s = await api('/api/settings');
    state.settings = { ...DEFAULTS, ...s };
    applySettings();
  } catch {}
  setupEvents();
  connectWS();
  await loadProjects();
  // Restore last viewed session
  try {
    const last = JSON.parse(localStorage.getItem('lastSession'));
    if (last?.projectId && last?.sessionId) {
      // Expand the project in sidebar
      const header = document.querySelector(`.project-header[data-project="${last.projectId}"]`);
      if (header && header.classList.contains('collapsed')) {
        header.classList.remove('collapsed');
        const container = header.nextElementSibling;
        const sessions = await loadSessions(last.projectId);
        renderSessionList(last.projectId, sessions, container);
      }
      await loadSession(last.projectId, last.sessionId);
    }
  } catch {}
})();
