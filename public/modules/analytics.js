import { state, api, formatNum, formatCost, escapeHtml, shortenPath } from './state.js';

export async function showAnalytics(projectId) {
  const container = document.getElementById('messages');
  container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">Loading analytics...</div>';

  try {
    const url = projectId ? `/api/analytics?project=${encodeURIComponent(projectId)}` : '/api/analytics';
    const data = await api(url);
    container.innerHTML = renderDashboard(data, projectId);
  } catch (err) {
    container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red)">Failed to load analytics: ${escapeHtml(err.message)}</div>`;
  }
}

function renderDashboard(data, projectId) {
  const title = projectId ? shortenPath(state.projects.find(p => p.id === projectId)?.projectPath || projectId) : 'All Projects';

  // Summary cards
  const cards = `
    <div class="analytics-cards">
      <div class="acard"><div class="acard-value">${formatCost(data.totalCost)}</div><div class="acard-label">Total Cost</div></div>
      <div class="acard"><div class="acard-value">${formatNum(data.totalInput)}</div><div class="acard-label">Input Tokens</div></div>
      <div class="acard"><div class="acard-value">${formatNum(data.totalOutput)}</div><div class="acard-label">Output Tokens</div></div>
      <div class="acard"><div class="acard-value">${data.totalMsgs.toLocaleString()}</div><div class="acard-label">Messages</div></div>
      <div class="acard"><div class="acard-value">${data.sessionCount}</div><div class="acard-label">Sessions</div></div>
    </div>`;

  // Cost by day bar chart
  const days = Object.entries(data.byDay).sort(([a], [b]) => a.localeCompare(b)).slice(-30); // last 30 days
  const maxCost = Math.max(...days.map(([, v]) => v.cost), 0.01);
  const costChart = days.length ? `
    <div class="analytics-section">
      <h3>Daily Cost (last 30 days)</h3>
      <div class="bar-chart">
        ${days.map(([day, v]) => {
          const pct = (v.cost / maxCost * 100).toFixed(1);
          const label = day.slice(5); // MM-DD
          return `<div class="bar-col" title="${day}: ${formatCost(v.cost)} (${v.msgs} msgs)"><div class="bar" style="height:${pct}%"></div><div class="bar-label">${label}</div></div>`;
        }).join('')}
      </div>
    </div>` : '';

  // Token usage by day
  const maxTok = Math.max(...days.map(([, v]) => v.input + v.output), 1);
  const tokenChart = days.length ? `
    <div class="analytics-section">
      <h3>Daily Token Usage</h3>
      <div class="bar-chart">
        ${days.map(([day, v]) => {
          const inPct = (v.input / maxTok * 100).toFixed(1);
          const outPct = (v.output / maxTok * 100).toFixed(1);
          const label = day.slice(5);
          return `<div class="bar-col" title="${day}: ${formatNum(v.input)} in / ${formatNum(v.output)} out"><div class="bar-stack"><div class="bar bar-input" style="height:${inPct}%"></div><div class="bar bar-output" style="height:${outPct}%"></div></div><div class="bar-label">${label}</div></div>`;
        }).join('')}
      </div>
      <div class="chart-legend"><span class="legend-item"><span class="legend-dot" style="background:var(--accent)"></span>Input</span><span class="legend-item"><span class="legend-dot" style="background:var(--green)"></span>Output</span></div>
    </div>` : '';

  // Model distribution
  const models = Object.entries(data.byModel).sort(([,a],[,b]) => b.cost - a.cost);
  const totalModelCost = models.reduce((s, [,v]) => s + v.cost, 0) || 1;
  const modelSection = models.length ? `
    <div class="analytics-section">
      <h3>Model Distribution</h3>
      <div class="model-bars">
        ${models.map(([model, v]) => {
          const pct = (v.cost / totalModelCost * 100).toFixed(1);
          const shortName = model.replace('claude-', '').replace(/-\d+$/, '');
          return `<div class="model-bar-row"><span class="model-name">${escapeHtml(shortName)}</span><div class="model-bar-track"><div class="model-bar-fill" style="width:${pct}%"></div></div><span class="model-stats">${formatCost(v.cost)} (${pct}%)</span></div>`;
        }).join('')}
      </div>
    </div>` : '';

  return `
    <div class="analytics-dashboard">
      <div class="analytics-header">
        <h2>Analytics: ${escapeHtml(title)}</h2>
        <select id="analytics-scope" class="modal-select" style="width:auto">
          <option value="">All Projects</option>
          ${state.projects.map(p => `<option value="${p.id}" ${p.id === projectId ? 'selected' : ''}>${escapeHtml(shortenPath(p.projectPath))}</option>`).join('')}
        </select>
      </div>
      ${cards}${costChart}${tokenChart}${modelSection}
    </div>`;
}
