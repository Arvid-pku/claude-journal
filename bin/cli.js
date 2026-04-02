#!/usr/bin/env node

const { exec } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const help = args.includes('--help') || args.includes('-h');

if (help) {
  console.log(`
  Claude Journal

  Usage:
    claude-journal [options]

  Options:
    -p, --port <port>     Port to listen on (default: 8086)
    -d, --dir <path>      Path to .claude/projects directory
    -o, --open            Auto-open browser on start
    -h, --help            Show this help

  Examples:
    claude-journal
    claude-journal --port 3000
    claude-journal --dir ~/.claude/projects --open
    npx claude-journal
  `);
  process.exit(0);
}

// Parse args
let port, dir, open;
for (let i = 0; i < args.length; i++) {
  if ((args[i] === '-p' || args[i] === '--port') && args[i + 1]) { port = args[++i]; }
  else if ((args[i] === '-d' || args[i] === '--dir') && args[i + 1]) { dir = args[++i]; }
  else if (args[i] === '-o' || args[i] === '--open') { open = true; }
}

// Set env vars for server.js
if (port) process.env.PORT = port;
if (dir) process.env.CLAUDE_PROJECTS_DIR = dir;

// Load and start server
require(path.join(__dirname, '..', 'server.js'));

// Auto-open if requested via CLI flag
if (open) {
  const p = port || process.env.PORT || 8086;
  const url = `http://localhost:${p}`;
  setTimeout(() => {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${cmd} ${url}`, () => {});
  }, 1000);
}
