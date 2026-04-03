import { state, api, escapeHtml, shortenPath, formatTime } from './state.js';
import { navigate } from './router.js';

let debounceTimer = null;
let onNavigate = null;

export function setSearchNavigate(fn) { onNavigate = fn; }

export function openSearch(initialQuery = '') {
  const modal = document.getElementById('search-modal');
  modal.classList.remove('hidden');
  const input = document.getElementById('global-search-input');
  input.value = initialQuery;
  input.focus();
  // Show/hide advanced filters based on setting
  const filters = document.getElementById('search-filters');
  if (filters) filters.classList.toggle('hidden', !state.settings.advancedSearch);
  if (initialQuery) doSearch(initialQuery);
}

export function closeSearch() {
  document.getElementById('search-modal').classList.add('hidden');
}

export function setupSearch() {
  const input = document.getElementById('global-search-input');
  const results = document.getElementById('search-results');

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => doSearch(input.value), 250);
  });

  // Advanced filter changes trigger search
  document.querySelectorAll('#search-filters select, #search-filters input').forEach(el => {
    el.addEventListener('change', () => doSearch(input.value));
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeSearch(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = results.querySelectorAll('.search-result');
      const active = results.querySelector('.search-result.active');
      let idx = [...items].indexOf(active);
      if (e.key === 'ArrowDown') idx = Math.min(idx + 1, items.length - 1);
      else idx = Math.max(idx - 1, 0);
      items.forEach(i => i.classList.remove('active'));
      if (items[idx]) { items[idx].classList.add('active'); items[idx].scrollIntoView({ block: 'nearest' }); }
    }
    if (e.key === 'Enter') {
      const active = results.querySelector('.search-result.active');
      if (active) active.click();
    }
  });

  document.getElementById('search-modal').querySelector('.modal-backdrop').addEventListener('click', closeSearch);
}

async function doSearch(query) {
  const q = query.trim();
  const results = document.getElementById('search-results');
  const count = document.getElementById('search-result-count');

  if (q.length < 2) { results.innerHTML = '<div class="search-empty">Type at least 2 characters</div>'; count.textContent = ''; return; }

  // Build query params with advanced filters
  const params = new URLSearchParams({ q, limit: 50 });
  if (state.settings.advancedSearch) {
    const role = document.getElementById('search-filter-role')?.value;
    const tool = document.getElementById('search-filter-tool')?.value;
    const from = document.getElementById('search-filter-from')?.value;
    const to = document.getElementById('search-filter-to')?.value;
    if (role) params.set('role', role);
    if (tool) params.set('tool', tool);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
  }

  try {
    const data = await api(`/api/search?${params}`);
    count.textContent = `${data.length} result${data.length !== 1 ? 's' : ''}`;

    if (!data.length) { results.innerHTML = '<div class="search-empty">No results found</div>'; return; }

    results.innerHTML = data.map((r, i) => {
      const snippet = highlightMatch(escapeHtml(r.snippet), q);
      const role = r.role === 'user' ? 'You' : 'Claude';
      const time = r.ts ? formatTime(r.ts) : '';
      const name = r.sessionName || r.sessionId.slice(0, 8);
      return `<div class="search-result ${i === 0 ? 'active' : ''}" data-project="${escapeHtml(r.projectId)}" data-session="${r.sessionId}" data-uuid="${r.uuid}">
        <div class="search-result-header"><span class="search-result-role ${r.role}">${role}</span><span class="search-result-session">${escapeHtml(name)}</span><span class="search-result-time">${time}</span></div>
        <div class="search-result-snippet">${snippet}</div>
      </div>`;
    }).join('');

    results.querySelectorAll('.search-result').forEach(el => {
      el.addEventListener('click', () => {
        closeSearch();
        const { project, session, uuid } = el.dataset;
        navigate('session', { projectId: project, sessionId: session });
        if (onNavigate) onNavigate(project, session, uuid);
      });
    });
  } catch { results.innerHTML = '<div class="search-empty">Search failed</div>'; }
}

function highlightMatch(html, query) {
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return html.replace(re, '<mark>$1</mark>');
}
