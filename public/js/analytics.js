/* =========================================================
   ANALYTICS PAGE (Chart.js, data from /api/analytics/summary)
   ========================================================= */
let pieChart, trendLineChart, topCategoriesChart, balanceLineChart;

const CHART_FONT = { family: 'Inter', size: 12 };

async function populateAnalyticsMonthFilter() {
  const sel = document.getElementById('analyticsMonthFilter');
  const months = await getTransactionMonths();
  const prevValue = sel.value;
  sel.innerHTML = '<option value="all">All time</option>' + months.map((m) => {
    const label = new Date(m + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    return `<option value="${m}">${label}</option>`;
  }).join('');
  sel.value = months.includes(prevValue) ? prevValue : 'all';
}

async function renderAnalytics() {
  const selectedMonth = document.getElementById('analyticsMonthFilter').value;
  const monthFilter = selectedMonth && selectedMonth !== 'all' ? selectedMonth : null;
  document.getElementById('analyticsMonthNote').hidden = !monthFilter;

  const summary = await getAnalyticsSummary(6, monthFilter);
  const { totals, byCategory, topCategories, trend, balanceTrend } = summary;

  document.getElementById('analyticsSummaryRow').innerHTML = `
    <div class="summary-card" style="--card-accent:var(--income)">
      <div class="summary-label">Total income</div>
      <div class="summary-figure income">${formatMoney(totals.income)}</div>
    </div>
    <div class="summary-card" style="--card-accent:var(--outcome)">
      <div class="summary-label">Total outcome</div>
      <div class="summary-figure outcome">${formatMoney(totals.outcome)}</div>
    </div>
    <div class="summary-card" style="--card-accent:var(--gold)">
      <div class="summary-label">Net balance</div>
      <div class="summary-figure">${formatMoney(totals.balance)}</div>
    </div>
  `;

  // --- Pie: outcome by category ---
  const pieEmpty = document.getElementById('pieEmpty');
  const pieCanvas = document.getElementById('chartCategoryPie');
  if (pieChart) pieChart.destroy();
  if (!byCategory.length) {
    pieEmpty.hidden = false;
    pieCanvas.style.display = 'none';
  } else {
    pieEmpty.hidden = true;
    pieCanvas.style.display = 'block';
    pieChart = new Chart(pieCanvas, {
      type: 'pie',
      data: {
        labels: byCategory.map((c) => c.name),
        datasets: [{ data: byCategory.map((c) => c.total), backgroundColor: byCategory.map((c) => c.color), borderColor: '#FFFFFF', borderWidth: 2 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: CHART_FONT, padding: 14 } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatMoney(ctx.raw)}` } },
        },
      },
    });
  }

  // --- Double line: income vs outcome trend ---
  const monthLabels = trend.map((t) => new Date(t.month + '-01').toLocaleDateString(undefined, { month: 'short' }));
  if (trendLineChart) trendLineChart.destroy();
  trendLineChart = new Chart(document.getElementById('chartIncomeOutcomeLine'), {
    type: 'line',
    data: {
      labels: monthLabels,
      datasets: [
        {
          label: 'Income', data: trend.map((t) => t.income), borderColor: '#3E7D53', backgroundColor: '#3E7D53',
          tension: 0.3, pointRadius: 4, pointBackgroundColor: '#3E7D53', fill: false,
        },
        {
          label: 'Outcome', data: trend.map((t) => t.outcome), borderColor: '#B0462B', backgroundColor: '#B0462B',
          tension: 0.3, pointRadius: 4, pointBackgroundColor: '#B0462B', fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: CHART_FONT } } },
      scales: {
        x: { grid: { display: false }, ticks: { font: CHART_FONT } },
        y: { grid: { color: '#DCE3D6' }, ticks: { font: CHART_FONT, callback: (v) => formatMoney(v) } },
      },
    },
  });

  // --- Top spending categories (horizontal bar) ---
  const topCatEmpty = document.getElementById('topCatEmpty');
  const topCatCanvas = document.getElementById('chartTopCategoriesBar');
  if (topCategoriesChart) topCategoriesChart.destroy();
  if (!topCategories.length) {
    topCatEmpty.hidden = false;
    topCatCanvas.style.display = 'none';
  } else {
    topCatEmpty.hidden = true;
    topCatCanvas.style.display = 'block';
    topCategoriesChart = new Chart(topCatCanvas, {
      type: 'bar',
      data: {
        labels: topCategories.map((c) => c.name),
        datasets: [{ data: topCategories.map((c) => c.total), backgroundColor: topCategories.map((c) => c.color), borderRadius: 4, maxBarThickness: 22 }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => formatMoney(ctx.raw) } } },
        scales: {
          x: { grid: { color: '#DCE3D6' }, ticks: { font: CHART_FONT, callback: (v) => formatMoney(v) } },
          y: { grid: { display: false }, ticks: { font: CHART_FONT } },
        },
      },
    });
  }

  // --- Balance trend (cumulative line) ---
  if (balanceLineChart) balanceLineChart.destroy();
  balanceLineChart = new Chart(document.getElementById('chartBalanceLine'), {
    type: 'line',
    data: {
      labels: monthLabels,
      datasets: [{
        label: 'Balance',
        data: balanceTrend.map((b) => b.balance),
        borderColor: '#B98B2E',
        backgroundColor: 'rgba(185,139,46,0.12)',
        fill: true,
        tension: 0.3,
        pointBackgroundColor: '#B98B2E',
        pointRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: CHART_FONT } },
        y: { grid: { color: '#DCE3D6' }, ticks: { font: CHART_FONT, callback: (v) => formatMoney(v) } },
      },
    },
  });
}

async function init() {
  const user = await requireAuthOrRedirect();
  if (!user) return;
  document.getElementById('analyticsMonthFilter').addEventListener('change', renderAnalytics);
  try {
    await populateAnalyticsMonthFilter();
    await renderAnalytics();
  } catch (err) {
    showToast(err.message || 'Failed to load analytics.');
  }
}

init();
