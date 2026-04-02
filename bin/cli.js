#!/usr/bin/env node

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PID_FILE = path.join(os.tmpdir(), 'claude-journal.pid');
const LOG_FILE = path.join(os.tmpdir(), 'claude-journal.log');

const args = process.argv.slice(2);

// ── Help ────────────────────────────────────────────────────────────────

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  Claude Journal — View, annotate, search, and analyze Claude Code conversations

  Usage:
    claude-journal [options]

  Options:
    -p, --port <port>     Port to listen on (default: 8086)
    -d, --dir <path>      Path to .claude/projects directory
    -o, --open            Auto-open browser on start
    --daemon              Run in background (no terminal needed)
    --stop                Stop the background daemon
    --status              Check if daemon is running
    --auth <user:pass>    Enable basic HTTP auth (for remote access)
    -h, --help            Show this help

  Examples:
    claude-journal                          # Start locally
    claude-journal --open                   # Start and open browser
    claude-journal --daemon                 # Run in background
    claude-journal --stop                   # Stop background process
    claude-journal --auth admin:secret      # With authentication
    claude-journal --daemon --port 9000     # Background on custom port

  Remote access:
    # On server:
    claude-journal --daemon --auth user:pass

    # On local machine (SSH tunnel):
    ssh -L 8086:localhost:8086 user@server

    # Or use VS Code Remote SSH (auto-forwards ports)

  Process managers (recommended for always-on):
    pm2 start claude-journal -- --port 8086
    pm2 save && pm2 startup
  `);
  process.exit(0);
}

// ── Stop ────────────────────────────────────────────────────────────────

if (args.includes('--stop')) {
  if (fs.existsSync(PID_FILE)) {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim());
    try {
      process.kill(pid, 'SIGTERM');
      fs.unlinkSync(PID_FILE);
      console.log(`  Stopped (PID ${pid})`);
    } catch (e) {
      fs.unlinkSync(PID_FILE);
      console.log(`  Process ${pid} not running, cleaned up PID file`);
    }
  } else {
    console.log('  No daemon running');
  }
  process.exit(0);
}

// ── Status ──────────────────────────────────────────────────────────────

if (args.includes('--status')) {
  if (fs.existsSync(PID_FILE)) {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim());
    try {
      process.kill(pid, 0); // Check if alive
      console.log(`  Running (PID ${pid})`);
    } catch {
      fs.unlinkSync(PID_FILE);
      console.log('  Not running (stale PID file cleaned)');
    }
  } else {
    console.log('  Not running');
  }
  process.exit(0);
}

// ── Parse args ──────────────────────────────────────────────────────────

let port, dir, open, daemon, auth;
for (let i = 0; i < args.length; i++) {
  if ((args[i] === '-p' || args[i] === '--port') && args[i + 1]) port = args[++i];
  else if ((args[i] === '-d' || args[i] === '--dir') && args[i + 1]) dir = args[++i];
  else if (args[i] === '-o' || args[i] === '--open') open = true;
  else if (args[i] === '--daemon') daemon = true;
  else if (args[i] === '--auth' && args[i + 1]) auth = args[++i];
}

// ── Daemon mode ─────────────────────────────────────────────────────────

if (daemon) {
  // Check if already running
  if (fs.existsSync(PID_FILE)) {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim());
    try { process.kill(pid, 0); console.log(`  Already running (PID ${pid}). Use --stop first.`); process.exit(1); } catch {}
  }

  // Re-launch self detached, minus --daemon flag
  const childArgs = args.filter(a => a !== '--daemon');
  const out = fs.openSync(LOG_FILE, 'a');
  const child = spawn(process.execPath, [__filename, ...childArgs], {
    detached: true,
    stdio: ['ignore', out, out],
    env: { ...process.env, CLAUDE_JOURNAL_DAEMON: '1' },
  });

  fs.writeFileSync(PID_FILE, String(child.pid));
  child.unref();

  const p = port || 8086;
  console.log(`\n  Claude Journal (daemon)`);
  console.log(`  PID: ${child.pid}`);
  console.log(`  URL: http://localhost:${p}`);
  console.log(`  Log: ${LOG_FILE}`);
  console.log(`  Stop: claude-journal --stop\n`);
  process.exit(0);
}

// ── Set env vars ────────────────────────────────────────────────────────

if (port) process.env.PORT = port;
if (dir) process.env.CLAUDE_PROJECTS_DIR = dir;
if (auth) process.env.CLAUDE_JOURNAL_AUTH = auth;

// ── Start server ────────────────────────────────────────────────────────

require(path.join(__dirname, '..', 'server.js'));

// Auto-open browser
if (open) {
  const p = port || process.env.PORT || 8086;
  const url = `http://localhost:${p}`;
  setTimeout(() => {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    try { execSync(`${cmd} ${url}`, { stdio: 'ignore' }); } catch {}
  }, 1000);
}
