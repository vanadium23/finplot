// FP-003: сборка страницы раунда. seed — из ?seed=, иначе crypto-случай;
// rng один mulberry32 на раунд (композиция из пина FP-002: pickRound
// потребляет первые два числа потока).
import { loadDataset } from './data.js';
import { pickRound } from './round.js';
import { mulberry32 } from './rng.js';
import { renderChart } from './chart.js';
import { enableDraw } from './draw.js';

const DATASET_URL = 'public/data/companies.json';
const METRIC_LABELS = {
  revenue: 'выручка',
  net_income: 'чистая прибыль',
};

function seedFromLocation() {
  const parsed = Number.parseInt(new URLSearchParams(location.search).get('seed'), 10);
  return Number.isInteger(parsed) ? parsed : crypto.getRandomValues(new Uint32Array(1))[0];
}

function roundTitle(round, company) {
  return `${company.name} (${round.ticker}) · ${METRIC_LABELS[round.metric]} FY, $ млрд`;
}

// refresh читает draw через замыкание; enableDraw вызывает onChange уже
// внутри конструктора — до присваивания draw, поэтому guard обязателен.
let draw = null;
let forecastYears = [];

function refresh() {
  if (!draw) return;
  const filled = forecastYears.filter((year) => draw.values().has(year)).length;
  document.getElementById('reveal').disabled = filled < forecastYears.length;
  document.getElementById('erase').disabled = filled === 0;
}

async function boot() {
  const response = await fetch(DATASET_URL);
  const dataset = loadDataset(await response.text());
  const round = pickRound(dataset.companies, mulberry32(seedFromLocation()));
  const company = dataset.companies.find((c) => c.ticker === round.ticker);
  document.getElementById('round-title').textContent = roundTitle(round, company);

  forecastYears = round.points.slice(round.cutoffIndex).map((p) => p.year);
  renderChart(document.getElementById('chart-holder'), round);
  draw = enableDraw(document.getElementById('chart'), round, { onChange: refresh });

  document.getElementById('erase').addEventListener('click', () => draw.clear());
  // «Открыть факт» — заглушка: экран reveal приходит в FP-004.
  document.getElementById('reveal').addEventListener('click', () => {});
  refresh();
}

boot();
