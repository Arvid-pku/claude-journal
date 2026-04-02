import { state, api, apiPut, apiPost, apiDelete, onSessionSelect,
  escapeHtml, shortenPath, formatDateRange, formatNum, formatCost, truncateText,
  showModal, hideModal } from './state.js';

// ── Render ──────────────────────────────────────────────────────────────

export function renderSidebar() {
  const nav = document.getElementById('project-list');
  nav.innerHTML = '';
  for (const project of state.projects) {
    const group = document.createElement('div');
    group.className = 'project-group';
    group.innerHTML = `
      <div class="project-header collapsed" data-project="${project.id}">
        <span class="arrow">&#9654;</span>
        <span>${escapeHtml(shortenPath(project.projectPath))}</span>
        <span style="margin-left:auto;font-size:10px;color:var(--text-muted)">${project.sessionCount}</span>
      </div>
      <div class="project-sessions" data-project="${project.id}"></div>`;
    group.querySelector('.project-header').addEventListener('click', (e) => toggleProject(project.id, e.currentTarget));
    nav.appendChild(group);
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

  item.addEventListener('click', (e) => { if (!e.target.closest('.session-menu-btn') && onSessionSelect) onSessionSelect(projectId, s.sessionId); });
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
