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
  const defaults = { projectsDir: '/hpc/home/xy200/.claude/projects', port: 8086, autoOpen: false };
  if (fs.existsSync(SETTINGS_PATH)) {
    try { return { ...defaults, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) }; } catch {}
  }
  return defaults;
}

const settings = loadSettings();
const PROJECTS_DIR = process.env.CLAUDE_PROJECTS_DIR || settings.projectsDir;
const PORT = process.env.PORT || settings.port;

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

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '2mb' }));

// ── Settings API ────────────────────────────────────────────────────────────

app.get('/api/settings', (_req, res) => res.json(loadSettings()));

app.put('/api/settings', (req, res) => {
  let current = {};
  if (fs.existsSync(SETTINGS_PATH)) { try { current = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); } catch {} }
  const updated = { ...current, ...req.body };
  atomicWrite(SETTINGS_PATH, JSON.stringify(updated, null, 2));
  res.json(updated);
});

// ── Projects ────────────────────────────────────────────────────────────────

app.get('/api/projects', (_req, res) => {
  try {
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
    res.json(projects);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Sessions ────────────────────────────────────────────────────────────────

app.get('/api/sessions/:project', (req, res) => {
  try {
    const projectDir = path.join(PROJECTS_DIR, req.params.project);
    const indexPath = path.join(projectDir, 'sessions-index.json');
    const names = loadNames();
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
    fs.copyFileSync(srcFile, path.join(dstDir, `${req.params.session}.jsonl`));
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

server.listen(PORT, '0.0.0.0', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  Claude History Viewer`);
  console.log(`  ${url}\n`);
  if (settings.autoOpen) {
    const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${cmd} ${url}`, () => {});
  }
});

process.on('SIGINT', () => { flushStatsCache(); process.exit(0); });
process.on('SIGTERM', () => { flushStatsCache(); process.exit(0); });
