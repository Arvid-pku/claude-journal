<p align="center">
  <h1 align="center">Claude Journal</h1>
  <p align="center">
    <strong>View, annotate, search, and analyze your Claude Code & Codex conversations.</strong><br>
    <em>Edit messages, rename sessions, delete history — changes write back to the real files.</em>
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/claude-journal"><img src="https://img.shields.io/npm/v/claude-journal?color=c6603f&label=npm" alt="npm"></a>
    <a href="https://www.npmjs.com/package/claude-journal"><img src="https://img.shields.io/npm/dm/claude-journal?color=2f7613" alt="downloads"></a>
    <img src="https://img.shields.io/badge/node-%3E%3D18-blue" alt="node">
    <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
  </p>
</p>

<p align="center">
  <img src="figures/mainpage.png" alt="Claude Journal — Home" width="800">
</p>

## Quick Start

```bash
npx claude-journal
```

Opens automatically in your browser. No config needed — it finds your `~/.claude/projects` and `~/.codex/sessions` automatically.

## Why Claude Journal?

**Your conversations are files.** Claude Code stores every session as JSONL in `~/.claude/projects/`. Codex stores them in `~/.codex/sessions/`. Claude Journal reads these files directly and gives you a powerful web UI on top of them.

**Changes are real.** When you rename a session, it writes a `custom-title` entry to the JSONL — so `claude --resume "my-name"` works. When you edit a message, the JSONL file is updated. When you delete a message, it's gone from the file. This isn't a read-only viewer — it's a tool that integrates with your workflow.

**Both Claude Code and Codex.** One unified interface for all your AI coding conversations. Sessions are grouped by project, with collapsible provider sections.

---

## Installation

### CLI (recommended)

```bash
npx claude-journal              # Run directly, opens browser
npm install -g claude-journal   # Or install globally first
claude-journal                  # Then run anytime
```

### Run in Background

```bash
claude-journal --daemon         # Runs without a terminal window
claude-journal --status         # Check: Running (PID 12345) at http://localhost:8086
claude-journal --stop           # Stop it
```

The daemon survives closing your terminal. After a reboot, just run `claude-journal --daemon` again — no reinstall needed. For auto-start on login:

```bash
pm2 start claude-journal -- --daemon --no-open
pm2 save && pm2 startup
```

### Desktop App

Download the [AppImage / DMG / EXE](https://github.com/Arvid-pku/claude-journal/releases) from GitHub Releases. Sits in your system tray, starts the server automatically, and opens in your browser.

> **macOS users:** The app is not code-signed. macOS will show _"Claude Journal is damaged"_. Fix:
> ```bash
> xattr -cr "/Applications/Claude Journal.app"
> ```
> Then open the app again — it will work normally.

> **Linux users:** Make the AppImage executable: `chmod +x Claude-Journal-*.AppImage`

<details>
<summary>More options (Docker, from source)</summary>

**From source:**
```bash
git clone https://github.com/Arvid-pku/claude-journal.git
cd claude-journal && npm install && npm start
```

**Docker:**
```bash
docker build -t claude-journal .
docker run -v ~/.claude/projects:/data -p 8086:8086 claude-journal
```
</details>

---

## Core Power: Edit Your History

<p align="center">
  <img src="figures/Session Introduction.jpg" alt="Session view with annotations and editing" width="800">
</p>

Claude Journal isn't just a viewer — it modifies the actual conversation files:

| Action | What happens to the file |
|--------|--------------------------|
| **Rename session** | Writes `custom-title` to the JSONL. `claude --resume "new-name"` picks it up immediately. |
| **Edit message** | Updates the message content in the JSONL file. Change prompts, fix typos, clean up conversations. |
| **Delete message** | Removes the line from the JSONL. Permanently erases that message from history. |
| **Duplicate session** | Creates a new JSONL file — a full copy you can experiment with. |
| **Move session** | Moves the JSONL file between project directories (with collision detection). |

All file writes use atomic operations (temp file + rename) to prevent corruption, even while Claude Code is actively writing to the same file.

---

## Features at a Glance

### Annotations

Star, highlight (5 colors), comment, and tag any message. Add session notes. Pin important sessions. All annotations are stored separately — your JSONL files stay clean.

### Live Auto-Refresh

The lightning icon enables real-time watching. As Claude responds, new messages appear instantly — no page refresh needed.

### Global Search

Press `/` to search across **all sessions in all projects**. Filter by role, tool type, and date range.

### Analytics Dashboard

<p align="center">
  <img src="figures/Analytics.png" alt="Analytics dashboard" width="600">
</p>

Daily cost and token charts, activity heatmaps, tool usage breakdown, model distribution, top sessions by cost. Filter by date range (7d/14d/30d/90d or custom) and per-project.

### Multi-Provider Support

Claude Code (`~/.claude/projects/`) and OpenAI Codex (`~/.codex/sessions/`) in one view. Collapsible provider sections in the sidebar. Filter by provider in Settings.

---

## Detailed Features

### Conversation Viewer

- **Full Markdown rendering** with syntax-highlighted code blocks and **copy button** on every code block
- **Collapsible tool calls** — click to expand Bash, Read, Edit, Grep, etc.
- **Diff view for Edit calls** — red/green unified diff instead of raw text
- **Tool call grouping** — 3+ consecutive tools are collapsed into a summary (e.g. "5 tool calls: Read x2, Bash x3")
- **Session timeline** — overview card at top showing first prompt, files touched, and tool usage bars
- **Subagent expansion** — click "View subagent conversation" to see nested Agent conversations inline
- **Message avatars** — colored circles (Y/C/X) for visual scanning
- **Virtual scrolling** — handles 500+ message sessions via `content-visibility`
- **Message type filters** — funnel icon toggles visibility of Human, Assistant, Tool Calls, Thinking, Subagent, and specific tool types (Read, Edit, Bash, Grep, Web)

### Annotations System

| Feature | Description |
|---------|-------------|
| **Favorites** | Star messages. Browse all starred messages across sessions in the sidebar. |
| **Highlights** | 5 colors (yellow, green, blue, pink, purple). Browse in sidebar. |
| **Side Comments** | Google Docs-style cards on the right. Auto-save with "Saved" indicator. |
| **Tags** | Custom labels (e.g. "bug", "insight"). Click to remove. Browse all tags in sidebar. |
| **Session Notes** | Freeform scratchpad per session. |
| **Pin Sessions** | Keep important sessions at the top of the sidebar. |

Annotations persist in JSON files and survive restarts, browser changes, and page refreshes.

### Session Management

Right-click any session for the context menu:

- **Pin / Unpin** — keep at top
- **Rename** — inline editing, syncs to JSONL for `claude --resume`
- **Duplicate** — full copy with "(Copy)" prefix
- **Move** — to another project (with collision detection)
- **Select multiple** — enter multi-select mode for batch delete
- **Delete** — removes JSONL, subagent data, and annotations

### Sidebar

Mirrors Claude.ai's design:

- **Collapsible** — shrinks to a 48px icon rail
- **Home** — recent sessions, stats, keyboard shortcuts
- **Search** — global cross-session search
- **Analytics** — usage dashboard
- **Starred / Highlights / Notes / Tags** — browse annotations across all sessions
- **Provider sections** — collapsible "Claude Code" and "Codex" groups with session counts
- **Filter box** — search sessions by name with live count updates (e.g. "3/10")

### Keyboard Shortcuts

Press `?` to see all shortcuts in-app.

| Key | Action |
|-----|--------|
| `/` | Global search |
| `?` | Show shortcuts help |
| `j` / `k` | Navigate between messages |
| `n` / `p` | Jump between conversation turns |
| `Ctrl+F` | Search within session |
| `Ctrl+Shift+F` | Global search |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+E` | Export (Markdown or HTML) |
| `Escape` | Close any modal, exit bulk mode |
| `g` then `h/a/m/n/s` | Go to Home / Analytics / Memory / Notes / Settings |

### Export

- **Markdown** — full conversation with favorites and notes
- **HTML** — self-contained file with inline CSS, shareable with anyone

### Settings

Everything is toggleable — users who prefer simplicity can disable any feature:

| Category | Options |
|----------|---------|
| **Display** | Theme (dark/light), font size, compact mode, message width, avatars, timestamps |
| **Features** | Code copy buttons, collapsible messages, diff view, tool grouping, session timeline, loading skeletons, smooth scroll, tags, HTML export, advanced search, bulk operations, project dashboard |
| **Sessions** | Provider filter (All/Claude/Codex), sort order, auto-scroll on live update |
| **Server** | Projects directory, auto-open browser |

### PWA Support

Install as a Progressive Web App. Works offline with cached assets and API responses. Graceful fallback if CDN libraries (highlight.js, marked.js) are unavailable.

---

## CLI Reference

```
claude-journal [options]

Options:
  -p, --port <port>     Port (default: 8086, auto-increments if busy)
  -d, --dir <path>      Path to .claude/projects directory
  -o, --open            Auto-open browser (default in interactive mode)
  --no-open             Suppress browser auto-open
  --daemon              Run in background
  --stop                Stop background daemon
  --status              Check daemon status (shows PID and URL)
  --auth <user:pass>    Enable HTTP basic auth
  -h, --help            Show help
```

### Daemon Mode

```bash
claude-journal --daemon        # Start in background
claude-journal --status        # Running (PID 12345) at http://localhost:8086
claude-journal --stop          # Stop the daemon
```

The daemon survives closing your terminal but not reboots. Just run `claude-journal` again after a reboot — no reinstall needed. For auto-start on login, use pm2:

```bash
npm install -g pm2
pm2 start claude-journal -- --no-open
pm2 save && pm2 startup
```

### Remote Access

```bash
# SSH tunnel (recommended):
ssh -L 8086:localhost:8086 user@server

# Or with auth for direct access:
claude-journal --daemon --auth user:pass --port 8086
```

VS Code Remote SSH auto-forwards ports — just run `claude-journal` in the terminal.

---

## Architecture

```
claude-journal/
  server.js                Express + WebSocket server
  bin/cli.js               CLI with daemon mode, Node 18+ check
  providers/
    codex.js               Codex provider (reads ~/.codex/)
  public/
    index.html             SPA shell
    style.css              Dark + light themes
    sw.js                  Service worker (PWA)
    modules/
      main.js              App init, routing, events, keyboard shortcuts
      state.js             Shared state, utilities, settings, diff algorithm
      sidebar.js           Sidebar, session list, context menu, bulk ops
      messages.js           Message rendering, tool blocks, timeline, tags
      analytics.js         Analytics dashboard, project dashboard
      search.js            Global search with filters
      notes.js             Notes panel
      rail.js              Conversation minimap
      router.js            Hash-based routing
      toast.js             Toast notifications
  tray/                    Electron system tray app (optional)
  tests/                   Playwright E2E tests
```

**No build step.** Pure vanilla JS with ES modules. No React, no bundler, no transpiler.

---

## How It Works

1. **Server** scans `~/.claude/projects/` (JSONL) and `~/.codex/sessions/` (JSONL + SQLite) for conversations
2. **Codex provider** normalizes Codex message format (function_call, reasoning, etc.) into the same structure as Claude Code
3. **WebSocket** watches the active session file with `chokidar` for live updates
4. **Annotations** are stored separately in `annotations/` as JSON — never modifies conversation files unless you explicitly edit/delete
5. **Analytics** computed on-the-fly from token usage data with cost estimation (input + output tokens only, no cache charges)
6. **All edits** (message edits, renames, deletes) use atomic writes to prevent corruption from concurrent access

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Port already in use | Auto-tries next 10 ports, or use `--port 9000` |
| Projects directory not found | Set in Settings or use `--dir /path/to/.claude/projects` |
| Node.js too old | Requires Node 18+. Check with `node -v` |
| macOS "damaged" app | Run `xattr -cr "Claude Journal.app"` (unsigned Electron app) |
| Docker: no sessions | Mount your projects: `-v ~/.claude/projects:/data` |
| Codex sessions not showing | Codex stores data in `~/.codex/`. Ensure you have sessions there |

---

## Requirements

- **Node.js** 18 or later
- **Claude Code** conversations in `~/.claude/projects/` and/or **Codex** sessions in `~/.codex/sessions/`

## License

MIT
