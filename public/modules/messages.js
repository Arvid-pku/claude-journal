import { state, api, apiPut, IC, afterRender, onAnnotationChange,
  escapeHtml, formatTime, formatDate, formatNum, formatCost, renderMarkdown, truncate, truncateText, shortToolName, computeLineDiff } from './state.js';

// ── Process raw JSONL into display messages ─────────────────────────────

export function processMessages(raw) {
  const meaningful = raw.filter(m => m.type === 'user' || m.type === 'assistant');
  const byUuid = new Map();
  for (const m of meaningful) { if (m.uuid) byUuid.set(m.uuid, m); }
  const sorted = [...byUuid.values()].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const toolResults = new Map();
  for (const m of sorted) {
    if (m.type === 'user' && Array.isArray(m.message)) {
      for (const item of m.message) {
        if (item.type === 'tool_result') toolResults.set(item.tool_use_id, { content: typeof item.content === 'string' ? item.content : JSON.stringify(item.content), isError: item.is_error || false });
      }
    }
  }

  const display = [];
  for (const m of sorted) {
    if (m.type === 'user') {
      const msg = m.message;
      if (msg?.role === 'user' && typeof msg.content === 'string') {
        display.push({ uuid: m.uuid, role: 'user', content: msg.content, timestamp: m.timestamp, cwd: m.cwd, version: m.version });
      }
    } else if (m.type === 'assistant') {
      const msg = m.message;
      if (!msg?.content) continue;
      const parts = [];
      for (const block of (Array.isArray(msg.content) ? msg.content : [])) {
        if (block.type === 'text' && block.text) parts.push({ type: 'text', content: block.text });
        else if (block.type === 'tool_use') parts.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input, result: toolResults.get(block.id) || null });
        else if (block.type === 'thinking' && block.thinking && state.settings.showThinking) {
          const t = block.thinking;
          if (!(t.length > 20 && /^[A-Za-z0-9+/=\s]+$/.test(t) && t.length > 200)) parts.push({ type: 'thinking', content: t });
        }
      }
      if (parts.length) display.push({ uuid: m.uuid, role: 'assistant', parts, timestamp: m.timestamp, model: msg.model, usage: msg.usage, provider: msg.provider });
    }
  }
  return display;
}

// ── Render messages ─────────────────────────────────────────────────────

export function renderMessages() {
  const container = document.getElementById('messages');
  container.innerHTML = '';

  let msgs = state.displayMessages;
  if (state.favoritesOnly) msgs = msgs.filter(m => state.annotations[m.uuid]?.favorite);
  if (state.highlightsOnly) msgs = msgs.filter(m => state.annotations[m.uuid]?.highlight);
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    msgs = msgs.filter(m => m.role === 'user' ? m.content.toLowerCase().includes(q) : m.parts?.some(p => (p.type === 'text' && p.content.toLowerCase().includes(q)) || (p.type === 'tool_use' && p.name.toLowerCase().includes(q))));
  }

  // Message type filters
  const f = state.messageFilters;
  msgs = msgs.filter(m => {
    if (m.role === 'user') return f.human;
    if (m.role === 'assistant') {
      // Check if any visible parts remain after filtering
      const hasParts = m.parts?.some(p => isPartVisible(p, f));
      return hasParts;
    }
    return true;
  });

  if (!msgs.length) { container.innerHTML = `<div id="empty-state"><p style="color:var(--text-secondary)">${state.favoritesOnly ? 'No favorites' : state.searchQuery ? 'No matches' : 'No messages'}</p></div>`; return; }

  const frag = document.createDocumentFragment();

  // Feature 5: Session timeline summary
  if (state.settings.showSessionTimeline && !state.searchQuery && !state.favoritesOnly && !state.highlightsOnly) {
    frag.appendChild(createTimelineSummary(msgs));
  }

  for (const msg of msgs) frag.appendChild(createMessageEl(msg));
  container.appendChild(frag);

  // Feature 1: Code block copy buttons (post-process rendered HTML)
  if (state.settings.showCodeCopyBtn) addCodeCopyButtons(container);

  // Check if any messages have side comments → adjust layout
  const hasComments = container.querySelector('.msg-comment') !== null;
  container.classList.toggle('has-comments', hasComments);

  updateStats(msgs.length);
  afterRender();
}

function createMessageEl(msg) {
  const div = document.createElement('div');
  div.className = `message ${msg.role}-msg`;
  div.dataset.uuid = msg.uuid;

  const anno = state.annotations[msg.uuid] || {};
  const inner = document.createElement('div');
  inner.className = `message-inner ${anno.highlight ? 'highlighted' : ''} ${anno.favorite ? 'favorited' : ''}`;
  if (anno.highlight) inner.style.cssText = `--highlight-color:${anno.highlight}`;

  // Feature 10: Avatar
  if (state.settings.showAvatars) {
    const avatar = document.createElement('span');
    avatar.className = `msg-avatar ${msg.role}`;
    avatar.textContent = msg.role === 'user' ? 'Y' : (msg.provider === 'codex' ? 'X' : 'C');
    inner.appendChild(avatar);
  }

  // Header
  const header = document.createElement('div');
  header.className = 'msg-header';
  let costHtml = '';
  if (msg.usage) {
    const p = getModelPricing(msg.model);
    if (p) {
      const c = ((msg.usage.input_tokens||0)*p.input + (msg.usage.output_tokens||0)*p.output) / 1e6;
      if (c > 0.001) costHtml = `<span class="msg-cost">${formatCost(c)}</span>`;
    }
  }
  const timeHtml = state.settings.showTimestamps ? `<span class="msg-time">${formatTime(msg.timestamp)}</span>` : '';
  const collapseIcon = state.settings.enableCollapse ? '<span class="collapse-icon">&#9654;</span>' : '';
  const roleName = msg.role === 'user' ? 'You' : (msg.provider === 'codex' ? 'Codex' : 'Claude');
  header.innerHTML = `${collapseIcon}<span class="msg-role">${roleName}</span>${msg.model ? `<span class="msg-model">${msg.model}</span>` : ''}${state.settings.showCost ? costHtml : ''}${timeHtml}`;

  // Feature 2: Collapse
  if (state.settings.enableCollapse) {
    header.classList.add('collapsible');
    header.addEventListener('click', (e) => {
      if (e.target.closest('.msg-actions, button')) return;
      inner.classList.toggle('msg-collapsed');
    });
  }

  // Feature 15: Tags
  if (state.settings.enableTags) {
    const tags = anno.tags || [];
    const tagRow = document.createElement('div');
    tagRow.className = 'msg-tags';
    const annoApi = `/api/annotations/${encodeURIComponent(state.currentProject)}/${encodeURIComponent(state.currentSession)}`;
    const removeTag = (t, pill) => {
      const cur = state.annotations[msg.uuid]?.tags || [];
      const newTags = cur.filter(x => x !== t);
      if (!state.annotations[msg.uuid]) state.annotations[msg.uuid] = {};
      state.annotations[msg.uuid].tags = newTags.length ? newTags : undefined;
      fetch(annoApi, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uuid: msg.uuid, key: 'tags', value: newTags.length ? newTags : false }) })
        .then(() => onAnnotationChange());
      pill.remove();
    };
    tags.forEach(t => {
      const pill = document.createElement('span');
      pill.className = 'tag-pill';
      pill.textContent = t;
      pill.title = 'Click to remove';
      pill.addEventListener('click', (e) => { e.stopPropagation(); removeTag(t, pill); });
      tagRow.appendChild(pill);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'tag-add-btn';
    addBtn.textContent = '+';
    addBtn.title = 'Add tag';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.className = 'tag-input';
      input.placeholder = 'tag...';
      input.maxLength = 30;
      addBtn.replaceWith(input);
      input.focus();
      let saved = false;
      const save = () => {
        if (saved) return;
        saved = true;
        const val = input.value.trim().toLowerCase();
        if (val) {
          const cur = state.annotations[msg.uuid]?.tags || [];
          if (!cur.includes(val)) {
            const newTags = [...cur, val];
            fetch(annoApi, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uuid: msg.uuid, key: 'tags', value: newTags }) })
              .then(() => onAnnotationChange());
            if (!state.annotations[msg.uuid]) state.annotations[msg.uuid] = {};
            state.annotations[msg.uuid].tags = newTags;
            const pill = document.createElement('span');
            pill.className = 'tag-pill';
            pill.textContent = val;
            pill.title = 'Click to remove';
            pill.addEventListener('click', (ev) => { ev.stopPropagation(); removeTag(val, pill); });
            tagRow.insertBefore(pill, input);
          }
        }
        input.replaceWith(addBtn);
      };
      input.addEventListener('keydown', (e2) => { if (e2.key === 'Enter') { e2.preventDefault(); save(); } if (e2.key === 'Escape') { saved = true; input.replaceWith(addBtn); } });
      input.addEventListener('blur', save);
    });
    tagRow.appendChild(addBtn);
    header.after(tagRow); // insert after header, before body — we'll add to inner later
    inner._tagRow = tagRow;
  }

  // Body
  const body = document.createElement('div');
  body.className = 'msg-body';
  if (msg.role === 'user') {
    body.innerHTML = renderMarkdown(stripTags(msg.content));
  } else {
    const f = state.messageFilters;
    const visibleParts = msg.parts.filter(p => isPartVisible(p, f));

    // Feature 4: Group consecutive tool calls
    if (state.settings.groupToolCalls) {
      const grouped = groupToolParts(visibleParts);
      for (const item of grouped) {
        if (item.type === 'tool_group') body.appendChild(createToolGroup(item.tools));
        else if (item.type === 'text') { const d = document.createElement('div'); d.innerHTML = renderMarkdown(stripTags(item.content)); body.appendChild(d); }
        else if (item.type === 'tool_use') body.appendChild(createToolBlock(item));
        else if (item.type === 'thinking') body.appendChild(createThinkingBlock(item.content));
      }
    } else {
      for (const part of visibleParts) {
        if (part.type === 'text') { const d = document.createElement('div'); d.innerHTML = renderMarkdown(stripTags(part.content)); body.appendChild(d); }
        else if (part.type === 'tool_use') body.appendChild(createToolBlock(part));
        else if (part.type === 'thinking') body.appendChild(createThinkingBlock(part.content));
      }
    }
  }

  // Token usage
  if (msg.usage && state.settings.showTokenUsage) {
    const u = document.createElement('div');
    u.className = 'token-usage';
    u.innerHTML = `<span>in: ${formatNum(msg.usage.input_tokens||0)}</span><span>out: ${formatNum(msg.usage.output_tokens||0)}</span>${msg.usage.cache_read_input_tokens ? `<span>cached: ${formatNum(msg.usage.cache_read_input_tokens)}</span>` : ''}`;
    body.appendChild(u);
  }

  // Actions
  const actions = document.createElement('div');
  actions.className = 'msg-actions';
  const hasComment = !!(anno.comment || anno.note);
  actions.innerHTML = `
    <button class="act-fav ${anno.favorite ? 'active' : ''}" title="Favorite" data-action="favorite" data-uuid="${msg.uuid}">${IC.star}</button>
    <button title="Highlight" data-action="highlight" data-uuid="${msg.uuid}">${IC.highlight}</button>
    <button class="${hasComment ? 'active' : ''}" title="Comment" data-action="comment" data-uuid="${msg.uuid}">${IC.note}</button>
    <button title="Copy" data-action="copy" data-uuid="${msg.uuid}">${IC.copy}</button>
    <button title="Edit" data-action="edit" data-uuid="${msg.uuid}">${IC.edit}</button>
    <button class="act-del" title="Delete message" data-action="delete" data-uuid="${msg.uuid}">${IC.trash}</button>`;

  inner.appendChild(header);
  if (inner._tagRow) inner.appendChild(inner._tagRow);
  inner.appendChild(body); inner.appendChild(actions);
  div.appendChild(inner);

  // Side comment (Google Docs style) — one unified system
  const commentText = anno.comment || anno.note || '';
  if (commentText) {
    const comment = document.createElement('div');
    comment.className = 'msg-comment';
    if (anno.highlight) comment.style.setProperty('--comment-color', anno.highlight);
    const lines = commentText.split('\n').length;
    const h = Math.min(Math.max(60, lines * 20 + 20), window.innerHeight * 0.6);
    comment.innerHTML = `<textarea class="comment-input" data-uuid="${msg.uuid}" style="height:${h}px">${escapeHtml(commentText)}</textarea><button class="comment-delete" data-action="delete-comment" data-uuid="${msg.uuid}" title="Remove">&times;</button>`;
    div.appendChild(comment);
  }

  return div;
}

// ── Filter helpers ──────────────────────────────────────────────────────

function toolFilterCategory(name) {
  if (name === 'Read') return 'tool-read';
  if (name === 'Edit' || name === 'Write') return 'tool-edit';
  if (name === 'Bash') return 'tool-bash';
  if (name === 'Grep' || name === 'Glob') return 'tool-search';
  if (name === 'WebFetch' || name === 'WebSearch') return 'tool-web';
  if (name === 'Agent') return 'subagent';
  return 'tool-other';
}

function isPartVisible(part, f) {
  if (part.type === 'text') return f.assistant;
  if (part.type === 'thinking') return f.thinking;
  if (part.type === 'tool_use') {
    if (!f.tool) return false;
    const cat = toolFilterCategory(part.name);
    if (cat === 'subagent') return f.subagent;
    return f[cat] !== false;
  }
  return true;
}

// ── Tool blocks ─────────────────────────────────────────────────────────

function createToolBlock(tool) {
  const block = document.createElement('div');
  block.className = 'tool-block';
  const desc = getToolDescription(tool);
  const icon = getToolIcon(tool.name);
  const isAgent = tool.name === 'Agent';
  const isEdit = tool.name === 'Edit';

  const expanded = state.settings.defaultToolExpanded;
  const maxOut = state.settings.maxToolOutput || 5000;

  // Feature 3: Diff view for Edit
  let inputHtml;
  if (isEdit && state.settings.showDiffView && tool.input?.old_string && tool.input?.new_string) {
    const filePath = tool.input.file_path || '';
    const diff = computeLineDiff(tool.input.old_string, tool.input.new_string);
    inputHtml = `<div class="diff-view"><div class="diff-file-header">${escapeHtml(filePath.split('/').pop() || filePath)}</div>`
      + diff.map(d => {
        const prefix = d.type === 'add' ? '+' : d.type === 'remove' ? '-' : ' ';
        return `<div class="diff-line ${d.type}">${prefix} ${escapeHtml(d.text)}</div>`;
      }).join('') + '</div>';
  } else {
    inputHtml = `<div class="tool-result-label">Input</div><div class="tool-input">${escapeHtml(formatToolInput(tool))}</div>`;
  }

  block.innerHTML = `
    <div class="tool-header ${expanded ? 'expanded' : ''}" onclick="this.classList.toggle('expanded')">
      <span class="tool-icon">${icon}</span>
      <span class="tool-name">${escapeHtml(tool.name)}</span>
      <span class="tool-desc">${escapeHtml(desc)}</span>
      <span class="tool-arrow">&#9654;</span>
    </div>
    <div class="tool-body">
      ${inputHtml}
      ${tool.result ? `<div class="tool-result-label">Output</div><div class="tool-output ${tool.result.isError ? 'error' : ''}">${escapeHtml(truncate(tool.result.content, maxOut))}</div>` : ''}
    </div>`;

  // Subagent expansion for Agent tool calls
  if (isAgent && state.currentSession) {
    const agentDesc = tool.input?.description || '';
    const expandBtn = document.createElement('div');
    expandBtn.className = 'subagent-expand';
    expandBtn.innerHTML = `<button class="subagent-toggle" data-desc="${escapeHtml(agentDesc)}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/></svg> View subagent conversation</button>`;
    expandBtn.querySelector('.subagent-toggle').addEventListener('click', (e) => loadSubagentInline(e.target.closest('.subagent-toggle'), agentDesc));
    block.querySelector('.tool-body').appendChild(expandBtn);
  }

  return block;
}

async function loadSubagentInline(btn, description) {
  const sessionId = state.currentSession;
  const projectId = state.currentProject;

  // Load subagent index if not cached
  if (!state.subagentIndex[sessionId]) {
    try {
      state.subagentIndex[sessionId] = await api(`/api/subagents/${encodeURIComponent(projectId)}/${encodeURIComponent(sessionId)}`);
    } catch { state.subagentIndex[sessionId] = []; }
  }

  // Match by description
  const agents = state.subagentIndex[sessionId];
  const match = agents.find(a => a.description === description) || agents.find(a => description.includes(a.description) || a.description.includes(description));
  if (!match) { btn.textContent = 'No subagent found'; return; }

  btn.textContent = 'Loading...';

  // Load and process messages
  if (!state.subagentMsgs[match.hash]) {
    try {
      const raw = await api(`/api/subagents/${encodeURIComponent(projectId)}/${encodeURIComponent(sessionId)}/${match.hash}`);
      state.subagentMsgs[match.hash] = processMessages(raw);
    } catch { btn.textContent = 'Failed to load'; return; }
  }

  const msgs = state.subagentMsgs[match.hash];
  const container = document.createElement('div');
  container.className = 'subagent-conversation';
  container.innerHTML = `<div class="subagent-header"><span class="subagent-type">${escapeHtml(match.agentType)}</span><span class="subagent-desc">${escapeHtml(match.description)}</span><span class="subagent-count">${msgs.length} messages</span></div>`;

  for (const msg of msgs) {
    const el = document.createElement('div');
    el.className = `sub-msg sub-${msg.role}`;
    const roleLabel = msg.role === 'user' ? 'Prompt' : 'Agent';
    let bodyHtml = '';
    if (msg.role === 'user') {
      bodyHtml = renderMarkdown(msg.content);
    } else {
      for (const part of msg.parts) {
        if (part.type === 'text') bodyHtml += renderMarkdown(part.content);
        else if (part.type === 'tool_use') {
          const d = getToolDescription(part);
          bodyHtml += `<div class="sub-tool"><span class="tool-icon">${getToolIcon(part.name)}</span><span class="tool-name">${escapeHtml(part.name)}</span> <span class="tool-desc">${escapeHtml(d)}</span></div>`;
        }
      }
    }
    el.innerHTML = `<div class="sub-msg-role">${roleLabel}</div><div class="sub-msg-body">${bodyHtml}</div>`;
    container.appendChild(el);
  }

  // Replace button with conversation
  const parent = btn.closest('.subagent-expand');
  parent.innerHTML = '';
  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'subagent-toggle';
  collapseBtn.textContent = 'Hide subagent conversation';
  collapseBtn.addEventListener('click', () => {
    container.classList.toggle('hidden');
    collapseBtn.textContent = container.classList.contains('hidden') ? 'Show subagent conversation' : 'Hide subagent conversation';
  });
  parent.appendChild(collapseBtn);
  parent.appendChild(container);
}

function createThinkingBlock(content) {
  const block = document.createElement('div');
  block.className = 'thinking-block';
  block.innerHTML = `<button class="thinking-toggle" onclick="this.nextElementSibling.classList.toggle('expanded');this.querySelector('.arrow').textContent=this.nextElementSibling.classList.contains('expanded')?'\\u25BC':'\\u25B6'"><span class="arrow">&#9654;</span> Thinking</button><div class="thinking-content">${escapeHtml(content)}</div>`;
  return block;
}

// ── Tool helpers ────────────────────────────────────────────────────────

function getToolDescription(tool) {
  const i = tool.input || {};
  switch (tool.name) {
    case 'Bash': return i.description || i.command?.slice(0, 60) || '';
    case 'Read': case 'Write': case 'Edit': return i.file_path?.split('/').pop() || '';
    case 'Glob': return i.pattern || '';
    case 'Grep': return i.pattern || '';
    case 'Agent': return i.description || '';
    case 'Skill': return i.skill || '';
    default: return '';
  }
}

function getToolIcon(name) {
  return { Bash:'$', Read:'R', Write:'W', Edit:'E', Glob:'*', Grep:'/', Agent:'A', Skill:'S', WebFetch:'F', WebSearch:'Q' }[name] || (name?.[0]) || '?';
}

function formatToolInput(tool) {
  const i = tool.input || {};
  switch (tool.name) {
    case 'Bash': return i.command || JSON.stringify(i, null, 2);
    case 'Read': return i.file_path || JSON.stringify(i, null, 2);
    case 'Write': return `${i.file_path || ''}\n---\n${truncate(i.content || '', 3000)}`;
    case 'Edit': return `${i.file_path || ''}\n--- old ---\n${truncate(i.old_string || '', 1500)}\n--- new ---\n${truncate(i.new_string || '', 1500)}`;
    case 'Glob': return `pattern: ${i.pattern || ''}\npath: ${i.path || '.'}`;
    case 'Grep': return `pattern: ${i.pattern || ''}\npath: ${i.path || '.'}`;
    case 'Agent': return `type: ${i.subagent_type || 'general'}\n${i.prompt || ''}`;
    default: return JSON.stringify(i, null, 2);
  }
}

// ── Content helpers ─────────────────────────────────────────────────────

function stripTags(text) {
  if (!text || !state.settings.hideSystemTags) return text;
  // Strip <system-reminder>...</system-reminder>, <available-deferred-tools>...</available-deferred-tools>, etc.
  return text.replace(/<(system-reminder|available-deferred-tools|task-notification|local-command-caveat|command-name)[^>]*>[\s\S]*?<\/\1>/gi, '').trim();
}

// ── Cost helpers ────────────────────────────────────────────────────────

const PRICING = {
  'claude-opus-4': { input: 15, output: 75 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-haiku-4': { input: 0.8, output: 4 },
};

function getModelPricing(model) {
  if (!model) return null;
  for (const [prefix, p] of Object.entries(PRICING)) { if (model.startsWith(prefix)) return p; }
  return null;
}

// ── Session info ────────────────────────────────────────────────────────

export function updateSessionInfo() {
  const titleEl = document.getElementById('session-title');
  const metaEl = document.getElementById('session-meta');
  const sessions = state.sessions[state.currentProject] || [];
  const session = sessions.find(s => s.sessionId === state.currentSession);
  titleEl.textContent = session?.customName || session?.summary || state.currentSession?.slice(0, 8) || '';

  const total = state.displayMessages.length;
  const first = state.displayMessages[0], last = state.displayMessages[total - 1];
  let meta = `${total} messages`;
  if (first && last) meta += ` \u00b7 ${formatDate(first.timestamp)} \u2014 ${formatTime(last.timestamp)}`;
  if (session) {
    const tok = (session.inputTok || 0) + (session.outputTok || 0);
    if (tok) meta += ` \u00b7 ${formatNum(tok)} tokens`;
    if (session.cost) meta += ` \u00b7 ${formatCost(session.cost)}`;
  }
  metaEl.textContent = meta;
}

export function updateStats(count) {
  const el = document.getElementById('status-stats');
  const favCount = Object.values(state.annotations).filter(a => a.favorite).length;
  el.textContent = `${count} messages${favCount ? ` \u00b7 ${favCount} favorites` : ''}`;
}

// ── Feature 1: Code copy buttons ────────────────────────────────────────

function addCodeCopyButtons(container) {
  container.querySelectorAll('pre code').forEach(codeEl => {
    const pre = codeEl.parentElement;
    if (pre.querySelector('.code-copy-btn')) return;
    pre.style.position = 'relative';
    const btn = document.createElement('button');
    btn.className = 'code-copy-btn';
    btn.innerHTML = IC.copy;
    btn.title = 'Copy code';
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(codeEl.textContent);
      btn.innerHTML = IC.check;
      btn.classList.add('copied');
      setTimeout(() => { btn.innerHTML = IC.copy; btn.classList.remove('copied'); }, 1500);
    });
    pre.appendChild(btn);
  });
}

// ── Feature 4: Tool call grouping ───────────────────────────────────────

function groupToolParts(parts) {
  const result = [];
  let toolRun = [];
  for (const p of parts) {
    if (p.type === 'tool_use') { toolRun.push(p); }
    else {
      if (toolRun.length > 2) result.push({ type: 'tool_group', tools: [...toolRun] });
      else toolRun.forEach(t => result.push(t));
      toolRun = [];
      result.push(p);
    }
  }
  if (toolRun.length > 2) result.push({ type: 'tool_group', tools: toolRun });
  else toolRun.forEach(t => result.push(t));
  return result;
}

function createToolGroup(tools) {
  const counts = {};
  tools.forEach(t => { counts[t.name] = (counts[t.name] || 0) + 1; });
  const summary = Object.entries(counts).map(([n, c]) => `${n} \u00d7${c}`).join(', ');

  const group = document.createElement('div');
  group.className = 'tool-group';
  group.innerHTML = `<div class="tool-group-summary"><span class="tool-group-count">${tools.length} tool calls</span><span class="tool-group-detail">${escapeHtml(summary)}</span><span class="tool-arrow">&#9654;</span></div>`;
  const details = document.createElement('div');
  details.className = 'tool-group-details hidden';
  tools.forEach(t => details.appendChild(createToolBlock(t)));
  group.appendChild(details);
  group.querySelector('.tool-group-summary').addEventListener('click', () => {
    details.classList.toggle('hidden');
    group.querySelector('.tool-group-summary').classList.toggle('expanded');
  });
  return group;
}

// ── Feature 5: Session timeline summary ─────────────────────────────────

function createTimelineSummary(msgs) {
  const firstPrompt = msgs.find(m => m.role === 'user')?.content?.slice(0, 200) || '';
  const toolCounts = {};
  const files = new Set();
  let totalTools = 0;
  for (const msg of msgs) {
    if (msg.role !== 'assistant') continue;
    for (const p of msg.parts || []) {
      if (p.type === 'tool_use') {
        toolCounts[p.name] = (toolCounts[p.name] || 0) + 1;
        totalTools++;
        const fp = p.input?.file_path;
        if (fp) files.add(fp.split('/').pop());
      }
    }
  }
  const topTools = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCount = topTools[0]?.[1] || 1;
  const userCount = msgs.filter(m => m.role === 'user').length;
  const assistCount = msgs.filter(m => m.role === 'assistant').length;
  const first = msgs[0], last = msgs[msgs.length - 1];
  const dateRange = first && last ? `${formatDate(first.timestamp)} \u2014 ${formatTime(last.timestamp)}` : '';

  const el = document.createElement('div');
  el.className = 'session-timeline';
  el.innerHTML = `
    <div class="timeline-header">
      <span class="timeline-title">Session Overview</span>
      <span class="timeline-date">${dateRange}</span>
      <button class="timeline-close" title="Hide">&times;</button>
    </div>
    ${firstPrompt ? `<div class="timeline-prompt">"${escapeHtml(firstPrompt.slice(0, 150))}${firstPrompt.length > 150 ? '...' : ''}"</div>` : ''}
    <div class="timeline-stats">
      <span>${userCount} prompts</span><span>${assistCount} responses</span><span>${totalTools} tool calls</span>
    </div>
    ${topTools.length ? `<div class="timeline-tools">${topTools.map(([name, count]) =>
      `<div class="timeline-tool"><span class="timeline-tool-name" title="${escapeHtml(name)}">${escapeHtml(shortToolName(name))}</span><div class="timeline-tool-bar"><div style="width:${Math.round(count/maxCount*100)}%"></div></div><span class="timeline-tool-count">${count}</span></div>`
    ).join('')}</div>` : ''}
    ${files.size ? `<div class="timeline-files">${[...files].slice(0, 12).map(f => `<span class="timeline-file-pill">${escapeHtml(f)}</span>`).join('')}${files.size > 12 ? `<span class="timeline-file-pill">+${files.size - 12} more</span>` : ''}</div>` : ''}`;
  el.querySelector('.timeline-close').addEventListener('click', () => el.remove());
  return el;
}

// ── Feature 9: Loading skeletons ────────────────────────────────────────

export function showLoadingSkeleton() {
  if (!state.settings.showSkeletons) return;
  const container = document.getElementById('messages');
  container.innerHTML = Array.from({ length: 6 }, (_, i) =>
    `<div class="skeleton-msg ${i % 2 === 0 ? 'sk-short' : 'sk-long'}">
      <div class="skeleton-line" style="width:${40 + Math.random() * 30}%"></div>
      <div class="skeleton-line" style="width:${60 + Math.random() * 30}%"></div>
      ${i % 2 ? '<div class="skeleton-line" style="width:' + (30 + Math.random() * 40) + '%"></div>' : ''}
    </div>`
  ).join('');
}

// ── Inline editing ──────────────────────────────────────────────────────

export function startEditing(uuid) {
  const msg = state.displayMessages.find(m => m.uuid === uuid);
  if (!msg) return;
  const el = document.querySelector(`.message[data-uuid="${uuid}"]`);
  if (!el) return;
  const body = el.querySelector('.msg-body');

  let currentText = '';
  if (msg.role === 'user') { currentText = msg.content; }
  else { for (const p of msg.parts) { if (p.type === 'text') { currentText = p.content; break; } } }

  body.innerHTML = '';
  const textarea = document.createElement('textarea');
  textarea.className = 'msg-editor';
  textarea.value = currentText;
  textarea.style.height = Math.max(80, Math.min(400, currentText.split('\n').length * 22 + 20)) + 'px';
  textarea.addEventListener('input', () => { textarea.style.height = 'auto'; textarea.style.height = Math.min(500, textarea.scrollHeight) + 'px'; });

  const actions = document.createElement('div');
  actions.className = 'editor-actions';
  actions.innerHTML = `<span class="editor-warning"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Writes to JSONL</span><button class="btn btn-ghost edit-cancel">Cancel</button><button class="btn btn-primary edit-save">Save</button>`;

  body.appendChild(textarea); body.appendChild(actions);
  textarea.focus();

  actions.querySelector('.edit-cancel').addEventListener('click', () => {
    const scrollTop = document.getElementById('messages').scrollTop;
    renderMessages();
    document.getElementById('messages').scrollTop = scrollTop;
  });
  actions.querySelector('.edit-save').addEventListener('click', async () => {
    const saveBtn = actions.querySelector('.edit-save');
    saveBtn.textContent = 'Saving...'; saveBtn.disabled = true;
    try {
      const reqBody = { content: textarea.value };
      if (msg.role !== 'user') reqBody.partIndex = 0;
      await apiPut(`/api/messages/${encodeURIComponent(state.currentProject)}/${encodeURIComponent(state.currentSession)}/${encodeURIComponent(uuid)}`, reqBody);
      if (msg.role === 'user') msg.content = textarea.value;
      else { for (const p of msg.parts) { if (p.type === 'text') { p.content = textarea.value; break; } } }
      const scrollTop = document.getElementById('messages').scrollTop;
      renderMessages();
      document.getElementById('messages').scrollTop = scrollTop;
    } catch { saveBtn.textContent = 'Error!'; saveBtn.style.background = 'var(--red)'; setTimeout(() => { saveBtn.textContent = 'Save'; saveBtn.style.background = ''; saveBtn.disabled = false; }, 2000); }
  });
}
