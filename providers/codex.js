/**
 * Codex provider — reads OpenAI Codex CLI session files
 *
 * Data sources:
 *   ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl  (conversation messages)
 *   ~/.codex/state_5.sqlite                       (thread metadata: title, cwd, model, tokens)
 *   ~/.codex/history.jsonl                        (prompt history)
 *
 * Normalizes Codex messages into the same format Claude Journal expects:
 *   { type: 'user'|'assistant', uuid, timestamp, message: { role, content, model, usage } }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Locate Codex data ──────────────────────────────────────────────────

function getCodexDir() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return process.env.CODEX_DIR || path.join(home, '.codex');
}

function isAvailable() {
  const dir = getCodexDir();
  return fs.existsSync(path.join(dir, 'sessions'));
}

// ── SQLite helper (optional, graceful fallback if sqlite3 not available) ─

let db = null;
let dbLoadAttempted = false;

function getDb() {
  if (dbLoadAttempted) return db;
  dbLoadAttempted = true;
  try {
    const dbPath = path.join(getCodexDir(), 'state_5.sqlite');
    if (!fs.existsSync(dbPath)) return null;
    // Use better-sqlite3 if available, otherwise try native sqlite3 via child_process
    try {
      const Database = require('better-sqlite3');
      db = new Database(dbPath, { readonly: true });
    } catch {
      // Fallback: read via sqlite3 CLI
      db = { _cli: true, _path: dbPath };
    }
  } catch {}
  return db;
}

function queryThreads() {
  clearCacheIfStale();
  if (_cache.threads) return _cache.threads;
  const d = getDb();
  if (!d) { _cache.threads = []; return []; }
  let result = [];
  try {
    if (d._cli) {
      const { execSync } = require('child_process');
      const out = execSync(`sqlite3 "${d._path}" ".mode json" "SELECT id, title, cwd, model, tokens_used, created_at, updated_at, git_branch FROM threads WHERE archived=0 ORDER BY updated_at DESC"`, { encoding: 'utf8', timeout: 5000 });
      const rows = JSON.parse(out || '[]');
      result = rows.map(r => ({
        id: r.id, title: r.title || '', cwd: r.cwd || '', model: r.model || '',
        tokens: r.tokens_used || 0, created: r.created_at || 0, updated: r.updated_at || 0, branch: r.git_branch || ''
      }));
    } else {
      result = d.prepare('SELECT id, title, cwd, model, tokens_used, created_at, updated_at, git_branch FROM threads WHERE archived=0 ORDER BY updated_at DESC').all()
        .map(r => ({ id: r.id, title: r.title, cwd: r.cwd, model: r.model, tokens: r.tokens_used || 0, created: r.created_at, updated: r.updated_at, branch: r.git_branch || '' }));
    }
  } catch {}
  _cache.threads = result;
  _cache.ts = Date.now();
  return result;
}

// ── Caching ────────────────────────────────────────────────────────────

let _cache = { threads: null, files: null, projects: null, ts: 0 };
const CACHE_TTL = 30_000; // 30 seconds

function clearCacheIfStale() {
  if (Date.now() - _cache.ts > CACHE_TTL) {
    _cache = { threads: null, files: null, projects: null, ts: 0 };
  }
}

// ── Find session JSONL files ───────────────────────────────────────────

function findSessionFiles() {
  clearCacheIfStale();
  if (_cache.files) return _cache.files;
  const sessDir = path.join(getCodexDir(), 'sessions');
  if (!fs.existsSync(sessDir)) return [];
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
      else if (entry.name.endsWith('.jsonl')) {
        // Extract session ID from filename: rollout-YYYY-MM-DDTHH-MM-SS-<uuid>.jsonl
        const match = entry.name.match(/rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/);
        if (match) files.push({ sessionId: match[1], filePath: path.join(dir, entry.name) });
      }
    }
  }
  walk(sessDir);
  _cache.files = files;
  _cache.ts = Date.now();
  return files;
}

// ── List projects (grouped by cwd) ─────────────────────────────────────

function listProjects() {
  clearCacheIfStale();
  if (_cache.projects) return _cache.projects;
  const threads = queryThreads();
  const sessionFiles = findSessionFiles();
  const fileMap = new Map(sessionFiles.map(f => [f.sessionId, f.filePath]));

  // Group by cwd (project path)
  const projectMap = new Map();
  for (const t of threads) {
    if (!fileMap.has(t.id)) continue; // skip threads without JSONL files
    const cwd = t.cwd || 'unknown';
    if (!projectMap.has(cwd)) projectMap.set(cwd, []);
    projectMap.get(cwd).push(t);
  }

  // Also pick up orphan files not in SQLite
  const knownIds = new Set(threads.map(t => t.id));
  for (const f of sessionFiles) {
    if (knownIds.has(f.sessionId)) continue;
    // Try to read cwd from session_meta in the JSONL
    let cwd = 'unknown';
    try {
      const firstLine = fs.readFileSync(f.filePath, 'utf8').split('\n')[0];
      const meta = JSON.parse(firstLine);
      if (meta.type === 'session_meta') cwd = meta.payload?.cwd || 'unknown';
    } catch {}
    if (!projectMap.has(cwd)) projectMap.set(cwd, []);
    projectMap.get(cwd).push({ id: f.sessionId, title: '', cwd, model: '', tokens: 0, created: 0, updated: 0, branch: '' });
  }

  const result = [...projectMap.entries()].map(([cwd, threads]) => {
    const encodedId = 'codex__' + cwd.replace(/\//g, '-').replace(/^-/, '');
    return {
      id: encodedId,
      projectPath: cwd,
      sessionCount: threads.length,
      hasMemory: false,
      provider: 'codex',
      _threads: threads,
    };
  }).filter(p => p.sessionCount > 0);
  _cache.projects = result;
  return result;
}

// ── List sessions for a project ────────────────────────────────────────

function listSessions(projectId) {
  const projects = listProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return [];

  const sessionFiles = findSessionFiles();
  const fileMap = new Map(sessionFiles.map(f => [f.sessionId, f.filePath]));

  return project._threads.map(t => {
    const fp = fileMap.get(t.id);
    let stat;
    try { stat = fp ? fs.statSync(fp) : null; } catch { stat = null; }
    return {
      sessionId: t.id,
      summary: t.title || 'Untitled',
      firstPrompt: t.title || '',
      created: t.created ? new Date(t.created * 1000).toISOString() : (stat?.birthtime?.toISOString() || ''),
      modified: t.updated ? new Date(t.updated * 1000).toISOString() : (stat?.mtime?.toISOString() || ''),
      model: t.model || '',
      gitBranch: t.branch || '',
      provider: 'codex',
    };
  }).sort((a, b) => new Date(b.modified || 0) - new Date(a.modified || 0));
}

// ── Get session file path ──────────────────────────────────────────────

function getSessionFilePath(sessionId) {
  const files = findSessionFiles();
  const f = files.find(f => f.sessionId === sessionId);
  return f?.filePath || null;
}

// ── Parse messages (normalize to Claude Journal format) ────────────────

function parseMessages(sessionId) {
  const fp = getSessionFilePath(sessionId);
  if (!fp || !fs.existsSync(fp)) return null;

  const lines = fs.readFileSync(fp, 'utf8').split('\n').filter(Boolean);
  const normalized = [];
  // Get model from SQLite (more reliable than session_meta)
  const threadInfo = queryThreads().find(t => t.id === sessionId);
  let model = threadInfo?.model || '';
  const seenUserMsgs = new Set();
  const seenAssistMsgs = new Set();

  // Stable UUID from line index + session ID (deterministic across parses)
  function stableId(lineIdx, suffix) {
    return crypto.createHash('md5').update(`${sessionId}:${lineIdx}:${suffix || ''}`).digest('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
  }

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const ts = entry.timestamp;

    switch (entry.type) {
      case 'session_meta':
        if (!model) model = entry.payload?.model || entry.payload?.model_provider || '';
        break;

      case 'event_msg': {
        const p = entry.payload;
        if (p.type === 'user_message') {
          const msgKey = (p.message || '').slice(0, 200);
          if (!seenUserMsgs.has(msgKey)) {
            seenUserMsgs.add(msgKey);
            normalized.push({
              type: 'user',
              uuid: stableId(lineIdx, normalized.length),
              timestamp: ts,
              message: { role: 'user', content: p.message },
            });
          }
        } else if (p.type === 'agent_message') {
          const msgKey = (p.message || '').slice(0, 200);
          if (!seenAssistMsgs.has(msgKey)) {
            seenAssistMsgs.add(msgKey);
            normalized.push({
              type: 'assistant',
              uuid: stableId(lineIdx, normalized.length),
              timestamp: ts,
              message: {
                role: 'assistant',
                model: model || 'unknown', provider: 'codex',
                content: [{ type: 'text', text: p.message }],
              },
            });
          }
        } else if (p.type === 'token_count' && p.info?.total_token_usage) {
          // Attach usage to previous assistant message
          const last = [...normalized].reverse().find(m => m.type === 'assistant');
          if (last && !last.message.usage) {
            const u = p.info.last_token_usage || p.info.total_token_usage;
            last.message.usage = {
              input_tokens: u.input_tokens || 0,
              output_tokens: u.output_tokens || 0,
              cache_read_input_tokens: u.cached_input_tokens || 0,
            };
          }
        }
        break;
      }

      case 'response_item': {
        const p = entry.payload;
        if (p.type === 'function_call') {
          // Map Codex function calls to tool_use
          let toolName = 'Bash', input = {};
          if (p.name === 'exec_command') {
            try {
              const args = JSON.parse(p.arguments);
              toolName = 'Bash';
              input = { command: args.cmd || '', description: args.cmd?.slice(0, 60) || '' };
            } catch { input = { command: p.arguments }; }
          } else if (p.name === 'read_file') {
            toolName = 'Read';
            try { input = JSON.parse(p.arguments); } catch {}
          } else if (p.name === 'write_file') {
            toolName = 'Write';
            try { input = JSON.parse(p.arguments); } catch {}
          } else if (p.name === 'list_directory' || p.name === 'list_dir') {
            toolName = 'Glob';
            try { input = JSON.parse(p.arguments); } catch {}
          } else {
            toolName = p.name || 'Tool';
            try { input = JSON.parse(p.arguments); } catch { input = { raw: p.arguments }; }
          }
          // Create an assistant message with tool_use
          normalized.push({
            type: 'assistant',
            uuid: p.call_id || stableId(lineIdx, normalized.length),
            timestamp: ts,
            message: {
              role: 'assistant',
              model: model || 'unknown', provider: 'codex',
              content: [{ type: 'tool_use', id: p.call_id, name: toolName, input }],
            },
          });
        } else if (p.type === 'function_call_output') {
          // Attach as tool_result to the matching tool_use
          const toolMsg = normalized.find(m => m.uuid === p.call_id);
          if (toolMsg) {
            const toolUse = toolMsg.message.content.find(c => c.type === 'tool_use' && c.id === p.call_id);
            if (toolUse) toolUse._result = { content: p.output || '', isError: false };
          }
        } else if (p.type === 'custom_tool_call') {
          let toolName = p.name || 'Tool';
          if (toolName === 'apply_patch') toolName = 'Edit';
          normalized.push({
            type: 'assistant',
            uuid: p.call_id || stableId(lineIdx, normalized.length),
            timestamp: ts,
            message: {
              role: 'assistant',
              model: model || 'unknown', provider: 'codex',
              content: [{ type: 'tool_use', id: p.call_id, name: toolName, input: { patch: p.input?.slice(0, 5000) || '' } }],
            },
          });
        } else if (p.type === 'custom_tool_call_output') {
          const toolMsg = normalized.find(m => m.uuid === p.call_id);
          if (toolMsg) {
            const toolUse = toolMsg.message.content.find(c => c.type === 'tool_use');
            if (toolUse) toolUse._result = { content: p.output || '', isError: false };
          }
        } else if (p.type === 'message' && p.role === 'user') {
          const text = Array.isArray(p.content) ? p.content.filter(c => c.type === 'input_text').map(c => c.text).join('\n') : '';
          if (text && !text.startsWith('<permissions') && !text.startsWith('<environment')) {
            const msgKey = text.slice(0, 200);
            if (!seenUserMsgs.has(msgKey)) {
              seenUserMsgs.add(msgKey);
              normalized.push({
                type: 'user',
                uuid: stableId(lineIdx, normalized.length),
                timestamp: ts,
                message: { role: 'user', content: text },
              });
            }
          }
        } else if (p.type === 'message' && p.role === 'assistant') {
          const text = Array.isArray(p.content) ? p.content.filter(c => c.type === 'output_text').map(c => c.text).join('\n') : '';
          if (text) {
            const msgKey = text.slice(0, 200);
            if (!seenAssistMsgs.has(msgKey)) {
              seenAssistMsgs.add(msgKey);
              normalized.push({
                type: 'assistant',
                uuid: stableId(lineIdx, normalized.length),
                timestamp: ts,
                message: {
                  role: 'assistant',
                  model: model || 'unknown', provider: 'codex',
                  content: [{ type: 'text', text }],
                },
              });
            }
          }
        } else if (p.type === 'reasoning') {
          // Codex reasoning is encrypted — show summary if available
          const summaryText = Array.isArray(p.summary) ? p.summary.map(s => s.text || '').join('\n') : '';
          if (summaryText) {
            normalized.push({
              type: 'assistant',
              uuid: stableId(lineIdx, normalized.length),
              timestamp: ts,
              message: {
                role: 'assistant',
                model: model || 'unknown', provider: 'codex',
                content: [{ type: 'thinking', thinking: summaryText || '[reasoning — encrypted]' }],
              },
            });
          }
        }
        break;
      }
    }
  }

  // Post-process: merge consecutive assistant messages and attach tool results
  return postProcess(normalized);
}

function postProcess(messages) {
  // Convert _result fields into the format processMessages expects (tool_result in user messages)
  const result = [];
  let resultIdx = 0;
  for (const msg of messages) {
    result.push(msg);
    // If this assistant message has tool_use with _result, create a synthetic user tool_result
    if (msg.type === 'assistant') {
      for (const block of msg.message.content) {
        if (block.type === 'tool_use' && block._result) {
          result.push({
            type: 'user',
            uuid: crypto.createHash('md5').update(`result:${msg.uuid}:${resultIdx++}`).digest('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5'),
            timestamp: msg.timestamp,
            message: [{ type: 'tool_result', tool_use_id: block.id, content: block._result.content, is_error: block._result.isError }],
          });
          delete block._result;
        }
      }
    }
  }
  return result;
}

// ── Session stats ──────────────────────────────────────────────────────

function getSessionStats(sessionId) {
  const threads = queryThreads();
  const t = threads.find(th => th.id === sessionId);
  if (!t) return null;
  // Can't get detailed per-message stats without parsing, but tokens_used is available
  return {
    inputTok: Math.round((t.tokens || 0) * 0.7), // rough estimate
    outputTok: Math.round((t.tokens || 0) * 0.3),
    messageCount: 0, // would need to parse JSONL
    cost: 0, // Codex pricing is different
    firstTs: t.created ? new Date(t.created * 1000).toISOString() : '',
    lastTs: t.updated ? new Date(t.updated * 1000).toISOString() : '',
  };
}

module.exports = { isAvailable, listProjects, listSessions, getSessionFilePath, parseMessages, getSessionStats };
