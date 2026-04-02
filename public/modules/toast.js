const container = document.createElement('div');
container.id = 'toast-container';
document.body.appendChild(container);

export function toast(message, type = 'info', duration = 3000) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, duration);
}

export function loading(message = 'Loading...') {
  const el = document.createElement('div');
  el.className = 'toast toast-loading show';
  el.innerHTML = `<span class="spinner"></span>${message}`;
  container.appendChild(el);
  return () => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); };
}
