import { state, DEFAULTS, api, apiPost, apiPut, apiDelete, IC, setAfterRender, setOnSessionSelect,
  showModal, hideModal, renderMarkdown, escapeHtml, applySettings } from './state.js';
import { renderSidebar, loadSessions, renderSessionList, updateSidebarActive,
  hideContextMenu, renameSession, duplicateSession, moveSession, deleteSession, setupResize } from './sidebar.js';
import { processMessages, renderMessages, updateSessionInfo, updateStats, startEditing } from './messages.js';
import { renderRail, updateRailActive } from './rail.js';
import { toggleNotesPanel, renderNotesPanel } from './notes.js';
import { toast, loading } from './toast.js';
import { getRoute, navigate, onRouteChange } from './router.js';
import { openSearch, closeSearch, setupSearch, setSearchNavigate } from './search.js';
import { showAnalytics } from './analytics.js';

// ── Wire callbacks ──────────────────────────────────────────────────────

setAfterRender(() => { renderRail(); renderNotesPanel(); });
window.__notesPanel = { toggleNotesPanel };
setOnSessionSelect((pid, sid) => { navigate('session', { projectId: pid, sessionId: sid }); loadSession(pid, sid); });
setSearchNavigate((pid, sid, uuid) => {
  loadSession(pid, sid).then(() => {
    if (uuid) setTimeout(() => {
      const el = document.querySelector(`.message[data-uuid="${uuid}"]`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.querySelector('.message-inner')?.classList.add('flash'); }
    }, 300);
  });
});

// ── Data loading ────────────────────────────────────────────────────────

async function loadProjects() {
  state.projects = await api('/api/projects');
  renderSidebar();
}

async function loadSession(projectId, sessionId) {
  state.currentProject = projectId;
  state.currentSession = sessionId;
  state.favoritesOnly = false;
  state.subagentIndex = {};
  state.subagentMsgs = {};
  document.getElementById('btn-favorites').classList.remove('toggled');
  localStorage.setItem('lastSession', JSON.stringify({ projectId, sessionId }));

  const done = loading('Loading session...');
  try {
    // Ensure sessions are loaded for sidebar
    if (!state.sessions[projectId]) {
      await loadSessions(projectId);
      const container = document.querySelector(`.project-sessions[data-project="${projectId}"]`);
      const header = document.querySelector(`.project-header[data-project="${projectId}"]`);
      if (header?.classList.contains('collapsed')) header.classList.remove('collapsed');
      if (container) renderSessionList(projectId, state.sessions[projectId], container);
    }

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
  } catch (err) {
    toast(`Failed to load session: ${err.message}`, 'error');
  } finally { done(); }
}

// ── Routing ─────────────────────────────────────────────────────────────

async function handleRoute(route) {
  if (!route) return;
  if (route.page === 'session') {
    await loadSession(route.projectId, route.sessionId);
  } else if (route.page === 'analytics') {
    await showAnalytics(route.projectId);
  } else if (route.page === 'search') {
    openSearch(route.query);
  }
}

onRouteChange(handleRoute);

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
  try {
    state.annotations = await apiPost(
      `/api/annotations/${encodeURIComponent(state.currentProject)}/${encodeURIComponent(state.currentSession)}`,
      { uuid, key, value }
    );
    renderMessages();
  } catch (err) { toast(`Failed: ${err.message}`, 'error'); }
}

// ── Memory ──────────────────────────────────────────────────────────────

async function showMemory() {
  if (!state.currentProject) { toast('Select a session first', 'error'); return; }
  const key = state.currentProject;
  if (!state.memoryCache[key]) {
    try { state.memoryCache[key] = await api(`/api/memory/${encodeURIComponent(key)}`); } catch { state.memoryCache[key] = []; }
  }
  const files = state.memoryCache[key];
  const c = document.getElementById('memory-content');
  c.innerHTML = !files.length ? '<p style="color:var(--text-muted)">No memory files</p>'
    : files.map(f => `<div class="memory-file"><div class="memory-filename">${escapeHtml(f.filename)}</div><div class="memory-body">${renderMarkdown(f.content)}</div></div>`).join('');
  showModal('memory-modal');
}

// ── Settings ────────────────────────────────────────────────────────────

const SETTING_FIELDS = [
  { id: 'setting-projects-dir', key: 'projectsDir', type: 'text' },
  { id: 'setting-auto-open', key: 'autoOpen', type: 'checkbox' },
  { id: 'setting-font-size', key: 'fontSize', type: 'select' },
  { id: 'setting-compact', key: 'compactMode', type: 'checkbox' },
  { id: 'setting-msg-width', key: 'messageWidth', type: 'number' },
  { id: 'setting-tokens', key: 'showTokenUsage', type: 'checkbox' },
  { id: 'setting-cost', key: 'showCost', type: 'checkbox' },
  { id: 'setting-thinking', key: 'showThinking', type: 'checkbox' },
  { id: 'setting-timestamps', key: 'showTimestamps', type: 'checkbox' },
  { id: 'setting-hide-tags', key: 'hideSystemTags', type: 'checkbox' },
  { id: 'setting-tool-expanded', key: 'defaultToolExpanded', type: 'checkbox' },
  { id: 'setting-tool-max-output', key: 'maxToolOutput', type: 'number' },
  { id: 'setting-session-sort', key: 'sessionSort', type: 'select' },
  { id: 'setting-auto-scroll', key: 'autoScrollLive', type: 'checkbox' },
];

async function showSettings() {
  const s = { ...DEFAULTS, ...(await api('/api/settings')) };
  for (const f of SETTING_FIELDS) {
    const el = document.getElementById(f.id);
    if (!el) continue;
    if (f.type === 'checkbox') el.checked = !!s[f.key];
    else if (f.type === 'number') el.value = s[f.key] ?? '';
    else el.value = s[f.key] || '';
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
  try {
    const saved = await apiPut('/api/settings', payload);
    state.settings = { ...DEFAULTS, ...saved };
    applySettings();
    hideModal('settings-modal');
    if (state.displayMessages.length) renderMessages();
    for (const [pid, sessions] of Object.entries(state.sessions)) {
      const c = document.querySelector(`.project-sessions[data-project="${pid}"]`);
      if (c) renderSessionList(pid, sessions, c);
    }
    toast('Settings saved', 'success');
  } catch (err) { toast(`Failed: ${err.message}`, 'error'); }
}

// ── Sidebar Tabs (Starred / Notes) ──────────────────────────────────────

async function switchSidebarTab(tab) {
  document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('project-list').classList.toggle('hidden', tab !== 'sessions');
  document.getElementById('sidebar-starred').classList.toggle('hidden', tab !== 'starred');
  document.getElementById('sidebar-notes').classList.toggle('hidden', tab !== 'notes');

  if (tab === 'starred') {
    const el = document.getElementById('sidebar-starred');
    el.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:12px">Loading...</div>';
    try {
      const items = await api('/api/bookmarks?type=favorites');
      if (!items.length) { el.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:12px">No starred messages</div>'; return; }
      el.innerHTML = items.map(item => `
        <div class="bookmark-item" data-project="${escapeHtml(item.project)}" data-session="${item.session}" data-uuid="${item.uuid}">
          <div class="bookmark-header">
            <span class="bookmark-role ${item.role}">${item.role === 'user' ? 'You' : 'Claude'}</span>
            <span class="bookmark-session">${escapeHtml(item.sessionName)}</span>
            <span class="bookmark-time">${item.ts ? new Date(item.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
          </div>
          <div class="bookmark-text">${escapeHtml(item.text.slice(0, 120))}</div>
        </div>
      `).join('');
      el.querySelectorAll('.bookmark-item').forEach(bi => bi.addEventListener('click', () => {
        navigate('session', { projectId: bi.dataset.project, sessionId: bi.dataset.session });
        loadSession(bi.dataset.project, bi.dataset.session).then(() => {
          setTimeout(() => {
            const msg = document.querySelector(`.message[data-uuid="${bi.dataset.uuid}"]`);
            if (msg) { msg.scrollIntoView({ behavior: 'smooth', block: 'center' }); msg.querySelector('.message-inner')?.classList.add('flash'); }
          }, 300);
        });
      }));
    } catch { el.innerHTML = '<div style="padding:16px;color:var(--red);font-size:12px">Failed to load</div>'; }
  }

  if (tab === 'notes') {
    const el = document.getElementById('sidebar-notes');
    el.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:12px">Loading...</div>';
    try {
      const items = await api('/api/bookmarks?type=notes');
      if (!items.length) { el.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:12px">No sessions with notes</div>'; return; }
      el.innerHTML = items.map(item => `
        <div class="bookmark-item" data-project="${escapeHtml(item.project)}" data-session="${item.session}">
          <div class="bookmark-header">
            <span class="bookmark-session">${escapeHtml(item.sessionName)}</span>
          </div>
          <div class="bookmark-meta">
            ${item.hasSessionNote ? '<span>Has session note</span>' : ''}
            ${item.colorNoteCount ? `<span>${item.colorNoteCount} highlight note${item.colorNoteCount > 1 ? 's' : ''}</span>` : ''}
          </div>
        </div>
      `).join('');
      el.querySelectorAll('.bookmark-item').forEach(bi => bi.addEventListener('click', () => {
        navigate('session', { projectId: bi.dataset.project, sessionId: bi.dataset.session });
        loadSession(bi.dataset.project, bi.dataset.session);
      }));
    } catch { el.innerHTML = '<div style="padding:16px;color:var(--red);font-size:12px">Failed to load</div>'; }
  }
}

// ── Export ───────────────────────────────────────────────────────────────

function exportSession() {
  if (!state.displayMessages.length) return;
  let md = '# Claude Conversation\n\n';
  const session = (state.sessions[state.currentProject] || []).find(s => s.sessionId === state.currentSession);
  if (session) md += `**Session:** ${session.customName || session.summary || state.currentSession}\n\n---\n\n`;
  for (const msg of state.displayMessages) {
    const time = formatTime(msg.timestamp);
    const anno = state.annotations[msg.uuid] || {};
    if (msg.role === 'user') md += `## You (${time})${anno.favorite ? ' \u2B50' : ''}\n\n${msg.content}\n\n`;
    else {
      md += `## Claude (${time})${anno.favorite ? ' \u2B50' : ''}\n\n`;
      for (const p of msg.parts) { if (p.type === 'text') md += `${p.content}\n\n`; else if (p.type === 'tool_use') md += `> **Tool: ${p.name}**\n\n`; }
      if (anno.note) md += `> **Note:** ${anno.note}\n\n`;
    }
    md += '---\n\n';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
  a.download = `claude-${state.currentSession?.slice(0, 8) || 'export'}.md`;
  a.click();
  toast('Exported', 'success');
}

function formatTime(ts) { return ts ? new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''; }

// ── Keyboard Navigation ─────────────────────────────────────────────────

let kbFocusIdx = -1;

function kbNav(dir) {
  const msgs = document.querySelectorAll('#messages .message');
  if (!msgs.length) return;
  msgs.forEach(m => m.classList.remove('keyboard-focus'));
  kbFocusIdx = Math.max(0, Math.min(msgs.length - 1, kbFocusIdx + dir));
  msgs[kbFocusIdx].classList.add('keyboard-focus');
  msgs[kbFocusIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function kbTurn(dir) {
  const msgs = [...document.querySelectorAll('#messages .message')];
  if (!msgs.length) return;
  const userIdxs = msgs.map((m, i) => m.classList.contains('user-msg') ? i : -1).filter(i => i >= 0);
  if (!userIdxs.length) return;
  let target;
  if (dir > 0) target = userIdxs.find(i => i > kbFocusIdx) ?? userIdxs[userIdxs.length - 1];
  else target = [...userIdxs].reverse().find(i => i < kbFocusIdx) ?? userIdxs[0];
  msgs.forEach(m => m.classList.remove('keyboard-focus'));
  kbFocusIdx = target;
  msgs[kbFocusIdx].classList.add('keyboard-focus');
  msgs[kbFocusIdx].scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Events ──────────────────────────────────────────────────────────────

function setupEvents() {
  // Message actions
  document.getElementById('messages').addEventListener('click', async (e) => {
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
        btn.innerHTML = IC.check; setTimeout(() => btn.innerHTML = IC.copy, 1500);
        toast('Copied', 'success', 1500); break;
      }
      case 'delete': {
        if (!confirm('Delete this message from the JSONL file?')) break;
        try {
          await apiDelete(`/api/messages/${encodeURIComponent(state.currentProject)}/${encodeURIComponent(state.currentSession)}/${encodeURIComponent(uuid)}`);
          state.displayMessages = state.displayMessages.filter(m => m.uuid !== uuid);
          renderMessages();
          toast('Message deleted', 'success');
        } catch (err) { toast(`Delete failed: ${err.message}`, 'error'); }
        break;
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
    if (state.noteTarget) setAnnotation(state.noteTarget, 'note', document.getElementById('note-text').value.trim() || false);
    hideModal('note-modal'); state.noteTarget = null;
  });

  // Context menu
  document.getElementById('context-menu').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ctx]');
    if (btn) ({ rename: renameSession, duplicate: duplicateSession, move: moveSession, delete: deleteSession })[btn.dataset.ctx]?.();
  });

  // Close popups
  document.addEventListener('click', (e) => {
    if (!document.getElementById('context-menu').classList.contains('hidden') && !e.target.closest('#context-menu,.session-menu-btn')) hideContextMenu();
    const picker = document.getElementById('highlight-picker');
    if (!picker.classList.contains('hidden') && !picker.contains(e.target) && !e.target.closest('[data-action="highlight"]')) picker.classList.add('hidden');
  });

  // Modal dismiss
  document.querySelectorAll('[data-dismiss]').forEach(el => el.addEventListener('click', () => hideModal(el.dataset.dismiss)));

  // In-conversation search
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

  // Toolbar
  document.getElementById('btn-favorites').addEventListener('click', () => { state.favoritesOnly = !state.favoritesOnly; document.getElementById('btn-favorites').classList.toggle('toggled', state.favoritesOnly); renderMessages(); });
  document.getElementById('btn-live').addEventListener('click', () => { state.liveEnabled = !state.liveEnabled; document.getElementById('btn-live').classList.toggle('active', state.liveEnabled); watchSession(); });
  document.getElementById('btn-export').addEventListener('click', exportSession);
  document.getElementById('btn-notes').addEventListener('click', toggleNotesPanel);
  document.getElementById('btn-memory').addEventListener('click', showMemory);
  document.getElementById('btn-analytics').addEventListener('click', () => {
    const pid = state.currentProject || null;
    navigate('analytics', { projectId: pid });
    showAnalytics(pid);
  });
  document.getElementById('btn-settings').addEventListener('click', showSettings);
  document.getElementById('settings-save').addEventListener('click', saveSettings);
  document.getElementById('btn-theme').addEventListener('click', () => {
    const html = document.documentElement; html.dataset.theme = html.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', html.dataset.theme);
  });
  document.getElementById('btn-sidebar-toggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('collapsed'));

  // Sidebar tabs
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.addEventListener('click', () => switchSidebarTab(tab.dataset.tab));
  });

  // Sidebar search
  document.getElementById('sidebar-search').addEventListener('input', () => {
    for (const [pid, sessions] of Object.entries(state.sessions)) {
      const c = document.querySelector(`.project-sessions[data-project="${pid}"]`);
      if (c) renderSessionList(pid, sessions, c);
    }
  });

  // Search module
  setupSearch();

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Don't capture when typing in inputs
    const tag = e.target.tagName;
    const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    if (e.ctrlKey && e.shiftKey && e.key === 'F') { e.preventDefault(); openSearch(); return; }
    if (e.ctrlKey && e.key === 'f') { e.preventDefault(); document.getElementById('btn-search').click(); return; }
    if (e.ctrlKey && e.key === 'b') { e.preventDefault(); document.getElementById('sidebar').classList.toggle('collapsed'); return; }
    if (e.ctrlKey && e.key === 'e') { e.preventDefault(); exportSession(); return; }

    if (e.key === 'Escape') {
      closeSearch(); hideContextMenu(); document.getElementById('highlight-picker').classList.add('hidden');
      ['note-modal', 'move-modal', 'delete-modal', 'memory-modal', 'settings-modal'].forEach(id => hideModal(id));
      const box = document.getElementById('search-box');
      if (!box.classList.contains('hidden')) { box.classList.add('hidden'); state.searchQuery = ''; document.getElementById('message-search').value = ''; renderMessages(); }
      return;
    }

    if (inInput) return;

    // Vim-style navigation
    if (e.key === 'j') { e.preventDefault(); kbNav(1); }
    if (e.key === 'k') { e.preventDefault(); kbNav(-1); }
    if (e.key === 'n') { e.preventDefault(); kbTurn(1); }
    if (e.key === 'p') { e.preventDefault(); kbTurn(-1); }
    if (e.key === '/' && !e.ctrlKey) { e.preventDefault(); openSearch(); }
    if (e.key === 'g') {
      // Wait for second key
      const handler = (e2) => {
        document.removeEventListener('keydown', handler);
        if (e2.key === 's') { e2.preventDefault(); showSettings(); }
        if (e2.key === 'a') { e2.preventDefault(); navigate('analytics', { projectId: state.currentProject }); showAnalytics(state.currentProject); }
        if (e2.key === 'm') { e2.preventDefault(); showMemory(); }
        if (e2.key === 'n') { e2.preventDefault(); toggleNotesPanel(); }
      };
      document.addEventListener('keydown', handler, { once: true });
      setTimeout(() => document.removeEventListener('keydown', handler), 1000);
    }
  });

  // Scroll tracking
  document.getElementById('messages').addEventListener('scroll', updateRailActive, { passive: true });

  setupResize();
}

// ── Helpers ─────────────────────────────────────────────────────────────

function isScrolledToBottom() { const el = document.getElementById('messages'); return el.scrollHeight - el.scrollTop - el.clientHeight < 100; }
function scrollToBottom() { document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight; }

// ── Random Tips ─────────────────────────────────────────────────────────

const TIPS = [
  'Press / to search across all sessions',
  'j/k to move between messages, n/p to jump between turns',
  'Ctrl+Shift+F for global search',
  'Click the star on any message to favorite it',
  'Right-click a session to rename, duplicate, or delete',
  'Press g then a to open the analytics dashboard',
  'Press g then m to view project memory',
  'Ctrl+B toggles the sidebar',
  'Ctrl+E exports the current session as Markdown',
  'Click a dot on the right rail to jump to that turn',
  'Highlight messages with colors to organize your notes',
  'The lightning icon enables live auto-refresh',
  'Edit any message — changes sync back to the JSONL file',
  'Click "View subagent conversation" inside Agent tool calls',
  'Double-click a session name in the sidebar to rename it',
  'Use the gear icon to customize font size, compact mode, and more',
  'Sessions are sorted by date — change it in Settings',
  'Install as a PWA for a native app experience',
  'Cost estimates are shown per message and per session',
  'Press Escape to close any modal or popup',
];

let tipIdx = Math.floor(Math.random() * TIPS.length);

function showTip() {
  const el = document.getElementById('status-tip');
  if (!el) return;
  el.textContent = TIPS[tipIdx];
  tipIdx = (tipIdx + 1) % TIPS.length;
}

function startTips() {
  showTip();
  setInterval(showTip, 30_000); // rotate every 30s
}

// ── Init ────────────────────────────────────────────────────────────────

(async () => {
  const saved = localStorage.getItem('theme');
  if (saved) document.documentElement.dataset.theme = saved;

  // Register service worker
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

  // Load settings
  try { state.settings = { ...DEFAULTS, ...(await api('/api/settings')) }; applySettings(); } catch {}

  setupEvents();
  connectWS();
  startTips();
  await loadProjects();

  // Handle initial route (URL hash or last session)
  const route = getRoute();
  if (route) {
    await handleRoute(route);
  } else {
    try {
      const last = JSON.parse(localStorage.getItem('lastSession'));
      if (last?.projectId && last?.sessionId) {
        navigate('session', last);
        await loadSession(last.projectId, last.sessionId);
      }
    } catch {}
  }
})();
