<p align="center">
  <h1 align="center">Claude Journal</h1>
  <p align="center">
    <strong>A beautiful, live web interface to view, annotate, search, and analyze your Claude Code conversation history.</strong>
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/claude-journal"><img src="https://img.shields.io/npm/v/claude-journal?color=c6603f&label=npm" alt="npm"></a>
    <a href="https://www.npmjs.com/package/claude-journal"><img src="https://img.shields.io/npm/dm/claude-journal?color=2f7613" alt="downloads"></a>
    <img src="https://img.shields.io/badge/node-%3E%3D18-blue" alt="node">
    <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
  </p>
</p>

---

Claude Journal reads your Claude Code session files (`~/.claude/projects`) and serves them as an elegant, annotatable web UI with live updates, full-text search, analytics dashboards, and Google Docs-style side comments.

## Quick Start

```bash
npx claude-journal
```

That's it. Opens at [http://localhost:8086](http://localhost:8086).

## Installation

### One Command (recommended)

```bash
npx claude-journal --open
```

### Global Install

```bash
npm install -g claude-journal
claude-journal --open
```

### From Source

```bash
git clone https://github.com/Arvid-pku/claude-journal.git
cd claude-journal
npm install
npm start
```

### Docker

```bash
docker build -t claude-journal .
docker run -v ~/.claude/projects:/data -p 8086:8086 claude-journal
```

### Desktop App (Linux)

Download the [AppImage](https://github.com/Arvid-pku/claude-journal/releases) and double-click. Sits in your system tray.

---

## Features

### Conversation Viewer

Browse all your Claude Code sessions across every project. Messages render with full Markdown, syntax-highlighted code blocks, and collapsible tool call details.

- **Live auto-refresh** — watches the session file and updates the view in real-time as Claude responds
- **Subagent expansion** — click "View subagent conversation" inside Agent tool calls to see the full nested conversation inline
- **Project memory viewer** — browse all memory files (MEMORY.md, feedback, project notes) rendered as Markdown
- **Inline message editing** — edit any message directly; changes sync back to the JSONL file
- **Delete messages** — remove messages from the session with confirmation dialog
- **Virtual scrolling** — handles sessions with 500+ messages via CSS `content-visibility`

### Annotations

Annotate your conversations like a research paper.

| Feature | Description |
|---------|-------------|
| **Favorites** | Star important messages. View all starred messages across sessions in the sidebar. |
| **Highlights** | Color-highlight messages (yellow, green, blue, pink, purple). Browse all highlights in the sidebar. |
| **Side Comments** | Google Docs-style comment cards on the right side of messages. Auto-save on blur. |
| **Session Notes** | Freeform scratchpad per session in the notes panel. |
| **Pin Sessions** | Pin important sessions to the top of the sidebar. |

All annotations persist server-side in JSON files and survive page refreshes, server restarts, and browser changes.

### Global Search

Press `/` or `Ctrl+Shift+F` to open the command palette search. Searches across **all sessions in all projects** instantly.

- Full-text search with highlighted snippets
- Keyboard navigation (arrow keys + Enter)
- Click any result to jump directly to that message

### Analytics Dashboard

Comprehensive usage analytics with interactive charts.

- **Summary cards** — total cost, tokens, API calls, tool calls, sessions
- **Daily cost chart** — bar chart with horizontal scroll for long date ranges
- **Daily token usage** — stacked bars (input vs output)
- **Activity heatmap** — day-of-week x hour grid showing when you're most active
- **Tool usage breakdown** — which tools Claude uses most (Bash, Read, Edit, etc.)
- **Model distribution** — cost split across Opus, Sonnet, Haiku
- **Top sessions by cost** — find your most expensive conversations
- **Date range filter** — quick buttons (7d, 14d, 30d, 90d) + custom date pickers
- **Per-project scoping** — filter analytics to a single project

### Session Management

Right-click any session for the context menu:

- **Pin / Unpin** — keep important sessions at the top
- **Rename** — inline editing, syncs to JSONL so `claude --resume <name>` works
- **Duplicate** — create a copy of the session
- **Move** — move between projects
- **Delete** — remove session and all associated data

### Sidebar (Claude.ai-inspired)

The sidebar mirrors Claude.ai's design:

- **Collapsible** — shrinks to a 48px icon rail showing key actions
- **Home** — overview page with recent sessions and keyboard shortcuts
- **Search** — global cross-session search
- **Analytics** — usage dashboard
- **Starred / Highlights / Notes** — browse all annotations across sessions
- **Recents** — session list grouped by pinned + recent, with cost and token counts

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` | Global search |
| `j` / `k` | Navigate between messages |
| `n` / `p` | Jump between conversation turns |
| `Ctrl+F` | Search within current session |
| `Ctrl+Shift+F` | Global search |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+E` | Export session as Markdown |
| `g` then `h` | Go home |
| `g` then `a` | Analytics |
| `g` then `m` | Project memory |
| `g` then `n` | Notes panel |
| `g` then `s` | Settings |

### Settings

Configurable via the gear icon:

- **Theme** — dark / light (Claude.ai-inspired warm light theme)
- **Font size** — small / default / large
- **Compact mode** — denser message layout
- **Message width** — adjustable max width (400-2000px)
- **Show/hide** — timestamps, token usage, cost estimates, thinking blocks
- **System tags** — strip `<system-reminder>` and other meta tags
- **Tool calls** — expand by default, max output preview length
- **Session sort** — newest, oldest, most messages, highest cost, alphabetical
- **Auto-scroll** — on live update

### Export

Export any session as Markdown with one click (`Ctrl+E`). Includes favorites, notes, and all message content.

### PWA Support

Install as a Progressive Web App for a native-like experience:
- Works offline (cached static assets)
- Installable on desktop and mobile
- API responses cached for offline viewing

---

## CLI Reference

```
claude-journal [options]

Options:
  -p, --port <port>     Port (default: 8086, auto-increments if busy)
  -d, --dir <path>      Path to .claude/projects directory
  -o, --open            Auto-open browser
  --daemon              Run in background
  --stop                Stop background daemon
  --status              Check daemon status
  --auth <user:pass>    Enable HTTP basic auth
  -h, --help            Show help
```

### Examples

```bash
# Basic
claude-journal

# Background with auto-open
claude-journal --daemon --open

# Custom port with auth (for remote access)
claude-journal --daemon --port 9000 --auth admin:secret

# Check status / stop
claude-journal --status
claude-journal --stop
```

---

## Remote Access

If Claude Code runs on a remote server:

**SSH tunnel (recommended):**
```bash
# On server:
claude-journal --daemon

# On local machine:
ssh -L 8086:localhost:8086 user@server
# Open http://localhost:8086
```

**VS Code Remote SSH:**
Just run `claude-journal` in the VS Code terminal — ports auto-forward.

**With auth (direct access):**
```bash
# On server:
claude-journal --daemon --auth user:pass --port 8086
# Access directly at http://server:8086
```

---

## Architecture

```
claude-journal/
  server.js              Express + WebSocket server
  bin/cli.js             CLI with daemon mode
  public/
    index.html           Single-page app shell
    style.css            Full stylesheet (dark + light themes)
    sw.js                Service worker (PWA)
    manifest.json        PWA manifest
    modules/
      main.js            App init, routing, events
      state.js           Shared state, utilities, icons
      sidebar.js         Sidebar, session list, context menu
      messages.js        Message rendering, tool blocks, editing
      rail.js            Conversation minimap
      notes.js           Notes panel
      search.js          Global search palette
      analytics.js       Analytics dashboard + charts
      toast.js           Toast notifications
      router.js          Hash-based routing
  tray/                  Electron system tray app (optional)
  launchers/             Double-click launchers (macOS/Windows/Linux)
  tests/                 Playwright E2E tests
  Dockerfile             Docker support
```

**No build step.** Pure vanilla JS with ES modules. No React, no bundler, no transpiler.

---

## How It Works

Claude Code stores conversation history as JSONL files in `~/.claude/projects/`. Claude Journal reads these files directly:

1. **Server** scans the projects directory, parses JSONL, computes stats (cached by mtime)
2. **WebSocket** watches the active session file with `chokidar` for live updates
3. **Annotations** (favorites, highlights, comments) are stored separately in `annotations/` as JSON
4. **Search index** is built in-memory from all JSONL files, cached for 60 seconds
5. **Analytics** are computed on-the-fly from message usage data with cost estimation

All file writes (edits, renames, deletes) use atomic write (temp file + rename) to prevent corruption from concurrent Claude Code access.

---

## License

MIT
