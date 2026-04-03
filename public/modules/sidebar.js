import { state, api, apiPut, apiPost, apiDelete, onSessionSelect,
  escapeHtml, shortenPath, formatDateRange, formatNum, formatCost, truncateText,
  showModal, hideModal } from './state.js';

// ── Render ──────────────────────────────────────────────────────────────

export function renderSidebar() {
  const nav = document.getElementById('project-list');
  nav.innerHTML = '';

  const providerFilter = state.settings.providerFilter || 'all';
  const claudeProjects = state.projects.filter(p => p.provider !== 'codex');
  const codexProjects = state.projects.filter(p => p.provider === 'codex');
  const hasBoth = claudeProjects.length > 0 && codexProjects.length > 0;

  function appendProjectGroup(container, project) {
    const group = document.createElement('div');
    group.className = 'project-group';
    group.innerHTML = `
      <div class="project-header collapsed" data-project="${project.id}">
        <svg class="project-icon folder-closed" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <svg class="project-icon folder-open" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4l2 3h9a2 2 0 0 1 2 2v1"/><path d="M21.5 12H6.3a2 2 0 0 0-1.9 1.4L2 21h15.7a2 2 0 0 0 1.9-1.4L22 12z"/></svg>
        <span>${escapeHtml(shortenPath(project.projectPath))}</span>
        <span class="project-count" style="margin-left:auto;font-size:10px;color:var(--text-muted)">${project.sessionCount}</span>
      </div>
      <div class="project-sessions" data-project="${project.id}"></div>`;
    group.querySelector('.project-header').addEventListener('click', (e) => toggleProject(project.id, e.currentTarget));
    container.appendChild(group);
  }

  function renderProviderSection(projects, label) {
    if (!projects.length) return;
    const section = document.createElement('div');
    section.className = 'provider-section';
    const totalSessions = projects.reduce((sum, p) => sum + (p.sessionCount || 0), 0);
    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'provider-section-header';
    sectionHeader.innerHTML = `<span class="provider-section-label">${label}</span><span class="provider-section-count">${totalSessions}</span><span class="provider-section-toggle">&#9662;</span>`;
    sectionHeader.addEventListener('click', () => section.classList.toggle('provider-collapsed'));
    section.appendChild(sectionHeader);
    for (const project of projects) appendProjectGroup(section, project);
    nav.appendChild(section);
  }

  if (providerFilter !== 'codex' && claudeProjects.length) {
    if (hasBoth) renderProviderSection(claudeProjects, 'Claude Code');
    else for (const p of claudeProjects) appendProjectGroup(nav, p);
  }

  if (providerFilter !== 'claude' && codexProjects.length) {
    if (hasBoth) renderProviderSection(codexProjects, 'Codex');
    else for (const p of codexProjects) appendProjectGroup(nav, p);
  }
}

async function toggleProject(projectId, header) {
  const wasCollapsed = header.classList.contains('collapsed');
  header.classList.toggle('collapsed');
  if (!wasCollapsed) return;
  const container = header.nextElementSibling;
  if (container.children.length > 0) return;
  container.innerHTML = '<div style="padding:8px 24px;font-size:12px;color:var(--text-muted)">Loading...</div>';
  const sessions = await loadSessions(projectId);
  renderSessionList(projectId, sessions, container);
}

export async function loadSessions(projectId) {
  const sessions = await api(`/api/sessions/${encodeURIComponent(projectId)}`);
  state.sessions[projectId] = sessions;
  return sessions;
}

export function renderSessionList(projectId, sessions, container) {
  container.innerHTML = '';
  const query = document.getElementById('sidebar-search').value.toLowerCase();

  // Sort
  const sorted = [...sessions];
  switch (state.settings.sessionSort) {
    case 'oldest': sorted.sort((a, b) => new Date(a.modified || a.lastTs || 0) - new Date(b.modified || b.lastTs || 0)); break;
    case 'messages': sorted.sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0)); break;
    case 'cost': sorted.sort((a, b) => (b.cost || 0) - (a.cost || 0)); break;
    case 'alpha': sorted.sort((a, b) => (a.customName || a.summary || '').localeCompare(b.customName || b.summary || '')); break;
    default: sorted.sort((a, b) => new Date(b.modified || b.lastTs || 0) - new Date(a.modified || a.lastTs || 0));
  }

  // Split pinned vs unpinned
  const pinned = sorted.filter(s => s.pinned);
  const unpinned = sorted.filter(s => !s.pinned);

  if (pinned.length) {
    const label = document.createElement('div');
    label.className = 'session-group-label';
    label.textContent = 'Pinned';
    container.appendChild(label);
    for (const s of pinned) appendSessionItem(container, projectId, s, query);
  }

  if (unpinned.length && pinned.length) {
    const label = document.createElement('div');
    label.className = 'session-group-label';
    label.textContent = 'Recents';
    container.appendChild(label);
  }

  for (const s of unpinned) appendSessionItem(container, projectId, s, query);

  // Show "no results" when filtering
  const visibleCount = container.querySelectorAll('.session-item').length;
  if (query && visibleCount === 0) {
    const empty = document.createElement('div');
    empty.className = 'session-empty';
    empty.textContent = 'No matches';
    container.appendChild(empty);
  }

  // Update visible count in project header
  const header = document.querySelector(`.project-header[data-project="${projectId}"]`);
  if (header) {
    const countEl = header.querySelector('.project-count');
    if (countEl) {
      const total = sessions.length;
      countEl.textContent = query && visibleCount !== total ? `${visibleCount}/${total}` : String(total);
    }
  }
}

function appendSessionItem(container, projectId, s, query) {
  const title = s.customName || s.summary || s.firstPrompt || s.sessionId.slice(0, 8);
  if (query && !title.toLowerCase().includes(query) && !s.sessionId.includes(query)) return;

  const item = document.createElement('div');
  item.className = `session-item${s.pinned ? ' pinned' : ''}`;
  item.dataset.sessionId = s.sessionId;
  item.dataset.projectId = projectId;

  const dateRange = formatDateRange(s.firstTs || s.created, s.lastTs || s.modified);
  const msgCount = s.messageCount || 0;
  const totalTok = (s.inputTok || 0) + (s.outputTok || 0);
  const cost = formatCost(s.cost);
  const badges = [
    s.pinned ? '<span class="session-badge pin" title="Pinned">&#128204;</span>' : '',
    s.hasAnnotations ? '<span class="session-badge" title="Has annotations">&#9679;</span>' : '',
  ].join('');

  item.innerHTML = `
    <div class="session-top">
      <span class="session-title" title="${escapeHtml(title)}">${escapeHtml(truncateText(title, 55))}</span>
      ${badges}
      <button class="session-menu-btn" title="Actions">&#8943;</button>
    </div>
    <span class="session-meta-line"><span>${dateRange}</span></span>
    <span class="session-stats">
      ${msgCount ? `<span>${msgCount} msgs</span>` : ''}
      ${totalTok ? `<span>${formatNum(totalTok)} tok</span>` : ''}
      ${cost ? `<span>${cost}</span>` : ''}
    </span>`;

  item.addEventListener('click', (e) => {
    if (e.target.closest('.session-menu-btn, .session-checkbox')) return;
    // If in bulk select mode, toggle checkbox instead of navigating
    if (state._bulkMode) {
      const key = `${projectId}__${s.sessionId}`;
      if (state._bulkSelected.has(key)) state._bulkSelected.delete(key); else state._bulkSelected.add(key);
      item.classList.toggle('bulk-selected', state._bulkSelected.has(key));
      updateBulkBar();
      return;
    }
    if (onSessionSelect) onSessionSelect(projectId, s.sessionId);
  });
  item.addEventListener('contextmenu', (e) => { e.preventDefault(); showContextMenu(e.clientX, e.clientY, projectId, s.sessionId); });
  item.querySelector('.session-menu-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const r = e.target.getBoundingClientRect();
    showContextMenu(r.right, r.bottom, projectId, s.sessionId);
  });
  container.appendChild(item);
}

export function updateSidebarActive() {
  document.querySelectorAll('.session-item').forEach(el => {
    el.classList.toggle('active', el.dataset.sessionId === state.currentSession && el.dataset.projectId === state.currentProject);
  });
}

// ── Context Menu ────────────────────────────────────────────────────────

export function showContextMenu(x, y, projectId, sessionId) {
  state.ctxTarget = { projectId, sessionId };

  const menu = document.getElementById('context-menu');
  // Update pin label
  const s = (state.sessions[projectId] || []).find(s => s.sessionId === sessionId);
  const pinLabel = menu.querySelector('.ctx-pin-label');
  if (pinLabel) pinLabel.textContent = s?.pinned ? 'Unpin' : 'Pin';
  menu.classList.remove('hidden');
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  menu.style.left = (x + mw > innerWidth ? innerWidth - mw - 8 : x) + 'px';
  menu.style.top = (y + mh > innerHeight ? innerHeight - mh - 8 : y) + 'px';
}

export function hideContextMenu() {
  document.getElementById('context-menu').classList.add('hidden');
  state.ctxTarget = null;
}

// ── Session Operations ──────────────────────────────────────────────────

async function refreshProject(projectId) {
  delete state.sessions[projectId];
  const fresh = await loadSessions(projectId);
  const container = document.querySelector(`.project-sessions[data-project="${projectId}"]`);
  if (container) renderSessionList(projectId, fresh, container);
}

export async function pinSession() {
  if (!state.ctxTarget) return;
  const { projectId, sessionId } = state.ctxTarget;
  hideContextMenu();
  const s = (state.sessions[projectId] || []).find(s => s.sessionId === sessionId);
  const newPinned = !(s?.pinned);
  await apiPut(`/api/sessions/${encodeURIComponent(projectId)}/${encodeURIComponent(sessionId)}/pin`, { pinned: newPinned });
  if (s) s.pinned = newPinned;
  await refreshProject(projectId);
}

export async function renameSession() {
  if (!state.ctxTarget) return;
  const { projectId, sessionId } = state.ctxTarget;
  hideContextMenu();
  const item = document.querySelector(`.session-item[data-session-id="${sessionId}"][data-project-id="${projectId}"]`);
  if (!item) return;
  const titleEl = item.querySelector('.session-title');
  const currentName = titleEl.textContent;
  const input = document.createElement('input');
  input.className = 'session-rename-input';
  input.value = currentName;
  titleEl.style.display = 'none';
  titleEl.parentNode.insertBefore(input, titleEl);
  input.focus();
  input.select();
  let done = false;
  const save = async () => {
    if (done) return; done = true;
    const name = input.value.trim();
    input.remove(); titleEl.style.display = '';
    if (name && name !== currentName) {
      await apiPut(`/api/sessions/${encodeURIComponent(projectId)}/${encodeURIComponent(sessionId)}/rename`, { name });
      titleEl.textContent = name; titleEl.title = name;
      const s = (state.sessions[projectId] || []).find(s => s.sessionId === sessionId);
      if (s) { s.customName = name; s.summary = name; }
    }
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); save(); } if (e.key === 'Escape') { e.preventDefault(); done = true; input.remove(); titleEl.style.display = ''; } });
  input.addEventListener('blur', () => setTimeout(save, 100));
  input.addEventListener('click', (e) => e.stopPropagation());
}

export async function duplicateSession() {
  if (!state.ctxTarget) return;
  const { projectId, sessionId } = state.ctxTarget;
  hideContextMenu();
  await apiPost(`/api/sessions/${encodeURIComponent(projectId)}/${encodeURIComponent(sessionId)}/duplicate`, {});
  await refreshProject(projectId);
}

export async function moveSession() {
  if (!state.ctxTarget) return;
  const { projectId, sessionId } = state.ctxTarget;
  hideContextMenu();
  const list = document.getElementById('move-project-list');
  list.innerHTML = '';
  for (const p of state.projects) {
    const btn = document.createElement('button');
    btn.className = `move-list-item ${p.id === projectId ? 'current' : ''}`;
    btn.textContent = shortenPath(p.projectPath) + (p.id === projectId ? ' (current)' : '');
    if (p.id !== projectId) btn.addEventListener('click', async () => {
      await apiPost(`/api/sessions/${encodeURIComponent(projectId)}/${encodeURIComponent(sessionId)}/move`, { targetProject: p.id });
      hideModal('move-modal');
      await refreshProject(projectId);
      if (state.currentSession === sessionId) { state.currentProject = null; state.currentSession = null; }
    });
    list.appendChild(btn);
  }
  showModal('move-modal');
}

export async function deleteSession() {
  if (!state.ctxTarget) return;
  const { projectId, sessionId } = state.ctxTarget;
  hideContextMenu();
  const s = (state.sessions[projectId] || []).find(s => s.sessionId === sessionId);
  document.getElementById('delete-session-name').textContent = s?.customName || s?.summary || sessionId.slice(0, 8);
  showModal('delete-modal');
  const btn = document.getElementById('delete-confirm');
  const nb = btn.cloneNode(true); btn.parentNode.replaceChild(nb, btn);
  nb.addEventListener('click', async () => {
    await apiDelete(`/api/sessions/${encodeURIComponent(projectId)}/${encodeURIComponent(sessionId)}`);
    hideModal('delete-modal');
    await refreshProject(projectId);
    if (state.currentSession === sessionId) { state.currentProject = null; state.currentSession = null; }
  });
}

// ── Feature 7: Bulk operations ─────────────────────────────────────────

if (!state._bulkSelected) state._bulkSelected = new Set();
if (!state._bulkMode) state._bulkMode = false;

export function toggleBulkMode(enable) {
  state._bulkMode = enable !== undefined ? enable : !state._bulkMode;
  state._bulkSelected.clear();
  // Toggle visual class on all session items
  document.querySelectorAll('.session-item').forEach(el => el.classList.remove('bulk-selected'));
  document.getElementById('sidebar')?.classList.toggle('bulk-mode', state._bulkMode);
  updateBulkBar();
  if (state._bulkMode) {
    // Auto-select the context target
    if (state.ctxTarget) {
      const key = `${state.ctxTarget.projectId}__${state.ctxTarget.sessionId}`;
      state._bulkSelected.add(key);
      const item = document.querySelector(`.session-item[data-session-id="${state.ctxTarget.sessionId}"][data-project-id="${state.ctxTarget.projectId}"]`);
      if (item) item.classList.add('bulk-selected');
      updateBulkBar();
    }
  }
}

function updateBulkBar() {
  let bar = document.getElementById('bulk-bar');
  if (!state._bulkMode) { if (bar) bar.remove(); return; }
  const count = state._bulkSelected.size;
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'bulk-bar';
    bar.innerHTML = `<span class="bulk-count"></span><button class="btn btn-sm btn-danger-sm" data-bulk="delete">Delete Selected</button><button class="btn btn-sm bulk-cancel">Done</button>`;
    bar.querySelector('[data-bulk="delete"]').addEventListener('click', bulkDelete);
    bar.querySelector('.bulk-cancel').addEventListener('click', () => toggleBulkMode(false));
    document.getElementById('sidebar').querySelector('.sidebar-full')?.appendChild(bar);
  }
  bar.querySelector('.bulk-count').textContent = count ? `${count} selected` : 'Select sessions';
}

async function bulkDelete() {
  if (!state._bulkSelected.size) return;
  if (!confirm(`Delete ${state._bulkSelected.size} session(s)? This cannot be undone.`)) return;
  const sessions = [...state._bulkSelected].map(k => {
    const idx = k.indexOf('__');
    return { project: k.slice(0, idx), session: k.slice(idx + 2) };
  });
  try {
    const result = await apiPost('/api/sessions/batch', { action: 'delete', sessions });
    const failed = (result.results || []).filter(r => r.error);
    if (failed.length) {
      const { toast } = await import('./toast.js');
      toast(`${failed.length} session(s) failed to delete`, 'error');
    }
    const projects = new Set(sessions.map(s => s.project));
    state._bulkSelected.clear();
    toggleBulkMode(false);
    for (const pid of projects) await refreshProject(pid);
  } catch (e) {
    const { toast } = await import('./toast.js');
    toast(`Batch delete failed: ${e.message}`, 'error');
  }
}

// ── Resize ──────────────────────────────────────────────────────────────

export function setupResize() {
  const handle = document.getElementById('resize-handle');
  const sidebar = document.getElementById('sidebar');
  handle.addEventListener('mousedown', (e) => {
    const startX = e.clientX, startW = sidebar.offsetWidth;
    handle.classList.add('active');
    const drag = (e) => { sidebar.style.width = Math.max(220, Math.min(500, startW + e.clientX - startX)) + 'px'; };
    const stop = () => { handle.classList.remove('active'); document.removeEventListener('mousemove', drag); document.removeEventListener('mouseup', stop); };
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stop);
    e.preventDefault();
  });
}
