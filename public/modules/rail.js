import { state, truncateText } from './state.js';

export function renderRail() {
  const rail = document.getElementById('conv-rail');
  if (!rail) return;
  rail.innerHTML = '';

  const userMsgs = state.displayMessages.filter(m => m.role === 'user');
  if (userMsgs.length === 0) return;

  for (let i = 0; i < userMsgs.length; i++) {
    const msg = userMsgs[i];
    const anno = state.annotations[msg.uuid] || {};

    const dot = document.createElement('div');
    dot.className = 'rail-dot';
    if (anno.favorite) dot.classList.add('fav');
    dot.dataset.uuid = msg.uuid;
    dot.title = truncateText(msg.content, 50);

    dot.addEventListener('click', () => {
      const el = document.querySelector(`.message[data-uuid="${msg.uuid}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    rail.appendChild(dot);

    if (i < userMsgs.length - 1) {
      const spacer = document.createElement('div');
      spacer.className = 'rail-spacer';
      rail.appendChild(spacer);
    }
  }

  updateRailActive();
}

export function updateRailActive() {
  const container = document.getElementById('messages');
  if (!container) return;
  const dots = document.querySelectorAll('.rail-dot');
  if (dots.length === 0) return;

  dots.forEach(d => d.classList.remove('active'));

  const userEls = container.querySelectorAll('.message.user-msg');
  const scrollMid = container.scrollTop + container.clientHeight / 3;
  let activeIdx = 0;

  userEls.forEach((el, i) => {
    if (el.offsetTop <= scrollMid) activeIdx = i;
  });

  if (dots[activeIdx]) dots[activeIdx].classList.add('active');
}
