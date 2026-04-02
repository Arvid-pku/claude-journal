const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const chokidar = require('chokidar');

// ── Config ──────────────────────────────────────────────────────────────────

const ANNOTATIONS_DIR = path.join(__dirname, 'annotations');
const SETTINGS_PATH = path.join(__dirname, 'settings.json');
const NAMES_PATH = path.join(ANNOTATIONS_DIR, '_names.json');
const STATS_CACHE_PATH = path.join(ANNOTATIONS_DIR, '_stats_cache.json');

fs.mkdirSync(ANNOTATIONS_DIR, { recursive: true });

function loadSettings() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const defaultDir = path.join(home, '.claude', 'projects');
  const defaults = { projectsDir: defaultDir, port: 8086, autoOpen: false };
  if (fs.existsSync(SETTINGS_PATH)) {
    try { return { ...defaults, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) }; } catch {}
  }
  return defaults;
}

const settings = loadSettings();
const PROJECTS_DIR = process.env.CLAUDE_PROJECTS_DIR || settings.projectsDir;
const PORT = process.env.PORT || settings.port;

// ── Basic Auth (optional) ───────────────────────────────────────────────────

const AUTH = process.env.CLAUDE_JOURNAL_AUTH; // "user:pass"

function authMiddleware(req, res, next) {
  if (!AUTH) return next();
  const header = req.headers.authorization;
  if (header) {
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && Buffer.from(encoded, 'base64').toString() === AUTH) return next();
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Claude Journal"');
  res.status(401).send('Authentication required');
}

// ── Pricing (per 1M tokens) ────────────────────────────────────────────────

const PRICING = {
  'claude-opus-4': { input: 15, output: 75, cacheRead: 1.5, cacheCreate: 18.75 },
  'claude-sonnet-4': { input: 3, output: 15, cacheRead: 0.3, cacheCreate: 3.75 },
  'claude-haiku-4': { input: 0.8, output: 4, cacheRead: 0.08, cacheCreate: 1 },
};

function getModelPricing(model) {
  if (!model) return null;
  for (const [prefix, p] of Object.entries(PRICING)) {
    if (model.startsWith(prefix)) return p;
  }
  return null;
}

function messageCost(model, usage) {
  const p = getModelPricing(model);
  if (!p || !usage) return 0;
  return ((usage.input_tokens || 0) * p.input
    + (usage.output_tokens || 0) * p.output
    + (usage.cache_read_input_tokens || 0) * p.cacheRead
    + (usage.cache_creation_input_tokens || 0) * p.cacheCreate) / 1_000_000;
}

// ── Atomic write helper ─────────────────────────────────────────────────────

function atomicWrite(filePath, content) {
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, filePath);
}

// ── Stats cache (persistent) ────────────────────────────────────────────────

let statsCache;
try {
  statsCache = fs.existsSync(STATS_CACHE_PATH)
    ? new Map(Object.entries(JSON.parse(fs.readFileSync(STATS_CACHE_PATH, 'utf8'))))
    : new Map();
} catch { statsCache = new Map(); }

let statsDirty = false;

function flushStatsCache() {
  if (!statsDirty) return;
  try { atomicWrite(STATS_CACHE_PATH, JSON.stringify(Object.fromEntries(statsCache))); } catch {}
  statsDirty = false;
}

setInterval(flushStatsCache, 30_000); // flush every 30s

function getSessionStats(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  const cacheKey = `${filePath}::${stat.mtimeMs}`;
  if (statsCache.has(cacheKey)) return statsCache.get(cacheKey);

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(Boolean);
  let userMsgs = 0, assistMsgs = 0, inputTok = 0, outputTok = 0, cachedTok = 0, cost = 0;
  let first = null, last = null;

  for (const line of lines) {
    try {
      const m = JSON.parse(line);
      if (m.type === 'user' && m.message?.role === 'user' && typeof m.message.content === 'string') userMsgs++;
      if (m.type === 'assistant' && m.message?.content) {
        assistMsgs++;
        const u = m.message.usage;
        if (u) {
          inputTok += u.input_tokens || 0;
          outputTok += u.output_tokens || 0;
          cachedTok += u.cache_read_input_tokens || 0;
          cost += messageCost(m.message.model, u);
        }
      }
      if (m.timestamp) {
        if (!first || m.timestamp < first) first = m.timestamp;
        if (!last || m.timestamp > last) last = m.timestamp;
      }
    } catch {}
  }

  const result = { userMsgs, assistMsgs, messageCount: userMsgs + assistMsgs,
    inputTok, outputTok, cachedTok, cost: Math.round(cost * 10000) / 10000, firstTs: first, lastTs: last };
  statsCache.set(cacheKey, result);
  statsDirty = true;
  return result;
}

// ── Pins ────────────────────────────────────────────────────────────────────

const PINS_PATH = path.join(ANNOTATIONS_DIR, '_pins.json');

function loadPins() {
  if (!fs.existsSync(PINS_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(PINS_PATH, 'utf8')); } catch { return {}; }
}

function setPin(project, session, pinned) {
  const pins = loadPins();
  const key = `${project}__${session}`;
  if (pinned) pins[key] = Date.now(); else delete pins[key];
  atomicWrite(PINS_PATH, JSON.stringify(pins, null, 2));
}

// ── Session names ───────────────────────────────────────────────────────────

function loadNames() {
  if (!fs.existsSync(NAMES_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(NAMES_PATH, 'utf8')); } catch { return {}; }
}

function saveName(project, session, name) {
  const names = loadNames();
  const key = `${project}__${session}`;
  if (name) names[key] = name; else delete names[key];
  atomicWrite(NAMES_PATH, JSON.stringify(names, null, 2));
  return names;
}

// ── Express + WS ────────────────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(authMiddleware);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '2mb' }));

// ── Settings API ────────────────────────────────────────────────────────────

app.get('/api/settings', (_req, res) => res.json(loadSettings()));

app.put('/api/settings', (req, res) => {
  let current = {};
  if (fs.existsSync(SETTINGS_PATH)) { try { current = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); } catch {} }
  const updated = { ...current, ...req.body };
  // Validate projects directory if changed
  const warnings = [];
  if (updated.projectsDir && updated.projectsDir !== current.projectsDir) {
    const resolved = updated.projectsDir.replace(/^~/, process.env.HOME || process.env.USERPROFILE || '');
    if (!fs.existsSync(resolved)) {
      warnings.push(`Directory "${updated.projectsDir}" does not exist. It will be checked on next restart.`);
    }
  }
  if (updated.projectsDir !== current.projectsDir || (updated.port && updated.port !== current.port)) {
    warnings.push('Changes to projects directory or port require a server restart to take effect.');
  }
  atomicWrite(SETTINGS_PATH, JSON.stringify(updated, null, 2));
  res.json({ ...updated, _warnings: warnings.length ? warnings : undefined });
});

// ── Projects ────────────────────────────────────────────────────────────────

app.get('/api/projects', (_req, res) => {
  try {
    if (!fs.existsSync(PROJECTS_DIR)) {
      return res.json({ empty: true, dir: PROJECTS_DIR, reason: 'directory_not_found',
        message: `Projects directory not found at ${PROJECTS_DIR}. Start a conversation with Claude Code to create one, or check the path in Settings.` });
    }
    const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
    const projects = entries
      .filter(e => e.isDirectory())
      .map(e => {
        const name = e.name;
        const indexPath = path.join(PROJECTS_DIR, name, 'sessions-index.json');
        let decodedPath = '/' + name.replace(/^-/, '').replace(/-/g, '/');
        let meta = { projectPath: decodedPath, sessionCount: 0, hasMemory: false };
        if (fs.existsSync(indexPath)) {
          try {
            const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
            meta.projectPath = index.originalPath || meta.projectPath;
            meta.sessionCount = index.entries?.length || 0;
          } catch {}
        } else {
          try { meta.sessionCount = fs.readdirSync(path.join(PROJECTS_DIR, name)).filter(f => f.endsWith('.jsonl')).length; } catch {}
        }
        meta.hasMemory = fs.existsSync(path.join(PROJECTS_DIR, name, 'memory'));
        return { id: name, ...meta };
      })
      .filter(p => p.sessionCount > 0)
      .sort((a, b) => a.projectPath.localeCompare(b.projectPath));
    if (!projects.length) {
      return res.json({ empty: true, dir: PROJECTS_DIR, reason: 'no_sessions',
        message: `No Claude Code sessions found in ${PROJECTS_DIR}. Start a conversation with Claude Code to create one.` });
    }
    res.json(projects);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Sessions ────────────────────────────────────────────────────────────────

app.get('/api/sessions/:project', (req, res) => {
  try {
    const projectDir = path.join(PROJECTS_DIR, req.params.project);
    const indexPath = path.join(projectDir, 'sessions-index.json');
    const names = loadNames();
    const pins = loadPins();
    let sessions = [];

    if (fs.existsSync(indexPath)) {
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      sessions = (index.entries || []).map(e => ({
        sessionId: e.sessionId, summary: e.summary || e.firstPrompt || 'Untitled',
        firstPrompt: e.firstPrompt || '', created: e.created, modified: e.modified, gitBranch: e.gitBranch || '',
      }));
    } else {
      const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
      sessions = files.map(f => {
        const sessionId = f.replace('.jsonl', '');
        const stat = fs.statSync(path.join(projectDir, f));
        let summary = 'Untitled';
        try {
          const content = fs.readFileSync(path.join(projectDir, f), 'utf8');
          for (const line of content.split('\n')) {
            if (!line) continue;
            const m = JSON.parse(line);
            if (m.type === 'user' && m.message?.content && typeof m.message.content === 'string') { summary = m.message.content.slice(0, 120); break; }
          }
        } catch {}
        return { sessionId, summary, firstPrompt: summary, created: stat.birthtime.toISOString(), modified: stat.mtime.toISOString() };
      });
    }

    for (const s of sessions) {
      const nameKey = `${req.params.project}__${s.sessionId}`;
      if (names[nameKey]) s.customName = names[nameKey];
      const stats = getSessionStats(path.join(projectDir, `${s.sessionId}.jsonl`));
      if (stats) Object.assign(s, stats);
      s.hasAnnotations = fs.existsSync(path.join(ANNOTATIONS_DIR, `${req.params.project}__${s.sessionId}.json`));
      s.pinned = !!pins[nameKey];
    }

    sessions.sort((a, b) => new Date(b.modified || b.lastTs || 0) - new Date(a.modified || a.lastTs || 0));
    res.json(sessions);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Messages ────────────────────────────────────────────────────────────────

app.get('/api/messages/:project/:session', (req, res) => {
  try {
    const fp = path.join(PROJECTS_DIR, req.params.project, `${req.params.session}.jsonl`);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    const msgs = fs.readFileSync(fp, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    res.json(msgs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/messages/:project/:session/:uuid', (req, res) => {
  try {
    const fp = path.join(PROJECTS_DIR, req.params.project, `${req.params.session}.jsonl`);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    const { content, partIndex } = req.body;
    if (content === undefined) return res.status(400).json({ error: 'content required' });

    const lines = fs.readFileSync(fp, 'utf8').split('\n');
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      let msg; try { msg = JSON.parse(lines[i]); } catch { continue; }
      if (msg.uuid !== req.params.uuid) continue;
      found = true;
      if (msg.type === 'user' && msg.message?.role === 'user') msg.message.content = content;
      else if (msg.type === 'assistant' && Array.isArray(msg.message?.content)) {
        const idx = typeof partIndex === 'number' ? partIndex : -1;
        let ti = 0;
        for (let j = 0; j < msg.message.content.length; j++) {
          if (msg.message.content[j].type === 'text') { if (idx === -1 || ti === idx) { msg.message.content[j].text = content; break; } ti++; }
        }
      } else return res.status(400).json({ error: 'Not editable' });
      lines[i] = JSON.stringify(msg);
      break;
    }
    if (!found) return res.status(404).json({ error: 'UUID not found' });
    atomicWrite(fp, lines.join('\n'));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete a message from JSONL
app.delete('/api/messages/:project/:session/:uuid', (req, res) => {
  try {
    const fp = path.join(PROJECTS_DIR, req.params.project, `${req.params.session}.jsonl`);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    const lines = fs.readFileSync(fp, 'utf8').split('\n');
    const filtered = lines.filter(l => {
      if (!l.trim()) return false;
      try { return JSON.parse(l).uuid !== req.params.uuid; } catch { return true; }
    });
    if (filtered.length === lines.filter(l => l.trim()).length) return res.status(404).json({ error: 'UUID not found' });
    atomicWrite(fp, filtered.join('\n') + '\n');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Global Search ───────────────────────────────────────────────────────────

let searchIndex = null, searchIndexTime = 0;

function buildSearchIndex() {
  const now = Date.now();
  if (searchIndex && now - searchIndexTime < 60_000) return searchIndex;
  const entries = [];
  const names = loadNames();
  try {
    const dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const pd of dirs) {
      const projectDir = path.join(PROJECTS_DIR, pd.name);
      for (const f of fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'))) {
        const sessionId = f.replace('.jsonl', '');
        const sessionName = names[`${pd.name}__${sessionId}`] || '';
        try {
          for (const line of fs.readFileSync(path.join(projectDir, f), 'utf8').split('\n')) {
            if (!line) continue;
            const m = JSON.parse(line);
            let text = null;
            if (m.type === 'user' && m.message?.role === 'user' && typeof m.message.content === 'string')
              text = m.message.content;
            else if (m.type === 'assistant' && Array.isArray(m.message?.content))
              text = m.message.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
            if (text && text.length > 3)
              entries.push({ projectId: pd.name, sessionId, sessionName, uuid: m.uuid, role: m.type, text, ts: m.timestamp });
          }
        } catch {}
      }
    }
  } catch {}
  searchIndex = entries;
  searchIndexTime = now;
  return entries;
}

app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q || q.length < 2) return res.json([]);
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const index = buildSearchIndex();
  const results = [];
  for (const e of index) {
    const idx = e.text.toLowerCase().indexOf(q);
    if (idx === -1) continue;
    const start = Math.max(0, idx - 80), end = Math.min(e.text.length, idx + q.length + 80);
    results.push({ projectId: e.projectId, sessionId: e.sessionId, sessionName: e.sessionName,
      uuid: e.uuid, role: e.role, ts: e.ts,
      snippet: (start > 0 ? '...' : '') + e.text.slice(start, end) + (end < e.text.length ? '...' : '') });
    if (results.length >= limit) break;
  }
  res.json(results);
});

// ── Analytics ───────────────────────────────────────────────────────────────

app.get('/api/analytics', (req, res) => {
  try {
    const filterProject = req.query.project;
    const dateFrom = req.query.from || '';  // YYYY-MM-DD
    const dateTo = req.query.to || '';
    const dirs = filterProject
      ? [{ name: filterProject }]
      : fs.readdirSync(PROJECTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory());

    const byDay = {}, byModel = {}, byTool = {}, byHour = {};
    const topSessions = [];
    let totalCost = 0, totalInput = 0, totalOutput = 0, totalMsgs = 0, sessionCount = 0;
    let totalToolCalls = 0, totalUserMsgs = 0, longestSession = 0;

    // Init hourly heatmap: 7 days x 24 hours
    for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) byHour[`${d}-${h}`] = 0;

    for (const pd of dirs) {
      const projectDir = path.join(PROJECTS_DIR, typeof pd === 'string' ? pd : pd.name);
      if (!fs.existsSync(projectDir)) continue;
      const jsonls = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
      sessionCount += jsonls.length;
      for (const f of jsonls) {
        let sCost = 0, sMsgs = 0, sName = f.replace('.jsonl', '').slice(0, 8);
        try {
          for (const line of fs.readFileSync(path.join(projectDir, f), 'utf8').split('\n')) {
            if (!line) continue;
            const m = JSON.parse(line);

            // Date filter
            if (m.timestamp) {
              const day = m.timestamp.slice(0, 10);
              if (dateFrom && day < dateFrom) continue;
              if (dateTo && day > dateTo) continue;
            }

            // Heatmap: count messages by day-of-week and hour
            if (m.timestamp && (m.type === 'user' || m.type === 'assistant')) {
              const dt = new Date(m.timestamp);
              const key = `${dt.getDay()}-${dt.getHours()}`;
              byHour[key] = (byHour[key] || 0) + 1;
            }

            if (m.type === 'user' && m.message?.role === 'user' && typeof m.message.content === 'string') {
              totalUserMsgs++;
              if (!sName || sName.length <= 8) { const t = m.message.content.slice(0, 40); if (t.length > 3) sName = t; }
            }

            if (m.type !== 'assistant' || !m.message?.content) continue;
            const content = m.message.content;
            if (!Array.isArray(content)) continue;

            // Tool usage
            for (const b of content) {
              if (b.type === 'tool_use') {
                const name = b.name || 'unknown';
                if (!byTool[name]) byTool[name] = { count: 0, cost: 0 };
                byTool[name].count++;
                totalToolCalls++;
              }
            }

            if (!m.message.usage) continue;
            const u = m.message.usage, model = m.message.model || 'unknown';
            const cost = messageCost(model, u);
            const day = (m.timestamp || '').slice(0, 10) || 'unknown';
            const inp = u.input_tokens || 0, out = u.output_tokens || 0;

            if (!byDay[day]) byDay[day] = { cost: 0, input: 0, output: 0, msgs: 0 };
            byDay[day].cost += cost; byDay[day].input += inp; byDay[day].output += out; byDay[day].msgs++;

            if (!byModel[model]) byModel[model] = { cost: 0, tokens: 0, msgs: 0 };
            byModel[model].cost += cost; byModel[model].tokens += inp + out; byModel[model].msgs++;

            // Tool cost attribution
            for (const b of content) {
              if (b.type === 'tool_use' && byTool[b.name]) byTool[b.name].cost += cost / Math.max(1, content.filter(x => x.type === 'tool_use').length);
            }

            totalCost += cost; totalInput += inp; totalOutput += out; totalMsgs++;
            sCost += cost; sMsgs++;
          }
        } catch {}
        if (sCost > 0) topSessions.push({ name: sName, cost: Math.round(sCost * 100) / 100, msgs: sMsgs });
        if (sMsgs > longestSession) longestSession = sMsgs;
      }
    }

    topSessions.sort((a, b) => b.cost - a.cost);

    res.json({
      totalCost: Math.round(totalCost * 100) / 100, totalInput, totalOutput, totalMsgs, sessionCount,
      totalToolCalls, totalUserMsgs, longestSession,
      byDay, byModel, byTool, byHour,
      topSessions: topSessions.slice(0, 10),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Bookmarks (cross-session favorites & notes) ─────────────────────────────

app.get('/api/bookmarks', (req, res) => {
  try {
    const type = req.query.type; // 'favorites' or 'notes'
    const results = [];
    const names = loadNames();
    const files = fs.readdirSync(ANNOTATIONS_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));

    for (const f of files) {
      const parts = f.replace('.json', '').split('__');
      if (parts.length < 2) continue;
      const project = parts[0], session = parts.slice(1).join('__');
      let annotations;
      try { annotations = JSON.parse(fs.readFileSync(path.join(ANNOTATIONS_DIR, f), 'utf8')); } catch { continue; }
      const sessionName = names[`${project}__${session}`] || session.slice(0, 8);

      if (type === 'favorites' || type === 'highlights') {
        const key = type === 'favorites' ? 'favorite' : 'highlight';
        for (const [uuid, anno] of Object.entries(annotations)) {
          if (uuid === '_meta' || !anno[key]) continue;
          let text = '', role = '', ts = '';
          const fp = path.join(PROJECTS_DIR, project, `${session}.jsonl`);
          if (fs.existsSync(fp)) {
            for (const line of fs.readFileSync(fp, 'utf8').split('\n')) {
              if (!line) continue;
              try {
                const m = JSON.parse(line);
                if (m.uuid !== uuid) continue;
                ts = m.timestamp || '';
                role = m.type === 'user' ? 'user' : 'assistant';
                if (m.type === 'user' && typeof m.message?.content === 'string') { text = m.message.content; }
                else if (m.type === 'assistant' && Array.isArray(m.message?.content)) {
                  // Text blocks first
                  text = m.message.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
                  // Fallback: describe tool calls
                  if (!text) {
                    const tools = m.message.content.filter(b => b.type === 'tool_use');
                    if (tools.length) text = tools.map(t => `[${t.name}] ${(t.input?.description || t.input?.file_path || t.input?.command || t.input?.pattern || '').slice(0, 60)}`).join(', ');
                  }
                }
                if (!text) text = `(${role} message)`;
                break;
              } catch {}
            }
          }
          if (!text) text = '(message)';
          const entry = { project, session, sessionName, uuid, role, text: text.slice(0, 200), ts };
          if (type === 'highlights') entry.color = anno.highlight;
          results.push(entry);
        }
      } else if (type === 'notes') {
        // Per-message comments
        for (const [uuid, anno] of Object.entries(annotations)) {
          if (uuid === '_meta') continue;
          const text = anno.comment || anno.note;
          if (!text) continue;
          let msgText = '', role = '', ts = '';
          const fp = path.join(PROJECTS_DIR, project, `${session}.jsonl`);
          if (fs.existsSync(fp)) {
            for (const line of fs.readFileSync(fp, 'utf8').split('\n')) {
              if (!line) continue;
              try {
                const m = JSON.parse(line);
                if (m.uuid !== uuid) continue;
                ts = m.timestamp || '';
                if (m.type === 'user' && typeof m.message?.content === 'string') { msgText = m.message.content; role = 'user'; }
                else if (m.type === 'assistant' && Array.isArray(m.message?.content)) { msgText = m.message.content.filter(b => b.type === 'text').map(b => b.text).join('\n'); role = 'assistant'; }
                break;
              } catch {}
            }
          }
          if (text) results.push({ project, session, sessionName, uuid, role, comment: text, text: (msgText || '').slice(0, 200), ts });
        }
        // Session-level notes (session scratchpad or legacy colorNotes)
        const meta = annotations._meta;
        if (meta?.sessionNote) {
          results.push({ project, session, sessionName, uuid: '', role: '', comment: meta.sessionNote.slice(0, 200), text: 'Session note', ts: '' });
        }
      }
    }

    results.sort((a, b) => (b.ts || b.session || '').localeCompare(a.ts || a.session || ''));
    res.json(results);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Subagents ───────────────────────────────────────────────────────────────

app.get('/api/subagents/:project/:session', (req, res) => {
  try {
    const dir = path.join(PROJECTS_DIR, req.params.project, req.params.session, 'subagents');
    if (!fs.existsSync(dir)) return res.json([]);
    const files = fs.readdirSync(dir);
    const agents = [];
    for (const f of files) {
      if (!f.endsWith('.meta.json')) continue;
      const hash = f.replace('.meta.json', '').replace('agent-', '');
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        const jsonlPath = path.join(dir, `agent-${hash}.jsonl`);
        const size = fs.existsSync(jsonlPath) ? fs.statSync(jsonlPath).size : 0;
        agents.push({ hash, agentType: meta.agentType || '', description: meta.description || '', size });
      } catch {}
    }
    res.json(agents);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/subagents/:project/:session/:hash', (req, res) => {
  try {
    const fp = path.join(PROJECTS_DIR, req.params.project, req.params.session, 'subagents', `agent-${req.params.hash}.jsonl`);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    const msgs = fs.readFileSync(fp, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    res.json(msgs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Memory ──────────────────────────────────────────────────────────────────

app.get('/api/memory/:project', (req, res) => {
  try {
    const dir = path.join(PROJECTS_DIR, req.params.project, 'memory');
    if (!fs.existsSync(dir)) return res.json([]);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
    const result = files.map(f => ({
      filename: f,
      content: fs.readFileSync(path.join(dir, f), 'utf8'),
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Session Operations ──────────────────────────────────────────────────────

function buildSessionsIndex(projectDir) {
  const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
  const entries = []; let originalPath = '';
  for (const f of files) {
    const sessionId = f.replace('.jsonl', '');
    const fp = path.join(projectDir, f);
    const stat = fs.statSync(fp);
    let firstPrompt = '', summary = '', gitBranch = '', projectPath = '';
    try {
      for (const line of fs.readFileSync(fp, 'utf8').split('\n')) {
        if (!line) continue;
        const m = JSON.parse(line);
        if (m.type === 'user' && m.message?.role === 'user' && typeof m.message.content === 'string' && !firstPrompt) { firstPrompt = m.message.content.slice(0, 200); summary = firstPrompt; }
        if (m.cwd && !projectPath) projectPath = m.cwd;
        if (m.gitBranch && !gitBranch) gitBranch = m.gitBranch;
        if (firstPrompt) break;
      }
    } catch {}
    if (projectPath && !originalPath) originalPath = projectPath;
    entries.push({ sessionId, fullPath: fp, fileMtime: stat.mtimeMs, firstPrompt, summary, messageCount: 0,
      created: stat.birthtime.toISOString(), modified: stat.mtime.toISOString(), gitBranch, projectPath, isSidechain: false });
  }
  return { version: 1, entries, originalPath };
}

app.put('/api/sessions/:project/:session/pin', (req, res) => {
  try {
    const { pinned } = req.body;
    setPin(req.params.project, req.params.session, !!pinned);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/sessions/:project/:session/rename', (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    const trimmed = name.trim();
    saveName(req.params.project, req.params.session, trimmed);
    // Write custom-title to JSONL
    const projectDir = path.join(PROJECTS_DIR, req.params.project);
    const fp = path.join(projectDir, `${req.params.session}.jsonl`);
    if (fs.existsSync(fp)) {
      const lines = fs.readFileSync(fp, 'utf8').split('\n').filter(l => {
        if (!l.trim()) return false;
        try { return JSON.parse(l).type !== 'custom-title'; } catch { return true; }
      });
      lines.push(JSON.stringify({ type: 'custom-title', customTitle: trimmed, sessionId: req.params.session }));
      atomicWrite(fp, lines.join('\n') + '\n');
    }
    // Update sessions-index.json
    const indexPath = path.join(projectDir, 'sessions-index.json');
    let index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : buildSessionsIndex(projectDir);
    const entry = index.entries?.find(e => e.sessionId === req.params.session);
    if (entry) entry.summary = trimmed;
    atomicWrite(indexPath, JSON.stringify(index, null, 2));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/sessions/:project/:session', (req, res) => {
  try {
    const projectDir = path.join(PROJECTS_DIR, req.params.project);
    const fp = path.join(projectDir, `${req.params.session}.jsonl`);
    const dirPath = path.join(projectDir, req.params.session);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    fs.unlinkSync(fp);
    if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
    const indexPath = path.join(projectDir, 'sessions-index.json');
    if (fs.existsSync(indexPath)) {
      try { const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8')); idx.entries = (idx.entries || []).filter(e => e.sessionId !== req.params.session); atomicWrite(indexPath, JSON.stringify(idx, null, 2)); } catch {}
    }
    const annoPath = path.join(ANNOTATIONS_DIR, `${req.params.project}__${req.params.session}.json`);
    if (fs.existsSync(annoPath)) fs.unlinkSync(annoPath);
    saveName(req.params.project, req.params.session, null);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sessions/:project/:session/duplicate', (req, res) => {
  try {
    const projectDir = path.join(PROJECTS_DIR, req.params.project);
    const srcPath = path.join(projectDir, `${req.params.session}.jsonl`);
    if (!fs.existsSync(srcPath)) return res.status(404).json({ error: 'Not found' });
    const newId = crypto.randomUUID();
    fs.copyFileSync(srcPath, path.join(projectDir, `${newId}.jsonl`));
    const names = loadNames();
    saveName(req.params.project, newId, `(Copy) ${names[`${req.params.project}__${req.params.session}`] || 'Session'}`);
    res.json({ ok: true, newSessionId: newId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sessions/:project/:session/move', (req, res) => {
  try {
    const { targetProject } = req.body;
    if (!targetProject || targetProject === req.params.project) return res.status(400).json({ error: 'Invalid target' });
    const srcDir = path.join(PROJECTS_DIR, req.params.project);
    const dstDir = path.join(PROJECTS_DIR, targetProject);
    if (!fs.existsSync(dstDir)) return res.status(404).json({ error: 'Target not found' });
    const srcFile = path.join(srcDir, `${req.params.session}.jsonl`);
    if (!fs.existsSync(srcFile)) return res.status(404).json({ error: 'Not found' });
    const dstFile = path.join(dstDir, `${req.params.session}.jsonl`);
    if (fs.existsSync(dstFile)) return res.status(409).json({ error: 'A session with the same ID already exists in the target project' });
    fs.copyFileSync(srcFile, dstFile);
    fs.unlinkSync(srcFile);
    const srcSub = path.join(srcDir, req.params.session);
    if (fs.existsSync(srcSub)) { fs.cpSync(srcSub, path.join(dstDir, req.params.session), { recursive: true }); fs.rmSync(srcSub, { recursive: true, force: true }); }
    const srcAnno = path.join(ANNOTATIONS_DIR, `${req.params.project}__${req.params.session}.json`);
    const dstAnno = path.join(ANNOTATIONS_DIR, `${targetProject}__${req.params.session}.json`);
    if (fs.existsSync(srcAnno)) { fs.copyFileSync(srcAnno, dstAnno); fs.unlinkSync(srcAnno); }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Annotations ─────────────────────────────────────────────────────────────

function annotationPath(project, session) { return path.join(ANNOTATIONS_DIR, `${project}__${session}.json`); }

app.get('/api/annotations/:project/:session', (req, res) => {
  const p = annotationPath(req.params.project, req.params.session);
  if (!fs.existsSync(p)) return res.json({});
  try { res.json(JSON.parse(fs.readFileSync(p, 'utf8'))); } catch { res.json({}); }
});

app.post('/api/annotations/:project/:session', (req, res) => {
  const p = annotationPath(req.params.project, req.params.session);
  let annotations = {};
  if (fs.existsSync(p)) { try { annotations = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {} }
  const { uuid, key, value } = req.body;
  if (!uuid || !key) return res.status(400).json({ error: 'uuid and key required' });
  if (!annotations[uuid]) annotations[uuid] = {};
  if (value === null || value === undefined || value === '' || value === false) {
    delete annotations[uuid][key];
    if (Object.keys(annotations[uuid]).length === 0) delete annotations[uuid];
  } else annotations[uuid][key] = value;
  atomicWrite(p, JSON.stringify(annotations, null, 2));
  res.json(annotations);
});

// ── WebSocket ───────────────────────────────────────────────────────────────

wss.on('connection', (ws) => {
  let watcher = null;
  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'watch') {
      if (watcher) { watcher.close(); watcher = null; }
      const fp = path.join(PROJECTS_DIR, msg.project, `${msg.session}.jsonl`);
      if (!fs.existsSync(fp)) return;
      watcher = chokidar.watch(fp, { usePolling: true, interval: 1500, awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 200 } });
      watcher.on('change', () => {
        try {
          const msgs = fs.readFileSync(fp, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'update', messages: msgs }));
        } catch {}
      });
    }
    if (msg.type === 'unwatch') { if (watcher) { watcher.close(); watcher = null; } }
  });
  ws.on('close', () => { if (watcher) { watcher.close(); watcher = null; } });
});

// ── Start ───────────────────────────────────────────────────────────────────

function startServer(port, maxRetries = 10) {
  // Test port availability first with a plain TCP server
  const testServer = require('net').createServer();
  testServer.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && maxRetries > 0) {
      console.log(`  Port ${port} in use, trying ${port + 1}...`);
      startServer(port + 1, maxRetries - 1);
    } else {
      console.error(`  Failed to start: ${err.message}`);
      process.exit(1);
    }
  });
  testServer.listen(port, '0.0.0.0', () => {
    testServer.close(() => {
      // Port is free, now start the real server
      actualStart(port);
    });
  });
}

function actualStart(port) {
  server.listen(port, '0.0.0.0', () => {
    const url = `http://localhost:${port}`;
    let version = '';
    try { version = ' v' + require('./package.json').version; } catch {}
    console.log('');
    console.log(`  \x1b[1mClaude Journal${version}\x1b[0m`);
    console.log(`  \x1b[36m${url}\x1b[0m`);
    console.log(`  \x1b[2mProjects: ${PROJECTS_DIR}\x1b[0m`);
    console.log(`  \x1b[2mPress Ctrl+C to stop\x1b[0m`);
    console.log('');
    // Export actual port for CLI/tray to use
    process.env.CLAUDE_JOURNAL_PORT = String(port);
    // Write port file for daemon mode to read
    try { fs.writeFileSync(path.join(require('os').tmpdir(), 'claude-journal.port'), String(port)); } catch {}
    if (settings.autoOpen) {
      const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${cmd} ${url}`, () => {});
    }
  });
}

startServer(parseInt(PORT) || 8086);

process.on('SIGINT', () => { flushStatsCache(); process.exit(0); });
process.on('SIGTERM', () => { flushStatsCache(); process.exit(0); });
