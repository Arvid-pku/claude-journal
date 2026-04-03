// ── Shared state ────────────────────────────────────────────────────────

export const DEFAULTS = {
  projectsDir: '~/.claude/projects',
  port: 8086,
  autoOpen: false,
  fontSize: 'default',         // small | default | large
  compactMode: false,
  showTokenUsage: true,
  showCost: true,
  showThinking: false,
  showTimestamps: true,
  hideSystemTags: true,
  defaultToolExpanded: false,
  maxToolOutput: 5000,
  sessionSort: 'newest',       // newest | oldest | messages | cost | alpha
  autoScrollLive: true,
  messageWidth: 900,           // px, max message width
  // Features
  showCodeCopyBtn: true,
  enableCollapse: false,
  showDiffView: true,
  groupToolCalls: true,
  showSessionTimeline: true,
  showAvatars: true,
  showSkeletons: true,
  smoothScrollHighlight: true,
  enableTags: false,
  enableShareHtml: true,
  advancedSearch: true,
  enableBulkOps: false,
  enableProjectDashboard: true,
  providerFilter: 'all',        // all | claude | codex
};

export const state = {
  projects: [],
  sessions: {},
  currentProject: null,
  currentSession: null,
  rawMessages: [],
  displayMessages: [],
  annotations: {},
  liveEnabled: true,
  ws: null,
  searchQuery: '',
  favoritesOnly: false,
  highlightsOnly: false,
  noteTarget: null,
  ctxTarget: null,
  subagentIndex: {},
  subagentMsgs: {},
  memoryCache: {},
  projectsEmpty: null,
  messageFilters: {
    human: true, assistant: true, tool: true, thinking: true, subagent: true,
    'tool-read': true, 'tool-edit': true, 'tool-bash': true, 'tool-search': true, 'tool-web': true, 'tool-other': true,
  },
  settings: { ...DEFAULTS },
};

// Apply visual settings to DOM
export function applySettings() {
  const s = state.settings;
  const root = document.documentElement;
  // Font size
  root.dataset.fontSize = s.fontSize || 'default';
  // Compact mode
  root.classList.toggle('compact', !!s.compactMode);
  // Message width
  root.style.setProperty('--msg-max-width', (s.messageWidth || 900) + 'px');
}

// Callbacks set by main.js to avoid circular imports
export let afterRender = () => {};
export function setAfterRender(fn) { afterRender = fn; }
export let onSessionSelect = null;
export function setOnSessionSelect(fn) { onSessionSelect = fn; }
export let onAnnotationChange = () => {};
export function setOnAnnotationChange(fn) { onAnnotationChange = fn; }

// ── SVG Icons ───────────────────────────────────────────────────────────

const s = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
export const IC = {
  star:      `<svg ${s}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  highlight: `<svg ${s}><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>`,
  note:      `<svg ${s}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="15" y2="10"/></svg>`,
  edit:      `<svg ${s}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
  copy:      `<svg ${s}><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  check:     `<svg ${s}><path d="M20 6 9 17l-5-5"/></svg>`,
  trash:     `<svg ${s}><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
};

// ── API helpers ─────────────────────────────────────────────────────────

async function _fetch(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || r.statusText); }
  return r.json();
}

export const api = (url) => _fetch(url);
export const apiPost = (url, body) => _fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const apiPut = (url, body) => _fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const apiDelete = (url) => _fetch(url, { method: 'DELETE' });

// ── Markdown ────────────────────────────────────────────────────────────

marked.setOptions({
  highlight: (code, lang) => {
    if (lang && hljs.getLanguage(lang)) { try { return hljs.highlight(code, { language: lang }).value; } catch {} }
    return hljs.highlightAuto(code).value;
  },
  breaks: true, gfm: true,
});

export function renderMarkdown(text) { try { return marked.parse(text); } catch { return escapeHtml(text); } }

// ── Utilities ───────────────────────────────────────────────────────────

export function escapeHtml(s) { return s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : ''; }

export function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatDateRange(start, end) {
  if (!start && !end) return '';
  const s = start ? formatDate(start) : '', e = end ? formatDate(end) : '';
  if (s === e || !s || !e) return s || e;
  const ds = new Date(start), de = new Date(end);
  if (ds.getMonth() === de.getMonth() && ds.getFullYear() === de.getFullYear()) return `${s}\u2013${de.getDate()}`;
  return `${s} \u2013 ${e}`;
}

export function formatNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export function formatCost(c) {
  if (!c || c === 0) return '';
  if (c < 0.01) return '<$0.01';
  return '$' + c.toFixed(2);
}

export function truncate(str, max) { return (!str || str.length <= max) ? str : str.slice(0, max) + '\n... (' + (str.length - max) + ' more chars)'; }
export function truncateText(str, max) { return (!str || str.length <= max) ? str : str.slice(0, max) + '...'; }

export function shortenPath(p) {
  if (!p) return 'Unknown';
  const parts = p.replace(/^\/+/, '').split('/');
  return parts.length <= 3 ? parts.join('/') : '.../' + parts.slice(-3).join('/');
}

export function shortToolName(n) {
  if (n.startsWith('mcp__')) { const parts = n.split('__'); return parts[parts.length - 1]; }
  return n;
}

export function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
export function hideModal(id) { document.getElementById(id).classList.add('hidden'); }

// ── Line diff ──────────────────────────────────────────────────────────

export function computeLineDiff(oldText, newText) {
  const oldLines = oldText.split('\n'), newLines = newText.split('\n');
  // Simple LCS-based line diff
  const n = oldLines.length, m = newLines.length;
  const max = n + m;
  if (max > 2000) return [{ type: 'remove', lines: oldLines }, { type: 'add', lines: newLines }]; // too large
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const result = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && oldLines[i] === newLines[j]) { result.push({ type: 'same', text: oldLines[i] }); i++; j++; }
    else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) { result.push({ type: 'add', text: newLines[j] }); j++; }
    else { result.push({ type: 'remove', text: oldLines[i] }); i++; }
  }
  return result;
}
