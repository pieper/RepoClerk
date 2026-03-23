/* dashboard.js — loads dashboard-data.json and renders charts + repo table */

(async function () {
  let data;
  try {
    const resp = await fetch('./dashboard-data.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    data = await resp.json();
  } catch (err) {
    document.querySelector('main').innerHTML =
      `<p style="color:red;padding:2rem">Failed to load dashboard data: ${err.message}</p>`;
    return;
  }

  // --- Summary bar ---
  document.getElementById('total-repos').textContent  = data.totalRepos;
  document.getElementById('total-issues').textContent = data.totalOpenIssues;
  document.getElementById('total-prs').textContent    = data.totalOpenPRs;
  document.getElementById('generated-at').textContent =
    new Date(data.generatedAt).toLocaleString();

  // --- Activity chart ---
  const activityChart = echarts.init(document.getElementById('activity-chart'));
  activityChart.setOption({
    title: { text: 'Repository Activity', left: 'center', textStyle: { fontSize: 13 } },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: ['Last Day', 'Last Week', 'Last Month', 'Last Year'],
    },
    yAxis: { type: 'value', name: 'Repos', minInterval: 1 },
    series: [{
      type: 'bar',
      data: [
        data.activity.last_day,
        data.activity.last_week,
        data.activity.last_month,
        data.activity.last_year,
      ],
      itemStyle: { color: '#1a3a52' },
    }],
    grid: { left: 50, right: 20, bottom: 40, top: 50 },
  });

  // --- Taxonomy pie chart ---
  const taxonomyChart = echarts.init(document.getElementById('taxonomy-chart'));
  const taxSelect = document.getElementById('tax-level');

  function updateTaxonomy() {
    const level = taxSelect.value;
    const counts = data.taxonomy[level] || {};
    const chartData = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    taxonomyChart.setOption({
      title: {
        text: `By ${level.charAt(0).toUpperCase() + level.slice(1)}`,
        left: 'center',
        textStyle: { fontSize: 13 },
      },
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)',
      },
      series: [{
        type: 'pie',
        radius: ['30%', '65%'],
        data: chartData,
        label: { fontSize: 11 },
      }],
    }, true);
  }

  taxSelect.addEventListener('change', updateTaxonomy);
  updateTaxonomy();

  // --- Repo table ---
  const tbody = document.getElementById('repo-tbody');

  data.repos.forEach(repo => {
    const pushedDate = repo.pushedAt
      ? new Date(repo.pushedAt).toLocaleDateString()
      : '—';

    // Main row
    const tr = document.createElement('tr');
    tr.className = 'repo-row';
    tr.innerHTML = `
      <td>
        <span class="expand-indicator">▶</span>
        <a href="https://github.com/${repo.nameWithOwner}" target="_blank"
           onclick="event.stopPropagation()">${repo.nameWithOwner}</a>
      </td>
      <td>${pushedDate}</td>
      <td>${repo.openIssues}</td>
      <td>${repo.openPRs}</td>
      <td>${repo.screenshotCount}</td>
    `;

    // Detail row (hidden by default)
    const detailTr = document.createElement('tr');
    detailTr.className = 'detail-row';
    detailTr.style.display = 'none';

    const detailTd = document.createElement('td');
    detailTd.colSpan = 5;
    detailTd.innerHTML = buildDetailHTML(repo);
    detailTr.appendChild(detailTd);

    // Toggle on row click
    const indicator = tr.querySelector('.expand-indicator');
    tr.addEventListener('click', () => {
      const open = detailTr.style.display !== 'none';
      detailTr.style.display = open ? 'none' : 'table-row';
      indicator.textContent = open ? '▶' : '▼';
    });

    tbody.appendChild(tr);
    tbody.appendChild(detailTr);
  });

  window.addEventListener('resize', () => {
    activityChart.resize();
    taxonomyChart.resize();
  });


  // --- Helpers ---

  function buildDetailHTML(repo) {
    const acc = repo.accession || {};
    const accKeys = Object.keys(acc).filter(k => acc[k] !== null && acc[k] !== undefined);

    const accHTML = accKeys.length
      ? '<dl class="accession">' +
        accKeys.map(k => {
          const v = typeof acc[k] === 'object' ? JSON.stringify(acc[k]) : acc[k];
          return `<dt>${k}</dt><dd>${escapeHTML(String(v))}</dd>`;
        }).join('') +
        '</dl>'
      : '<p style="color:#586069;font-size:0.85rem">No accession data.</p>';

    const captions = repo.screenshotCaptions || [];
    const screenshotsHTML = captions.length
      ? '<div class="screenshots">' +
        captions.map(item => {
          // Support {filename, caption} objects or {filename: caption} objects
          const filename = item.filename
            || Object.keys(item).find(k => k !== 'caption' && k !== 'description')
            || '';
          if (!filename) return '';
          const caption = item.caption || item.description || item[filename] || '';
          const url = `https://raw.githubusercontent.com/${repo.nameWithOwner}/main/screenshots/${encodeURIComponent(filename)}`;
          return `<figure>
            <a href="${url}" target="_blank">
              <img src="${url}" alt="${escapeHTML(String(caption))}" loading="lazy">
            </a>
            ${caption ? `<figcaption>${escapeHTML(String(caption))}</figcaption>` : ''}
          </figure>`;
        }).join('') +
        '</div>'
      : '';

    return accHTML + screenshotsHTML;
  }

  function escapeHTML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
