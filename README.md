<p align="center">
  <h1 align="center">Claude Journal</h1>
  <p align="center">
    <strong>Not just a viewer. Talk to your AI, edit history, and manage every conversation.</strong><br>
    <em>For Claude Code and OpenAI Codex. Changes write back to the real files.</em>
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
npm install -g claude-journal
claude-journal --daemon --port 5249
```

Then open [http://localhost:5249](http://localhost:5249). It finds your `~/.claude/projects` and `~/.codex/sessions` automatically.

After a reboot, just run the same command again — no reinstall needed.

---

## This Is Not Just a Viewer

Most conversation history tools are read-only. Claude Journal is different:

### Talk Directly from the Browser

<p align="center">
  <img src="figures/Talk.png" alt="Chat with Claude Code from the browser" width="700">
</p>

Type a message in the floating input box and Claude Code (or Codex) **resumes the exact conversation** — same session, same context. The response streams in real-time via the live file watcher. No terminal needed.

### Edit Your Real History

<p align="center">
  <img src="figures/Session Introduction.jpg" alt="Session view with annotations and editing" width="800">
</p>

Every change writes back to the actual files on disk:

| Action | What happens |
|--------|-------------|
| **Rename session** | Writes `custom-title` to the JSONL. `claude --resume "new-name"` picks it up immediately. |
| **Edit message** | Updates the message content in the JSONL file. Change prompts, fix typos, clean up conversations. |
| **Delete message** | Removes the line from the JSONL. Permanently erases that message from history. |
| **Duplicate session** | Creates a new JSONL file — a full copy you can experiment with. |
| **Move session** | Moves the JSONL between project directories (with collision detection). |

All writes are atomic (temp file + rename) — safe even while Claude Code is actively writing to the same file.

---

## Features

### Annotations

Star, highlight (5 colors), comment, tag, and pin any message or session. Google Docs-style side comments with auto-save. Browse all annotations across sessions in the sidebar (Starred / Highlights / Notes / Tags). Annotations are stored separately — your JSONL files stay clean.

### Analytics Dashboard

<p align="center">
  <img src="figures/Analytics.png" alt="Analytics dashboard" width="600">
</p>

Daily cost and token charts, activity heatmaps, tool usage breakdown, model distribution, top sessions by cost. Filter by date range and per-project. Works across both Claude Code and Codex.

### Smart Display

- **Diff view for Edit calls** — red/green unified diff instead of raw old/new text
- **Tool call grouping** — 3+ consecutive tools collapsed into a summary
- **Session timeline** — overview card showing first prompt, files touched, tool usage bars
- **Code copy buttons** — one-click copy on every code block
- **Subagent expansion** — view nested Agent conversations inline
- **Message type filters** — toggle Human, Assistant, Tool Calls, Thinking, and specific tool types
- **Collapsible messages** — fold long messages by clicking the header

### Multi-Provider Support

Claude Code and OpenAI Codex in one unified interface. Collapsible provider sections in the sidebar. Right-click project folders to pin or hide them. Filter by provider in Settings.

### Session Management

Right-click any session: Pin, Rename, Duplicate, Move, Delete, Select Multiple (batch delete). Right-click project folders: Pin to top, Hide.

### Keyboard Shortcuts

Press `?` for the full list. Highlights: `/` search, `j/k` navigate, `Ctrl+E` export, `Ctrl+B` sidebar, `g+a` analytics.

### Export

Markdown or self-contained HTML (with inline CSS, shareable with anyone).

### Everything Is Toggleable

Every feature can be disabled in Settings. Users who prefer simplicity can turn off avatars, timeline, diff view, tool grouping, code copy buttons, tags, and more.

---

## Installation

### Global Install (recommended)

```bash
npm install -g claude-journal
claude-journal --daemon --port 5249
```

### Other Options

```bash
npx claude-journal                          # Run directly without install
claude-journal --daemon                     # Background mode (default port 8086)
claude-journal --status                     # Check: Running (PID 12345) at http://localhost:5249
claude-journal --stop                       # Stop the daemon
```

For auto-start on login:
```bash
pm2 start claude-journal -- --daemon --no-open --port 5249
pm2 save && pm2 startup
```

### Desktop App

Download [AppImage / DMG / EXE](https://github.com/Arvid-pku/claude-journal/releases) from GitHub Releases.

> **macOS users:** The app is not code-signed. macOS will show _"damaged"_. Fix:
> ```bash
> xattr -cr "/Applications/Claude Journal.app"
> ```

<details>
<summary>Docker / from source</summary>

```bash
# From source
git clone https://github.com/Arvid-pku/claude-journal.git
cd claude-journal && npm install && npm start

# Docker
docker build -t claude-journal .
docker run -v ~/.claude/projects:/data -p 5249:5249 -e PORT=5249 claude-journal
```
</details>

### Remote Access

```bash
# SSH tunnel (recommended):
ssh -L 5249:localhost:5249 user@server

# Or with auth for direct access:
claude-journal --daemon --auth user:pass --port 5249
```

VS Code Remote SSH auto-forwards ports — just run `claude-journal` in the terminal.

---

## Architecture

```
claude-journal/
  server.js                Express + WebSocket server (chat, annotations, analytics)
  bin/cli.js               CLI with daemon mode, Node 18+ check
  providers/
    codex.js               Codex provider (reads ~/.codex/, SQLite + JSONL)
  public/
    modules/               Vanilla JS ES modules (no build step)
      main.js              App init, routing, chat, keyboard shortcuts
      messages.js           Rendering, diff view, timeline, tool grouping, tags
      sidebar.js           Session list, project management, bulk ops
      analytics.js         Charts, heatmaps, project dashboard
      search.js            Global search with filters
      state.js             Shared state, utilities, diff algorithm
  tray/                    Electron system tray app (optional)
  tests/                   Playwright E2E tests
```

**No build step.** Pure vanilla JS with ES modules. No React, no bundler, no transpiler.

---

## How It Works

1. **Server** scans `~/.claude/projects/` and `~/.codex/sessions/` for conversations
2. **Codex provider** normalizes Codex events (`function_call`, `reasoning`, etc.) into Claude format
3. **WebSocket** watches active session files for live updates, and pipes chat messages to `claude`/`codex` CLI
4. **Annotations** stored separately in `annotations/` — never modifies conversation files unless you explicitly edit/delete
5. **Chat** spawns `claude --resume <id> --print` or `codex exec resume <id> --json` as a subprocess
6. **All edits** use atomic writes to prevent corruption from concurrent access

---

## Known Limitations & Help Wanted

Claude Journal is a side project that grew into something useful. There are rough edges:

| Limitation | Details |
|-----------|---------|
| **No Codex message editing** | Codex JSONL format (`event_msg`/`response_item` wrappers) is different from Claude's. Edit/delete for individual Codex messages is not yet implemented. |
| **Cost estimation is approximate** | Shows API-equivalent cost (input + output tokens). Cache tokens are excluded. Actual billing depends on your subscription plan. |
| **No mobile layout** | The UI is desktop-only. Sidebar doesn't adapt to small screens. |
| **Unsigned desktop app** | macOS requires `xattr -cr` to open. Proper code signing needs an Apple Developer certificate ($99/year). |
| **Single-user only** | No user accounts, no multi-tenant support. Designed for personal use on your own machine. |
| **Flaky live updates during edits** | The WebSocket file watcher can occasionally rebuild the DOM while you're interacting with a message. |

**Contributions welcome!** If you'd like to help with any of these, please open an issue or PR at [github.com/Arvid-pku/claude-journal](https://github.com/Arvid-pku/claude-journal).

Ideas that would be great to have:
- Mobile-responsive layout
- Codex message editing support
- Apple code signing for the .dmg
- More providers (Cursor, Windsurf, Aider, etc.)
- Session comparison (side-by-side diff of two conversations)
- Conversation summarization (auto-generated session summaries)

---

## Requirements

- **Node.js** 18 or later
- **Claude Code** (`~/.claude/projects/`) and/or **OpenAI Codex** (`~/.codex/sessions/`)

## License

MIT
