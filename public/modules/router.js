export function getRoute() {
  const h = location.hash.slice(1);
  if (!h) return null;
  if (h === 'home') return { page: 'home' };
  const p = h.split('/');
  if (p[0] === 's' && p[1] && p[2]) return { page: 'session', projectId: decodeURIComponent(p[1]), sessionId: p[2] };
  if (p[0] === 'analytics') return { page: 'analytics', projectId: p[1] ? decodeURIComponent(p[1]) : null };
  if (p[0] === 'search') return { page: 'search', query: decodeURIComponent(p.slice(1).join('/') || '') };
  return null;
}

export function navigate(page, params = {}) {
  let h = '';
  if (page === 'home') h = 'home';
  else if (page === 'session') h = `s/${encodeURIComponent(params.projectId)}/${params.sessionId}`;
  else if (page === 'analytics') h = params.projectId ? `analytics/${encodeURIComponent(params.projectId)}` : 'analytics';
  else if (page === 'search') h = `search/${encodeURIComponent(params.query || '')}`;
  if (location.hash !== '#' + h) history.pushState(null, '', '#' + h);
}

export function onRouteChange(cb) {
  window.addEventListener('popstate', () => cb(getRoute()));
}
