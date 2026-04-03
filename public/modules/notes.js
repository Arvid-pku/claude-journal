import { state, api, apiPost, escapeHtml, truncateText } from './state.js';

let saveTimer = null;

export function toggleNotesPanel() {
  const panel = document.getElementById('notes-panel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) renderNotesPanel();
}

export function renderNotesPanel() {
  const panel = document.getElementById('notes-panel');
  if (panel.classList.contains('hidden') || !state.currentSession) return;

  const meta = state.annotations._meta || {};
  const sessionNote = meta.sessionNote || '';

  // Collect all messages with comments
  const comments = [];
  for (const [uuid, anno] of Object.entries(state.annotations)) {
    if (uuid === '_meta') continue;
    const text = anno.comment || anno.note;
    if (!text) continue;
    const msg = state.displayMessages.find(m => m.uuid === uuid);
    if (!msg) continue;
    const excerpt = msg.role === 'user' ? msg.content : (msg.parts?.find(p => p.type === 'text')?.content || '');
    comments.push({ uuid, text, excerpt, role: msg.role, highlight: anno.highlight });
  }

  let html = `
    <div class="notes-header">
      <span class="notes-title">Notes</span>
      <button class="icon-btn" onclick="document.getElementById('notes-panel').classList.add('hidden')" title="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="notes-body">
      <div class="notes-section">
        <label class="notes-label">Session Notes</label>
        <textarea class="notes-textarea" id="session-note-input" placeholder="Write session notes here...">${escapeHtml(sessionNote)}</textarea>
      </div>`;

  if (comments.length) {
    html += `<div class="notes-section"><label class="notes-label">Comments (${comments.length})</label>`;
    for (const c of comments) {
      const color = c.highlight || 'var(--accent)';
      html += `
        <div class="note-item" data-uuid="${c.uuid}">
          <div class="note-item-header">
            <span class="note-item-role ${c.role}">${c.role === 'user' ? 'You' : 'Claude'}</span>
            <span class="note-item-excerpt">${escapeHtml(truncateText(c.excerpt, 50))}</span>
          </div>
          <div class="note-item-text" style="border-left-color:${color}">${escapeHtml(c.text)}</div>
        </div>`;
    }
    html += '</div>';
  }

  html += '</div>';
  panel.innerHTML = html;

  // Wire events
  const noteInput = document.getElementById('session-note-input');
  if (noteInput) noteInput.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveSessionNote(noteInput.value), 500);
  });

  panel.querySelectorAll('.note-item').forEach(el => {
    el.addEventListener('click', () => {
      const target = document.querySelector(`.message[data-uuid="${el.dataset.uuid}"]`);
      if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); target.querySelector('.message-inner')?.classList.add('flash'); }
    });
  });
}

async function saveSessionNote(value) {
  try {
    await apiPost(
      `/api/annotations/${encodeURIComponent(state.currentProject)}/${encodeURIComponent(state.currentSession)}`,
      { uuid: '_meta', key: 'sessionNote', value: value || false }
    );
    if (!state.annotations._meta) state.annotations._meta = {};
    state.annotations._meta.sessionNote = value;
  } catch {}
}
