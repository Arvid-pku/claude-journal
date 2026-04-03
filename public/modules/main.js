import { state, DEFAULTS, api, apiPost, apiPut, apiDelete, IC, setAfterRender, setOnSessionSelect, setOnAnnotationChange,
  showModal, hideModal, renderMarkdown, escapeHtml, shortenPath, formatTime, formatCost, applySettings } from './state.js';
import { renderSidebar, loadSessions, renderSessionList, updateSidebarActive,
  hideContextMenu, pinSession, renameSession, duplicateSession, moveSession, deleteSession, setupResize, toggleBulkMode } from './sidebar.js';
import { processMessages, renderMessages, updateSessionInfo, updateStats, startEditing, showLoadingSkeleton } from './messages.js';
import { renderRail, updateRailActive } from './rail.js';
import { toggleNotesPanel, renderNotesPanel } from './notes.js';
import { toast, loading } from './toast.js';
import { getRoute, navigate, onRouteChange } from './router.js';
import { openSearch, closeSearch, setupSearch, setSearchNavigate } from './search.js';
import { showAnalytics } from './analytics.js';

// ── Wire callbacks ──────────────────────────────────────────────────────

setAfterRender(() => { renderRail(); renderNotesPanel(); });
setOnAnnotationChange(() => { renderNotesPanel(); refreshActiveSidebarPanel(); });
window.__notesPanel = { toggleNotesPanel };
setOnSessionSelect((pid, sid) => { navigate('session', { projectId: pid, sessionId: sid }); loadSession(pid, sid); });
setSearchNavigate((pid, sid, uuid) => {
  loadSession(pid, sid).then(() => {
    if (uuid) setTimeout(() => scrollToMessage(uuid), 300);
  });
});

// ── Data loading ────────────────────────────────────────────────────────

async function loadProjects() {
  const data = await api('/api/projects');
  // Handle empty state (no projects directory or no sessions)
  if (data && data.empty) {
    state.projects = [];
    state.projectsEmpty = data;
    renderSidebar();
    return;
  }
  state.projects = Array.isArray(data) ? data : [];
  state.projectsEmpty = null;
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

  showLoadingSkeleton();
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
    updateChatBar();
    watchSession();
  } catch (err) {
    toast(`Failed to load session: ${err.message}`, 'error');
  } finally { done(); }
}

// ── Routing ─────────────────────────────────────────────────────────────

async function handleRoute(route) {
  if (!route) return;
  if (route.page === 'home') {
    showHome();
  } else if (route.page === 'session') {
    await loadSession(route.projectId, route.sessionId);
  } else if (route.page === 'analytics') {
    clearSessionContext();
    await showAnalytics(route.projectId);
  } else if (route.page === 'search') {
    openSearch(route.query);
  }
}

function clearSessionContext() {
  state.currentSession = null;
  state.displayMessages = [];
  document.getElementById('session-title').textContent = '';
  document.getElementById('session-meta').textContent = '';
  document.getElementById('conv-rail').innerHTML = '';
  document.getElementById('notes-panel').classList.add('hidden');
  updateSidebarActive();
  updateChatBar();
}

function goHome() {
  state.currentProject = null;
  clearSessionContext();
  navigate('home');
  showHome();
}

async function showHome() {
  const container = document.getElementById('messages');

  // Handle empty state — no projects found
  if (state.projectsEmpty) {
    const info = state.projectsEmpty;
    container.innerHTML = `
      <div class="home-page">
        <div class="home-hero">
          <h1>Claude Journal</h1>
          <p>View, annotate, search, and analyze your Claude Code conversations</p>
        </div>
        <div class="empty-welcome">
          <div class="empty-welcome-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <h2>No conversations found</h2>
          <p>${escapeHtml(info.message)}</p>
          <div class="empty-welcome-steps">
            <div class="empty-step"><span class="step-num">1</span><span>Install Claude Code: <kbd>npm i -g @anthropic-ai/claude-code</kbd></span></div>
            <div class="empty-step"><span class="step-num">2</span><span>Start a conversation: <kbd>claude</kbd></span></div>
            <div class="empty-step"><span class="step-num">3</span><span>Refresh this page to see your sessions</span></div>
          </div>
          <p class="empty-welcome-dir">Looking in: <code>${escapeHtml(info.dir)}</code></p>
          <button class="btn btn-primary" onclick="document.getElementById('btn-settings').click()">Change Directory</button>
        </div>
      </div>`;
    return;
  }

  // Gather quick stats
  let totalSessions = 0, totalCost = 0;
  for (const p of state.projects) totalSessions += p.sessionCount || 0;

  // Recent sessions across all projects
  const recentSessions = [];
  for (const p of state.projects) {
    if (!state.sessions[p.id]) {
      try { state.sessions[p.id] = await api(`/api/sessions/${encodeURIComponent(p.id)}`); } catch { continue; }
    }
    for (const s of state.sessions[p.id]) {
      recentSessions.push({ ...s, projectId: p.id, projectPath: p.projectPath });
      totalCost += s.cost || 0;
    }
  }
  recentSessions.sort((a, b) => new Date(b.modified || b.lastTs || 0) - new Date(a.modified || a.lastTs || 0));

  container.innerHTML = `
    <div class="home-page">
      <div class="home-hero">
        <h1>Claude Journal</h1>
        <p>View, annotate, search, and analyze your Claude Code conversations</p>
      </div>
      <div class="home-stats">
        <div class="acard"><div class="acard-value">${state.projects.length}</div><div class="acard-label">Projects</div></div>
        <div class="acard"><div class="acard-value">${totalSessions}</div><div class="acard-label">Sessions</div></div>
        <div class="acard"><div class="acard-value">${formatCost(totalCost)}</div><div class="acard-label">Total Cost</div></div>
      </div>
      <div class="home-section">
        <h3>Recent Sessions</h3>
        <div class="home-recent">
          ${recentSessions.slice(0, 10).map(s => {
            const title = s.customName || s.summary || s.sessionId.slice(0, 8);
            const project = shortenPath(s.projectPath);
            const date = s.lastTs || s.modified;
            const dateStr = date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
            return `<div class="home-session" data-project="${escapeHtml(s.projectId)}" data-session="${s.sessionId}">
              <div class="home-session-title">${escapeHtml(title.slice(0, 80))}</div>
              <div class="home-session-meta"><span>${escapeHtml(project)}</span><span>${dateStr}</span>${s.cost ? `<span>${formatCost(s.cost)}</span>` : ''}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="home-shortcuts">
        <h3>Keyboard Shortcuts</h3>
        <div class="shortcut-grid">
          <div><kbd>/</kbd> Global search</div>
          <div><kbd>j</kbd> <kbd>k</kbd> Navigate messages</div>
          <div><kbd>n</kbd> <kbd>p</kbd> Navigate turns</div>
          <div><kbd>Ctrl+F</kbd> Search in session</div>
          <div><kbd>Ctrl+B</kbd> Toggle sidebar</div>
          <div><kbd>Ctrl+E</kbd> Export session</div>
          <div><kbd>g</kbd> <kbd>a</kbd> Analytics</div>
          <div><kbd>g</kbd> <kbd>m</kbd> Memory</div>
          <div><kbd>g</kbd> <kbd>n</kbd> Notes panel</div>
          <div><kbd>g</kbd> <kbd>h</kbd> Home</div>
          <div><kbd>?</kbd> Show this help</div>
        </div>
      </div>
    </div>`;

  // Wire session clicks
  container.querySelectorAll('.home-session').forEach(el => {
    el.addEventListener('click', () => {
      navigate('session', { projectId: el.dataset.project, sessionId: el.dataset.session });
      loadSession(el.dataset.project, el.dataset.session);
    });
  });
}

onRouteChange(handleRoute);

// ── WebSocket ───────────────────────────────────────────────────────────

let wsReconnectDelay = 1000;

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  state.ws = new WebSocket(`${proto}//${location.host}`);
  state.ws.onopen = () => {
    wsReconnectDelay = 1000; // reset on successful connect
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
    // Chat responses
    if (msg.type === 'chat_start') {
      setChatState('responding');
    }
    if (msg.type === 'chat_delta') {
      // Live update will pick up JSONL changes — just scroll
      scrollToBottom();
    }
    if (msg.type === 'chat_done' || msg.type === 'chat_end') {
      setChatState('ready');
    }
    if (msg.type === 'chat_error') {
      toast(`Chat: ${msg.error}`, 'error', 6000);
      setChatState('ready');
    }
  };
  state.ws.onclose = () => {
    setStatus('', 'Disconnected');
    setTimeout(connectWS, wsReconnectDelay);
    wsReconnectDelay = Math.min(wsReconnectDelay * 2, 30000); // exponential backoff, max 30s
  };
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

async function setAnnotation(uuid, key, value, { rerender = true } = {}) {
  try {
    state.annotations = await apiPost(
      `/api/annotations/${encodeURIComponent(state.currentProject)}/${encodeURIComponent(state.currentSession)}`,
      { uuid, key, value }
    );
    if (rerender) renderMessages();
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
  // Features
  { id: 'setting-code-copy', key: 'showCodeCopyBtn', type: 'checkbox' },
  { id: 'setting-collapse', key: 'enableCollapse', type: 'checkbox' },
  { id: 'setting-diff-view', key: 'showDiffView', type: 'checkbox' },
  { id: 'setting-group-tools', key: 'groupToolCalls', type: 'checkbox' },
  { id: 'setting-timeline', key: 'showSessionTimeline', type: 'checkbox' },
  { id: 'setting-avatars', key: 'showAvatars', type: 'checkbox' },
  { id: 'setting-skeletons', key: 'showSkeletons', type: 'checkbox' },
  { id: 'setting-smooth-scroll', key: 'smoothScrollHighlight', type: 'checkbox' },
  { id: 'setting-tags', key: 'enableTags', type: 'checkbox' },
  { id: 'setting-share-html', key: 'enableShareHtml', type: 'checkbox' },
  { id: 'setting-adv-search', key: 'advancedSearch', type: 'checkbox' },
  { id: 'setting-bulk-ops', key: 'enableBulkOps', type: 'checkbox' },
  { id: 'setting-project-dash', key: 'enableProjectDashboard', type: 'checkbox' },
  { id: 'setting-provider-filter', key: 'providerFilter', type: 'select' },
];

async function showSettings() {
  const s = { ...DEFAULTS, ...(await api('/api/settings')) };
  document.getElementById('setting-theme').value = document.documentElement.dataset.theme || 'dark';
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
    const warnings = saved._warnings;
    delete saved._warnings;
    state.settings = { ...DEFAULTS, ...saved };
    applySettings();
    // Apply theme
    const theme = document.getElementById('setting-theme').value;
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
    hideModal('settings-modal');
    if (state.displayMessages.length) renderMessages();
    renderSidebar();
    for (const [pid, sessions] of Object.entries(state.sessions)) {
      const c = document.querySelector(`.project-sessions[data-project="${pid}"]`);
      if (c) renderSessionList(pid, sessions, c);
    }
    if (warnings?.length) {
      for (const w of warnings) toast(w, 'info', 6000);
    } else {
      toast('Settings saved', 'success');
    }
  } catch (err) { toast(`Failed: ${err.message}`, 'error'); }
}

// ── Confirm Action (with suppress) ──────────────────────────────────────

const suppressUntil = {}; // key -> timestamp

function confirmAction(key, title, text, onConfirm) {
  // Check suppress
  if (suppressUntil[key] && Date.now() < suppressUntil[key]) {
    onConfirm();
    return;
  }

  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-text').textContent = text;
  document.getElementById('confirm-suppress').checked = false;
  showModal('confirm-modal');

  const okBtn = document.getElementById('confirm-ok');
  const newBtn = okBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(newBtn, okBtn);

  newBtn.addEventListener('click', () => {
    hideModal('confirm-modal');
    if (document.getElementById('confirm-suppress').checked) {
      suppressUntil[key] = Date.now() + 10 * 60 * 1000; // 10 minutes
    }
    onConfirm();
  });
}

// ── Sidebar Tabs (Starred / Highlights / Notes) ─────────────────────────

// Refresh whichever sidebar panel is currently open
function refreshActiveSidebarPanel() {
  for (const p of PANELS) {
    const el = document.getElementById(`sidebar-${p}`);
    if (el && !el.classList.contains('hidden')) {
      // Force reload by closing and re-opening
      el.classList.add('hidden');
      toggleSidebarPanel(p);
      return;
    }
  }
}

const PANELS = ['starred', 'highlights', 'notes', 'tags'];
const PANEL_LABELS = { starred: 'Starred', highlights: 'Highlights', notes: 'Notes', tags: 'Tags' };
const PANEL_TYPES = { starred: 'favorites', highlights: 'highlights', notes: 'notes', tags: 'tags' };

async function toggleSidebarPanel(panel) {
  const el = document.getElementById(`sidebar-${panel}`);
  const btn = document.querySelector(`.sidebar-menu-item[data-tab="${panel}"]`);

  // Close all other panels
  for (const p of PANELS) {
    if (p === panel) continue;
    document.getElementById(`sidebar-${p}`)?.classList.add('hidden');
    document.querySelector(`.sidebar-menu-item[data-tab="${p}"]`)?.classList.remove('active');
  }

  // Toggle this panel
  const opening = el.classList.contains('hidden');
  el.classList.toggle('hidden');
  btn?.classList.toggle('active', opening);
  if (!opening) return;

  el.innerHTML = `<div class="sidebar-panel-close"><span>${PANEL_LABELS[panel]}</span><button data-close="${panel}">&times;</button></div><div style="padding:16px;color:var(--text-muted);font-size:12px">Loading...</div>`;

  // Use delegated click handler on the panel — survives innerHTML replacements
  el.onclick = (e) => {
    if (e.target.closest(`[data-close="${panel}"]`)) { el.classList.add('hidden'); btn?.classList.remove('active'); }
  };

  try {
    const items = await api(`/api/bookmarks?type=${PANEL_TYPES[panel]}`);
    // Update header with count
    el.querySelector('.sidebar-panel-close span').textContent = `${PANEL_LABELS[panel]} (${items.length})`;
    const header = el.querySelector('.sidebar-panel-close').outerHTML;
    if (!items.length) { el.innerHTML = header + `<div style="padding:16px;color:var(--text-muted);font-size:12px">No ${PANEL_LABELS[panel].toLowerCase()} yet</div>`; return; }

    if (panel === 'starred') {
      el.innerHTML = header + items.map(item => `
        <div class="bookmark-item" data-project="${escapeHtml(item.project)}" data-session="${item.session}" data-uuid="${item.uuid}">
          <div class="bookmark-header">
            <span class="bookmark-role ${item.role}">${item.role === 'user' ? 'You' : 'Claude'}</span>
            <span class="bookmark-session">${escapeHtml(item.sessionName)}</span>
            <span class="bookmark-time">${item.ts ? new Date(item.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
          </div>
          <div class="bookmark-text">${escapeHtml(item.text.slice(0, 120))}</div>
        </div>`).join('');
    } else if (panel === 'highlights') {
      el.innerHTML = header + items.map(item => `
        <div class="bookmark-item" data-project="${escapeHtml(item.project)}" data-session="${item.session}" data-uuid="${item.uuid}">
          <div class="bookmark-header">
            <span class="bookmark-color" style="background:${item.color}"></span>
            <span class="bookmark-role ${item.role}">${item.role === 'user' ? 'You' : 'Claude'}</span>
            <span class="bookmark-session">${escapeHtml(item.sessionName)}</span>
          </div>
          <div class="bookmark-text">${escapeHtml(item.text.slice(0, 120))}</div>
        </div>`).join('');
    } else if (panel === 'tags') {
      el.innerHTML = header + items.map(item => `
        <div class="bookmark-item" data-project="${escapeHtml(item.project)}" data-session="${item.session}" data-uuid="${item.uuid}">
          <div class="bookmark-header">
            <span class="bookmark-session">${escapeHtml(item.sessionName)}</span>
          </div>
          <div class="bookmark-tags">${(item.tags || []).map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join('')}</div>
          <div class="bookmark-context">${escapeHtml((item.text || '').slice(0, 100))}</div>
        </div>`).join('');
    } else {
      el.innerHTML = header + items.map(item => `
        <div class="bookmark-item" data-project="${escapeHtml(item.project)}" data-session="${item.session}" data-uuid="${item.uuid || ''}">
          <div class="bookmark-header">
            <span class="bookmark-session">${escapeHtml(item.sessionName)}</span>
            <span class="bookmark-time">${item.ts ? new Date(item.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
          </div>
          <div class="bookmark-comment">${escapeHtml(item.comment || '')}</div>
          <div class="bookmark-context">
            <span class="bookmark-role ${item.role}">${item.role === 'user' ? 'You' : 'Claude'}:</span>
            ${escapeHtml((item.text || '').slice(0, 100))}
          </div>
        </div>`).join('');
    }
  } catch { /* keep loading text */ }

  // Wire bookmark clicks
  el.querySelectorAll('.bookmark-item').forEach(bi => bi.addEventListener('click', () => {
    navigate('session', { projectId: bi.dataset.project, sessionId: bi.dataset.session });
    loadSession(bi.dataset.project, bi.dataset.session).then(() => {
      // Open notes panel so user can see all comments
      const notesPanel = document.getElementById('notes-panel');
      if (notesPanel.classList.contains('hidden')) toggleNotesPanel();
      // Scroll to the specific message
      if (bi.dataset.uuid) setTimeout(() => scrollToMessage(bi.dataset.uuid), 400);
    });
  }));
}

// ── Feature 11: Scroll to message ───────────────────────────────────────

function scrollToMessage(uuid) {
  const el = document.querySelector(`.message[data-uuid="${uuid}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: state.settings.smoothScrollHighlight ? 'smooth' : 'auto', block: 'center' });
  const inner = el.querySelector('.message-inner');
  if (inner) { inner.classList.remove('flash'); void inner.offsetWidth; inner.classList.add('flash'); }
}

// ── Feature 13: Share as HTML ───────────────────────────────────────────

async function exportSessionHtml() {
  if (!state.displayMessages.length) return;
  const done = loading('Generating HTML...');
  try {
    const css = await fetch('/style.css').then(r => r.text());
    const msgs = document.getElementById('messages').cloneNode(true);
    // Remove interactive elements
    msgs.querySelectorAll('.msg-actions, .comment-delete, .tag-add-btn, .tag-input, .timeline-close').forEach(el => el.remove());
    const session = (state.sessions[state.currentProject] || []).find(s => s.sessionId === state.currentSession);
    const title = session?.customName || session?.summary || 'Claude Conversation';
    const html = `<!DOCTYPE html><html lang="en" data-theme="${document.documentElement.dataset.theme}"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
<style>${css}
html,body{height:auto;overflow:auto}
body{background:var(--bg-base);margin:0;padding:24px}
#messages{overflow:visible!important;height:auto!important;max-height:none!important;padding:0}
.message{animation:none}
#content-area{height:auto;overflow:visible}
</style></head>
<body><div id="messages">${msgs.innerHTML}</div></body></html>`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = `claude-${state.currentSession?.slice(0, 8) || 'export'}.html`;
    a.click();
    toast('Exported as HTML', 'success', 4000);
  } catch (err) { toast(`Export failed: ${err.message}`, 'error'); }
  finally { done(); }
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
  toast('Exported as Markdown', 'success', 4000);
}

// ── Chat with Claude Code ───────────────────────────────────────────────

function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message || !state.currentProject || !state.currentSession) return;
  if (!state.ws || state.ws.readyState !== 1) { toast('Not connected', 'error'); return; }

  // Optimistic: show user message immediately
  const container = document.getElementById('messages');
  const userDiv = document.createElement('div');
  userDiv.className = 'message user-msg chat-pending';
  userDiv.innerHTML = `<div class="message-inner"><div class="msg-header"><span class="msg-role">You</span></div><div class="msg-body">${renderMarkdown(message)}</div></div>`;
  container.appendChild(userDiv);
  scrollToBottom();

  state.ws.send(JSON.stringify({
    type: 'chat',
    project: state.currentProject,
    session: state.currentSession,
    message,
  }));

  input.value = '';
  input.style.height = 'auto';
  setChatState('responding');
}

function cancelChat() {
  if (state.ws && state.ws.readyState === 1) {
    state.ws.send(JSON.stringify({ type: 'chat_cancel' }));
  }
  setChatState('ready');
}

function setChatState(s) {
  const sendBtn = document.getElementById('chat-send');
  const cancelBtn = document.getElementById('chat-cancel');
  const dot = document.getElementById('chat-status-dot');
  const input = document.getElementById('chat-input');
  if (s === 'responding') {
    sendBtn.classList.add('hidden');
    cancelBtn.classList.remove('hidden');
    dot.classList.remove('hidden');
    input.disabled = true;
    input.placeholder = 'Claude is responding...';
  } else {
    sendBtn.classList.remove('hidden');
    cancelBtn.classList.add('hidden');
    dot.classList.add('hidden');
    input.disabled = false;
    input.placeholder = 'Reply...';
  }
}

function updateChatBar() {
  const bar = document.getElementById('chat-bar');
  bar.classList.toggle('hidden', !state.currentSession);
  // Update placeholder based on provider
  const input = document.getElementById('chat-input');
  if (state.currentProject?.startsWith('codex__')) {
    input.placeholder = 'Reply to Codex...';
  } else {
    input.placeholder = 'Reply...';
  }
}

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

// ── Keyboard Help ──────────────────────────────────────────────────────

function showKeyboardHelp() {
  const el = document.getElementById('shortcuts-modal');
  if (!el.classList.contains('hidden')) { hideModal('shortcuts-modal'); return; }
  showModal('shortcuts-modal');
}

// ── Events ──────────────────────────────────────────────────────────────

function setupEvents() {
  // Message actions
  document.getElementById('messages').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, uuid } = btn.dataset;
    switch (action) {
      case 'favorite': {
        const newVal = !(state.annotations[uuid]?.favorite);
        await setAnnotation(uuid, 'favorite', newVal, { rerender: false });
        // Update in-place
        const msgEl = document.querySelector(`.message[data-uuid="${uuid}"]`);
        if (msgEl) {
          const inner = msgEl.querySelector('.message-inner');
          inner.classList.toggle('favorited', newVal);
          const favBtn = msgEl.querySelector('[data-action="favorite"]');
          if (favBtn) favBtn.classList.toggle('active', newVal);
        }
        renderNotesPanel();
        refreshActiveSidebarPanel();
        break;
      }
      case 'highlight': {
        const picker = document.getElementById('highlight-picker');
        const rect = btn.getBoundingClientRect();
        picker.style.top = `${rect.bottom + 4}px`; picker.style.left = `${rect.left}px`;
        picker.classList.remove('hidden'); picker.dataset.uuid = uuid; break;
      }
      case 'comment': {
        const msgEl = document.querySelector(`.message[data-uuid="${uuid}"]`);
        if (!msgEl) break;
        let card = msgEl.querySelector('.msg-comment');
        if (!card) {
          card = document.createElement('div');
          card.className = 'msg-comment';
          const anno = state.annotations[uuid] || {};
          if (anno.highlight) card.style.setProperty('--comment-color', anno.highlight);
          card.innerHTML = `<textarea class="comment-input" data-uuid="${uuid}" placeholder="Add comment..."></textarea><button class="comment-delete" data-action="delete-comment" data-uuid="${uuid}" title="Remove">&times;</button>`;
          msgEl.appendChild(card);
          document.getElementById('messages').classList.add('has-comments');
          // Auto-size to match message height, capped at viewport
          const msgH = msgEl.querySelector('.message-inner')?.offsetHeight || 120;
          const input = card.querySelector('.comment-input');
          input.style.height = Math.min(Math.max(60, msgH - 20), window.innerHeight * 0.6) + 'px';
        }
        card.classList.remove('hidden');
        card.querySelector('.comment-input').focus();
        break;
      }
      case 'copy': {
        const msg = state.displayMessages.find(m => m.uuid === uuid);
        if (!msg) break;
        const text = msg.role === 'user' ? msg.content : msg.parts.filter(p => p.type === 'text').map(p => p.content).join('\n\n');
        navigator.clipboard.writeText(text);
        btn.innerHTML = IC.check; setTimeout(() => btn.innerHTML = IC.copy, 1500);
        toast('Copied', 'success', 1500); break;
      }
      case 'edit': {
        confirmAction('edit', 'Edit Message', 'This will modify the JSONL file. Continue?', () => startEditing(uuid));
        break;
      }
      case 'delete': {
        confirmAction('delete', 'Delete Message', 'This will permanently remove this message from the JSONL file.', async () => {
          try {
            await apiDelete(`/api/messages/${encodeURIComponent(state.currentProject)}/${encodeURIComponent(state.currentSession)}/${encodeURIComponent(uuid)}`);
            state.displayMessages = state.displayMessages.filter(m => m.uuid !== uuid);
            // Remove from DOM in-place, no scroll reset
            const msgEl = document.querySelector(`.message[data-uuid="${uuid}"]`);
            if (msgEl) msgEl.remove();
            toast('Message deleted', 'success');
          } catch (err) { toast(`Delete failed: ${err.message}`, 'error'); }
        });
        break;
      }
    }
  });

  // Highlight picker
  document.getElementById('highlight-picker').addEventListener('click', async (e) => {
    const dot = e.target.closest('[data-color]');
    if (!dot) return;
    const picker = document.getElementById('highlight-picker');
    const uuid = picker.dataset.uuid;
    const color = dot.dataset.color || false;
    picker.classList.add('hidden');
    await setAnnotation(uuid, 'highlight', color, { rerender: false });
    // Update in-place
    const msgEl = document.querySelector(`.message[data-uuid="${uuid}"]`);
    if (msgEl) {
      const inner = msgEl.querySelector('.message-inner');
      inner.classList.toggle('highlighted', !!color);
      if (color) inner.style.cssText = `--highlight-color:${color}`;
      else inner.style.cssText = '';
    }
    renderNotesPanel();
    refreshActiveSidebarPanel();
  });

  // Comment auto-save on blur
  document.getElementById('messages').addEventListener('focusout', async (e) => {
    if (!e.target.classList.contains('comment-input')) return;
    const uuid = e.target.dataset.uuid;
    const text = e.target.value.trim();
    const card = e.target.closest('.msg-comment');
    if (text) {
      await setAnnotation(uuid, 'comment', text, { rerender: false });
      if (state.annotations[uuid]?.note) await setAnnotation(uuid, 'note', false, { rerender: false });
      // Show "Saved" indicator
      if (card) {
        let badge = card.querySelector('.comment-saved');
        if (!badge) { badge = document.createElement('span'); badge.className = 'comment-saved'; card.appendChild(badge); }
        badge.textContent = 'Saved';
        badge.classList.add('show');
        setTimeout(() => badge.classList.remove('show'), 1500);
      }
    } else {
      await setAnnotation(uuid, 'comment', false, { rerender: false });
      card?.remove();
      if (!document.querySelector('#messages .msg-comment')) document.getElementById('messages').classList.remove('has-comments');
    }
    renderNotesPanel();
    refreshActiveSidebarPanel();
  });

  // Delete comment
  document.getElementById('messages').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="delete-comment"]');
    if (!btn) return;
    e.stopPropagation();
    const uuid = btn.dataset.uuid;
    await setAnnotation(uuid, 'comment', false, { rerender: false });
    if (state.annotations[uuid]?.note) await setAnnotation(uuid, 'note', false, { rerender: false });
    btn.closest('.msg-comment')?.remove();
    if (!document.querySelector('#messages .msg-comment')) document.getElementById('messages').classList.remove('has-comments');
    renderNotesPanel();
    refreshActiveSidebarPanel();
  });

  // Session note save (in notes panel)
  document.getElementById('note-save')?.addEventListener('click', () => {
    if (state.noteTarget) setAnnotation(state.noteTarget, 'comment', document.getElementById('note-text').value.trim() || false);
    hideModal('note-modal'); state.noteTarget = null;
  });

  // Context menu
  document.getElementById('context-menu').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ctx]');
    if (!btn) return;
    const action = btn.dataset.ctx;

    if (action === 'select') {
      hideContextMenu();
      if (!state.settings.enableBulkOps) { toast('Enable "Bulk session operations" in Settings', 'info'); return; }
      toggleBulkMode(true);
      return;
    }
    ({ pin: pinSession, rename: renameSession, duplicate: duplicateSession, move: moveSession, delete: deleteSession })[action]?.();
  });

  // Close popups
  document.addEventListener('click', (e) => {
    if (!document.getElementById('context-menu').classList.contains('hidden') && !e.target.closest('#context-menu,.session-menu-btn')) hideContextMenu();
    const picker = document.getElementById('highlight-picker');
    if (!picker.classList.contains('hidden') && !picker.contains(e.target) && !e.target.closest('[data-action="highlight"]')) picker.classList.add('hidden');
    const exportMenu = document.getElementById('export-menu');
    if (exportMenu && !exportMenu.classList.contains('hidden') && !exportMenu.contains(e.target) && !e.target.closest('#btn-export')) exportMenu.classList.add('hidden');
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
  document.getElementById('btn-highlights').addEventListener('click', () => { state.highlightsOnly = !state.highlightsOnly; document.getElementById('btn-highlights').classList.toggle('toggled', state.highlightsOnly); renderMessages(); });
  document.getElementById('btn-favorites').addEventListener('click', () => { state.favoritesOnly = !state.favoritesOnly; document.getElementById('btn-favorites').classList.toggle('toggled', state.favoritesOnly); renderMessages(); });

  // Filter bar toggle
  document.getElementById('btn-filter').addEventListener('click', () => {
    const bar = document.getElementById('filter-bar');
    bar.classList.toggle('hidden');
    document.getElementById('btn-filter').classList.toggle('toggled', !bar.classList.contains('hidden'));
  });

  // Filter checkboxes
  document.getElementById('filter-bar').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-filter]');
    if (!cb) return;
    state.messageFilters[cb.dataset.filter] = cb.checked;
    renderMessages();
  });
  document.getElementById('btn-live').addEventListener('click', () => { state.liveEnabled = !state.liveEnabled; document.getElementById('btn-live').classList.toggle('active', state.liveEnabled); watchSession(); });
  document.getElementById('btn-export').addEventListener('click', (e) => {
    if (!state.settings.enableShareHtml) { exportSession(); return; }
    // Show export dropdown
    let menu = document.getElementById('export-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'export-menu';
      menu.className = 'popup export-popup';
      menu.innerHTML = `<button data-export="md">Markdown (.md)</button><button data-export="html">HTML (.html)</button>`;
      menu.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-export]');
        if (!btn) return;
        menu.classList.add('hidden');
        if (btn.dataset.export === 'html') exportSessionHtml(); else exportSession();
      });
      document.body.appendChild(menu);
    }
    const rect = e.currentTarget.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    menu.style.left = 'auto';
    menu.classList.toggle('hidden');
  });
  document.getElementById('btn-notes').addEventListener('click', toggleNotesPanel);
  document.getElementById('btn-memory').addEventListener('click', showMemory);
  document.getElementById('btn-home').addEventListener('click', goHome);
  document.getElementById('logo-home').addEventListener('click', goHome);
  document.getElementById('btn-analytics-sidebar').addEventListener('click', () => {
    clearSessionContext();
    navigate('analytics', { projectId: state.currentProject });
    showAnalytics(state.currentProject);
  });
  document.getElementById('btn-settings').addEventListener('click', showSettings);
  document.getElementById('settings-save').addEventListener('click', saveSettings);
  document.getElementById('btn-sidebar-close').addEventListener('click', () => document.getElementById('sidebar').classList.add('collapsed'));
  document.getElementById('btn-sidebar-open').addEventListener('click', () => document.getElementById('sidebar').classList.remove('collapsed'));
  document.getElementById('btn-settings-mini').addEventListener('click', showSettings);

  // Chat
  document.getElementById('chat-send').addEventListener('click', sendChatMessage);
  document.getElementById('chat-cancel').addEventListener('click', cancelChat);
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });
  // Auto-resize chat input
  document.getElementById('chat-input').addEventListener('input', (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(150, e.target.scrollHeight) + 'px';
  });

  // Sidebar menu items
  document.querySelectorAll('.sidebar-menu-item[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => toggleSidebarPanel(btn.dataset.tab));
  });
  document.getElementById('btn-global-search').addEventListener('click', () => openSearch());

  // Mini sidebar actions
  document.querySelectorAll('.mini-action').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.mini;
      if (action === 'home') { goHome(); return; }
      if (action === 'analytics') { clearSessionContext(); navigate('analytics', { projectId: state.currentProject }); showAnalytics(state.currentProject); return; }
      document.getElementById('sidebar').classList.remove('collapsed');
      if (action === 'search') setTimeout(() => document.getElementById('sidebar-search').querySelector('input')?.focus(), 200);
      else if (action === 'starred' || action === 'highlights' || action === 'notes') setTimeout(() => toggleSidebarPanel(action), 200);
    });
  });

  // Sidebar search
  document.getElementById('sidebar-search').addEventListener('input', () => {
    const query = document.getElementById('sidebar-search').value.toLowerCase();
    for (const [pid, sessions] of Object.entries(state.sessions)) {
      const c = document.querySelector(`.project-sessions[data-project="${pid}"]`);
      if (c) renderSessionList(pid, sessions, c);
    }
    // Update counts for collapsed (not-yet-loaded) projects too
    for (const project of state.projects) {
      if (state.sessions[project.id]) continue; // already handled by renderSessionList
      const header = document.querySelector(`.project-header[data-project="${project.id}"]`);
      const countEl = header?.querySelector('.project-count');
      if (!countEl) continue;
      if (!query) { countEl.textContent = String(project.sessionCount); continue; }
      // Can't filter by session name without loading — show "?" to indicate unknown
      countEl.textContent = `?/${project.sessionCount}`;
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
      // Exit bulk mode
      if (state._bulkMode) { toggleBulkMode(false); return; }
      closeSearch(); hideContextMenu(); document.getElementById('highlight-picker').classList.add('hidden');
      ['note-modal', 'move-modal', 'delete-modal', 'memory-modal', 'settings-modal', 'confirm-modal', 'shortcuts-modal'].forEach(id => hideModal(id));
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
    if (e.key === '?') { e.preventDefault(); showKeyboardHelp(); }
    if (e.key === 'g') {
      // Wait for second key
      const handler = (e2) => {
        document.removeEventListener('keydown', handler);
        if (e2.key === 'h') { e2.preventDefault(); goHome(); }
        if (e2.key === 's') { e2.preventDefault(); showSettings(); }
        if (e2.key === 'a') { e2.preventDefault(); clearSessionContext(); navigate('analytics', { projectId: state.currentProject }); showAnalytics(state.currentProject); }
        if (e2.key === 'm') { e2.preventDefault(); showMemory(); }
        if (e2.key === 'n') { e2.preventDefault(); toggleNotesPanel(); }
      };
      document.addEventListener('keydown', handler, { once: true });
      setTimeout(() => document.removeEventListener('keydown', handler), 1000);
    }
  });

  // Scroll tracking
  document.getElementById('messages').addEventListener('scroll', () => {
    updateRailActive();
    updateScrollBtn();
  }, { passive: true });

  // Scroll-to-bottom button
  document.getElementById('scroll-bottom-btn').addEventListener('click', scrollToBottom);

  setupResize();
}

// ── Helpers ─────────────────────────────────────────────────────────────

function isScrolledToBottom() { const el = document.getElementById('messages'); return el.scrollHeight - el.scrollTop - el.clientHeight < 100; }
function scrollToBottom() { document.getElementById('messages').scrollTo({ top: document.getElementById('messages').scrollHeight, behavior: 'smooth' }); }
function updateScrollBtn() {
  const btn = document.getElementById('scroll-bottom-btn');
  btn.classList.toggle('hidden', isScrolledToBottom() || !state.currentSession);
}

// ── Random Tips ─────────────────────────────────────────────────────────

const TIPS = [
  // Navigation
  'Press / to search across all sessions',
  'j/k to move between messages, n/p to jump between turns',
  'Ctrl+Shift+F for global search',
  'Ctrl+B toggles the sidebar',
  'Press g then a for Analytics, g then m for Memory, g then h for Home',
  'Press ? to see all keyboard shortcuts',
  'Press Escape to close any modal or popup',
  'Click a dot on the right rail to jump to that turn',
  // Annotations
  'Click the star on any message to favorite it',
  'Highlight messages with colors to organize your notes',
  'Add side comments — they auto-save when you click away',
  'Tag messages with custom labels for easy filtering',
  'View all starred, highlighted, and tagged messages in the sidebar',
  // Session management
  'Right-click a session to rename, duplicate, move, or delete',
  'Pin important sessions to keep them at the top',
  'Right-click "Select multiple" for batch operations',
  'Use the filter box to search sessions by name across projects',
  'Sessions are sorted by date — change it in Settings',
  // Features
  'The funnel icon filters by message type: human, assistant, tools',
  'Edit tool calls show a color-coded diff view',
  'Consecutive tool calls are grouped — click to expand',
  'The session overview at the top shows files touched and tools used',
  'Click the code copy button on any code block to copy it',
  'Enable "Collapsible messages" in Settings to fold long messages',
  // Export & sharing
  'Ctrl+E exports the current session as Markdown or HTML',
  'The HTML export is self-contained — share it with anyone',
  'Install as a PWA for a native app experience',
  // Live & analytics
  'The lightning icon enables live auto-refresh as Claude responds',
  'Cost estimates show API-equivalent pricing (input + output tokens)',
  'The analytics dashboard shows daily cost, tool usage, and activity heatmaps',
  'Filter analytics by date range — click 7d, 14d, 30d, or set custom dates',
  // Codex
  'Claude Journal supports both Claude Code and Codex sessions',
  'Filter by provider in the sidebar to show only Claude or Codex',
  // Misc
  'Edit any message — changes sync back to the JSONL file',
  'Click "View subagent conversation" inside Agent tool calls',
  'Use the gear icon to customize font size, theme, and toggle features',
  'Run as a background daemon: claude-journal --daemon',
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
  document.documentElement.dataset.theme = saved || 'light';

  // Register service worker
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

  // Load settings
  try { state.settings = { ...DEFAULTS, ...(await api('/api/settings')) }; applySettings(); } catch {}

  setupEvents();
  connectWS();
  startTips();
  await loadProjects();

  // Handle initial route (URL hash, last session, or home)
  const route = getRoute();
  if (route) {
    await handleRoute(route);
  } else {
    try {
      const last = JSON.parse(localStorage.getItem('lastSession'));
      if (last?.projectId && last?.sessionId) {
        navigate('session', last);
        await loadSession(last.projectId, last.sessionId);
      } else {
        showHome();
      }
    } catch { showHome(); }
  }
})();
