import { state, api, apiPost, escapeHtml, truncateText, renderMarkdown } from './state.js';

const COLOR_NAMES = {
  '#fbbf24': 'Yellow', '#34d399': 'Green', '#60a5fa': 'Blue',
  '#f472b6': 'Pink', '#a78bfa': 'Purple',
};

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

  // Find all colors used in highlights
  const colorGroups = {};
  for (const [uuid, anno] of Object.entries(state.annotations)) {
    if (uuid === '_meta' || !anno.highlight) continue;
    const c = anno.highlight;
    if (!colorGroups[c]) colorGroups[c] = [];
    colorGroups[c].push(uuid);
  }

  const colorNotes = meta.colorNotes || {};

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

  // Color note groups
  const colors = Object.keys({ ...colorGroups, ...colorNotes }).filter((v, i, a) => a.indexOf(v) === i);
  if (colors.length) {
    html += '<div class="notes-section"><label class="notes-label">Highlights</label>';
    for (const color of colors) {
      const name = COLOR_NAMES[color] || color;
      const note = colorNotes[color] || {};
      const uuids = colorGroups[color] || [];
      const isOpen = note._open ? 'open' : '';

      html += `
        <div class="color-note" data-color="${color}">
          <div class="color-note-header" data-color="${color}">
            <span class="color-note-dot" style="background:${color}"></span>
            <input class="color-note-title" value="${escapeHtml(note.title || name)}" placeholder="Note title..." data-color="${color}" data-field="title">
            <span class="color-note-count">${uuids.length}</span>
            <button class="color-note-toggle" data-color="${color}">${uuids.length ? '&#9654;' : ''}</button>
          </div>
          <textarea class="color-note-text" placeholder="Add note..." data-color="${color}" data-field="text">${escapeHtml(note.text || '')}</textarea>
          <div class="color-note-links ${isOpen ? '' : 'hidden'}" data-color="${color}">
            ${uuids.map(uuid => {
              const msg = state.displayMessages.find(m => m.uuid === uuid);
              if (!msg) return '';
              const excerpt = msg.role === 'user' ? msg.content : (msg.parts?.find(p => p.type === 'text')?.content || '');
              return `<div class="color-note-link" data-uuid="${uuid}" title="Click to scroll">
                <span class="link-role">${msg.role === 'user' ? 'You' : 'Claude'}</span>
                <span class="link-text">${escapeHtml(truncateText(excerpt, 80))}</span>
              </div>`;
            }).join('')}
          </div>
        </div>`;
    }
    html += '</div>';
  }

  html += '</div>';
  panel.innerHTML = html;

  // Event handlers
  const noteInput = document.getElementById('session-note-input');
  if (noteInput) noteInput.addEventListener('input', () => debounceSave('sessionNote', noteInput.value));

  panel.querySelectorAll('.color-note-title').forEach(el => {
    el.addEventListener('input', () => saveColorNote(el.dataset.color, 'title', el.value));
  });

  panel.querySelectorAll('.color-note-text').forEach(el => {
    el.addEventListener('input', () => saveColorNote(el.dataset.color, 'text', el.value));
  });

  panel.querySelectorAll('.color-note-toggle').forEach(el => {
    el.addEventListener('click', () => {
      const links = panel.querySelector(`.color-note-links[data-color="${el.dataset.color}"]`);
      if (links) { links.classList.toggle('hidden'); el.innerHTML = links.classList.contains('hidden') ? '&#9654;' : '&#9660;'; }
    });
  });

  panel.querySelectorAll('.color-note-link').forEach(el => {
    el.addEventListener('click', () => {
      const target = document.querySelector(`.message[data-uuid="${el.dataset.uuid}"]`);
      if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); target.querySelector('.message-inner')?.classList.add('flash'); }
    });
  });
}

function debounceSave(field, value) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveMetaField(field, value), 500);
}

async function saveMetaField(field, value) {
  const meta = state.annotations._meta || {};
  meta[field] = value;
  await apiPost(
    `/api/annotations/${encodeURIComponent(state.currentProject)}/${encodeURIComponent(state.currentSession)}`,
    { uuid: '_meta', key: field, value: value || false }
  );
  if (!state.annotations._meta) state.annotations._meta = {};
  state.annotations._meta[field] = value;
}

async function saveColorNote(color, field, value) {
  const meta = state.annotations._meta || {};
  const colorNotes = meta.colorNotes || {};
  if (!colorNotes[color]) colorNotes[color] = {};
  colorNotes[color][field] = value;
  await apiPost(
    `/api/annotations/${encodeURIComponent(state.currentProject)}/${encodeURIComponent(state.currentSession)}`,
    { uuid: '_meta', key: 'colorNotes', value: colorNotes }
  );
  if (!state.annotations._meta) state.annotations._meta = {};
  state.annotations._meta.colorNotes = colorNotes;
}
