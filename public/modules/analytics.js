import { state, api, formatNum, formatCost, escapeHtml, shortenPath, shortToolName } from './state.js';
import { navigate } from './router.js';

let currentFrom = '', currentTo = '';

function isRangeActive(days) {
  if (!currentFrom || !currentTo) return false;
  const from = new Date(currentFrom), to = new Date(currentTo);
  const diff = Math.round((to - from) / 86400000);
  return diff === days;
}

export async function showAnalytics(projectId, from, to) {
  if (from !== undefined) currentFrom = from || '';
  if (to !== undefined) currentTo = to || '';

  const container = document.getElementById('messages');
  container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">Loading analytics...</div>';
  try {
    let url = '/api/analytics?';
    if (projectId) url += `project=${encodeURIComponent(projectId)}&`;
    if (currentFrom) url += `from=${currentFrom}&`;
    if (currentTo) url += `to=${currentTo}&`;
    const data = await api(url);
    container.innerHTML = renderDashboard(data, projectId);

    // Wire controls
    // Auto-scroll charts to the right (most recent)
    document.querySelectorAll('.bar-chart-wrap').forEach(el => { el.scrollLeft = el.scrollWidth; });

    document.getElementById('analytics-scope')?.addEventListener('change', (e) => {
      const pid = e.target.value || null;
      navigate('analytics', { projectId: pid });
      showAnalytics(pid);
    });
    document.getElementById('analytics-from')?.addEventListener('change', (e) => showAnalytics(projectId, e.target.value, undefined));
    document.getElementById('analytics-to')?.addEventListener('change', (e) => showAnalytics(projectId, undefined, e.target.value));
    document.getElementById('analytics-reset-dates')?.addEventListener('click', () => showAnalytics(projectId, '', ''));
    document.querySelector('[data-range-all]')?.addEventListener('click', () => showAnalytics(projectId, '', ''));

    // Quick range buttons
    document.querySelectorAll('[data-range]').forEach(btn => btn.addEventListener('click', () => {
      const days = parseInt(btn.dataset.range);
      const to = new Date(); const from = new Date(to);
      from.setDate(from.getDate() - days);
      showAnalytics(projectId, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
    }));
  } catch (err) {
    container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red)">Failed: ${escapeHtml(err.message)}</div>`;
  }
}

function renderDashboard(data, projectId) {
  const title = projectId ? shortenPath(state.projects.find(p => p.id === projectId)?.projectPath || projectId) : 'All Projects';
  const avgCostPerMsg = data.totalMsgs ? (data.totalCost / data.totalMsgs) : 0;
  const avgTokensPerMsg = data.totalMsgs ? Math.round((data.totalInput + data.totalOutput) / data.totalMsgs) : 0;

  const dateLabel = currentFrom || currentTo
    ? `${currentFrom || '...'} to ${currentTo || 'now'}`
    : 'All time';

  return `
    <div class="analytics-dashboard">
      <div class="analytics-header">
        <h2>Analytics: ${escapeHtml(title)}</h2>
        <select id="analytics-scope" class="modal-select" style="width:auto">
          <option value="">All Projects</option>
          ${state.projects.map(p => `<option value="${p.id}" ${p.id === projectId ? 'selected' : ''}>${escapeHtml(shortenPath(p.projectPath))}</option>`).join('')}
        </select>
      </div>
      <div class="analytics-date-bar">
        <div class="date-range-picks">
          <button class="date-range-btn ${!currentFrom && !currentTo ? 'active' : ''}" data-range-all>All</button>
          <button class="date-range-btn ${isRangeActive(7) ? 'active' : ''}" data-range="7">7d</button>
          <button class="date-range-btn ${isRangeActive(14) ? 'active' : ''}" data-range="14">14d</button>
          <button class="date-range-btn ${isRangeActive(30) ? 'active' : ''}" data-range="30">30d</button>
          <button class="date-range-btn ${isRangeActive(90) ? 'active' : ''}" data-range="90">90d</button>
        </div>
        <div class="date-range-custom">
          <input type="date" id="analytics-from" value="${currentFrom}" title="From date">
          <span style="color:var(--text-muted)">—</span>
          <input type="date" id="analytics-to" value="${currentTo}" title="To date">
          ${currentFrom || currentTo ? '<button id="analytics-reset-dates" class="date-range-btn" title="Clear dates">Clear</button>' : ''}
        </div>
      </div>

      ${renderCards(data, avgCostPerMsg, avgTokensPerMsg)}

      <div class="analytics-grid">
        <div class="analytics-col">
          ${renderCostChart(data)}
          ${renderTokenChart(data)}
          ${renderHeatmap(data)}
        </div>
        <div class="analytics-col analytics-col-sm">
          ${renderToolUsage(data)}
          ${renderModelDist(data)}
          ${renderTopSessions(data)}
          ${renderProjectDashboard(data, projectId)}
        </div>
      </div>
    </div>`;
}

// ── Summary Cards ───────────────────────────────────────────────────────

function renderCards(data, avgCost, avgTok) {
  const cards = [
    { value: formatCost(data.totalCost), label: 'Total Cost', cls: '' },
    { value: formatNum(data.totalInput + data.totalOutput), label: 'Total Tokens', cls: '' },
    { value: data.totalMsgs.toLocaleString(), label: 'API Calls', cls: '' },
    { value: data.totalUserMsgs?.toLocaleString() || '0', label: 'Your Messages', cls: '' },
    { value: data.totalToolCalls?.toLocaleString() || '0', label: 'Tool Calls', cls: '' },
    { value: data.sessionCount.toString(), label: 'Sessions', cls: '' },
    { value: formatCost(avgCost), label: 'Avg Cost/Call', cls: 'sm' },
    { value: formatNum(avgTok), label: 'Avg Tokens/Call', cls: 'sm' },
  ];
  return `<div class="analytics-cards">${cards.map(c =>
    `<div class="acard ${c.cls}"><div class="acard-value">${c.value}</div><div class="acard-label">${c.label}</div></div>`
  ).join('')}</div>`;
}

// ── Daily Cost Chart ────────────────────────────────────────────────────

function renderCostChart(data) {
  const days = Object.entries(data.byDay).sort(([a], [b]) => a.localeCompare(b)).slice(-30);
  if (!days.length) return '';
  const max = Math.max(...days.map(([, v]) => v.cost), 0.01);
  return `
    <div class="analytics-section">
      <h3>Daily Cost</h3>
      <div class="bar-chart-wrap"><div class="bar-chart">${days.map(([day, v]) => {
        const pct = (v.cost / max * 100).toFixed(1);
        return `<div class="bar-col" title="${day}: ${formatCost(v.cost)} (${v.msgs} calls)"><div class="bar" style="height:${pct}%"></div></div>`;
      }).join('')}</div><div class="bar-labels">${days.map(([day]) => `<div class="bar-label">${day.slice(5)}</div>`).join('')}</div></div>
    </div>`;
}

// ── Daily Token Chart ───────────────────────────────────────────────────

function renderTokenChart(data) {
  const days = Object.entries(data.byDay).sort(([a], [b]) => a.localeCompare(b)).slice(-30);
  if (!days.length) return '';
  const max = Math.max(...days.map(([, v]) => v.input + v.output), 1);
  return `
    <div class="analytics-section">
      <h3>Daily Tokens</h3>
      <div class="bar-chart-wrap"><div class="bar-chart">${days.map(([day, v]) => {
        const inP = (v.input / max * 100).toFixed(1);
        const outP = (v.output / max * 100).toFixed(1);
        return `<div class="bar-col" title="${day}: ${formatNum(v.input)} in / ${formatNum(v.output)} out"><div class="bar-stack"><div class="bar bar-input" style="height:${inP}%"></div><div class="bar bar-output" style="height:${outP}%"></div></div></div>`;
      }).join('')}</div><div class="bar-labels">${days.map(([day]) => `<div class="bar-label">${day.slice(5)}</div>`).join('')}</div></div>
      <div class="chart-legend"><span class="legend-item"><span class="legend-dot" style="background:var(--accent)"></span>Input</span><span class="legend-item"><span class="legend-dot" style="background:var(--green)"></span>Output</span></div>
    </div>`;
}

// ── Activity Heatmap (day-of-week x hour) ───────────────────────────────

function renderHeatmap(data) {
  if (!data.byHour) return '';
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const maxVal = Math.max(...Object.values(data.byHour), 1);

  let cells = '';
  for (let d = 0; d < 7; d++) {
    cells += `<div class="heatmap-row"><span class="heatmap-day">${dayNames[d]}</span>`;
    for (let h = 0; h < 24; h++) {
      const v = data.byHour[`${d}-${h}`] || 0;
      const intensity = v / maxVal;
      const opacity = v === 0 ? 0 : Math.max(0.15, intensity);
      cells += `<div class="heatmap-cell" style="opacity:${opacity}" title="${dayNames[d]} ${h}:00 — ${v} messages"></div>`;
    }
    cells += '</div>';
  }

  // Hour labels
  let hourLabels = '<div class="heatmap-row heatmap-hours"><span class="heatmap-day"></span>';
  for (let h = 0; h < 24; h++) hourLabels += `<span class="heatmap-hour">${h % 6 === 0 ? h : ''}</span>`;
  hourLabels += '</div>';

  return `
    <div class="analytics-section">
      <h3>Activity Heatmap</h3>
      <div class="heatmap">${cells}${hourLabels}</div>
    </div>`;
}

// ── Tool Usage ──────────────────────────────────────────────────────────

function renderToolUsage(data) {
  if (!data.byTool) return '';
  const tools = Object.entries(data.byTool).sort(([,a],[,b]) => b.count - a.count);
  if (!tools.length) return '';
  const maxCount = tools[0][1].count;

  return `
    <div class="analytics-section">
      <h3>Tool Usage</h3>
      <div class="tool-usage-list">
        ${tools.map(([name, v]) => {
          const short = shortToolName(name);
          const pct = (v.count / maxCount * 100).toFixed(0);
          const icon = { Bash:'$', Read:'R', Write:'W', Edit:'E', Glob:'*', Grep:'/', Agent:'A', Skill:'S', WebFetch:'F', WebSearch:'Q' }[name] || short[0] || '?';
          return `
            <div class="tool-usage-row">
              <span class="tool-usage-icon">${icon}</span>
              <span class="tool-usage-name" title="${escapeHtml(name)}">${escapeHtml(short)}</span>
              <div class="tool-usage-bar"><div class="tool-usage-fill" style="width:${pct}%"></div></div>
              <span class="tool-usage-count">${v.count.toLocaleString()}</span>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

// ── Model Distribution ──────────────────────────────────────────────────

function renderModelDist(data) {
  const models = Object.entries(data.byModel).sort(([,a],[,b]) => b.cost - a.cost);
  if (!models.length) return '';
  const total = models.reduce((s, [,v]) => s + v.cost, 0) || 1;

  // Pie-like segments (horizontal stacked bar)
  const colors = ['var(--accent)', 'var(--green)', 'var(--yellow)', 'var(--pink)', 'var(--mauve)'];
  let segments = '', legendItems = '';
  models.forEach(([model, v], i) => {
    const pct = (v.cost / total * 100);
    const color = colors[i % colors.length];
    const shortName = model.replace('claude-', '').replace(/-\d+$/, '');
    segments += `<div class="dist-segment" style="width:${pct}%;background:${color}" title="${shortName}: ${formatCost(v.cost)} (${pct.toFixed(1)}%)"></div>`;
    legendItems += `<div class="dist-legend-item"><span class="legend-dot" style="background:${color}"></span><span>${escapeHtml(shortName)}</span><span class="dist-legend-val">${formatCost(v.cost)}</span></div>`;
  });

  return `
    <div class="analytics-section">
      <h3>Models</h3>
      <div class="dist-bar">${segments}</div>
      <div class="dist-legend">${legendItems}</div>
    </div>`;
}

// ── Top Sessions by Cost ────────────────────────────────────────────────

function renderTopSessions(data) {
  if (!data.topSessions?.length) return '';
  return `
    <div class="analytics-section">
      <h3>Top Sessions by Cost</h3>
      <div class="top-sessions">
        ${data.topSessions.map((s, i) => `
          <div class="top-session-row">
            <span class="top-session-rank">${i + 1}</span>
            <span class="top-session-name">${escapeHtml(s.name)}</span>
            <span class="top-session-cost">${formatCost(s.cost)}</span>
          </div>
        `).join('')}
      </div>
    </div>`;
}

// ── Feature 14: Project Dashboard ──────────────────────────────────────

function renderProjectDashboard(data, projectId) {
  if (!state.settings.enableProjectDashboard || !projectId) return '';
  const toolEntries = Object.entries(data.byTool || {}).sort((a, b) => b[1].count - a[1].count).slice(0, 8);
  const maxToolCount = toolEntries[0]?.[1].count || 1;

  // Daily cost trend (last 30 entries)
  const days = Object.entries(data.byDay || {}).sort((a, b) => a[0].localeCompare(b[0])).slice(-30);
  const maxDayCost = Math.max(...days.map(d => d[1].cost), 0.01);

  return `
    <div class="analytics-section">
      <h3>Project Dashboard</h3>
      <div class="project-dash-grid">
        <div class="dash-card">
          <h4>Most Used Tools</h4>
          <div class="dash-tool-list">
            ${toolEntries.map(([name, d]) => `
              <div class="dash-tool-row">
                <span class="dash-tool-name" title="${escapeHtml(name)}">${escapeHtml(shortToolName(name))}</span>
                <div class="dash-tool-bar"><div style="width:${Math.round(d.count / maxToolCount * 100)}%"></div></div>
                <span class="dash-tool-count">${d.count}</span>
              </div>`).join('')}
          </div>
        </div>
        <div class="dash-card">
          <h4>Daily Cost Trend</h4>
          <div class="dash-cost-chart">
            ${days.map(([day, d]) => `<div class="dash-cost-bar" title="${day}: ${formatCost(d.cost)}" style="height:${Math.max(2, Math.round(d.cost / maxDayCost * 60))}px"></div>`).join('')}
          </div>
        </div>
      </div>
    </div>`;
}
