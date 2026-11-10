// FP-003/FP-004: сборка страницы раунда, экран раскрытия и лента
// «Следующий график». seed — из ?seed=, иначе crypto-случай.
// Композиция rng (пин, живой прогон tools-проб): раунды производит
// ОДИН поток roundRng — pickRound берёт ровно 2 числа за раунд, и цепь
// раундов при seed 42 даёт пины META → PG → PSX. Поток othersRng (тот же
// seed, создаётся один раз на сессию) питает pseudoOthers: по
// len(hidden)−1 чисел за раскрытие, последовательно. На раунд новый rng
// не создаётся.
import { loadDataset } from './data.js';
import { pickRound } from './round.js';
import { mulberry32 } from './rng.js';
import { pseudoOthers } from './others.js';
import { renderChart } from './chart.js';
import { enableDraw } from './draw.js';
import { renderReveal } from './reveal.js';

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
let companies = null;
let roundRng = null;
let othersRng = null;
let roundNumber = 0;
let currentRound = null;

function refresh() {
  if (!draw) return;
  const filled = forecastYears.filter((year) => draw.values().has(year)).length;
  document.getElementById('reveal').disabled = filled < forecastYears.length;
  document.getElementById('erase').disabled = filled === 0;
}

// Полный ре-рендер раунда: заголовок, счётчик, новый график и рисование.
function mountRound(round) {
  currentRound = round;
  roundNumber += 1;
  const company = companies.find((c) => c.ticker === round.ticker);
  document.getElementById('round-title').textContent = roundTitle(round, company);
  document.getElementById('round-counter').textContent = `Раунд ${roundNumber}`;
  forecastYears = round.points.slice(round.cutoffIndex).map((p) => p.year);
  const { svg } = renderChart(document.getElementById('chart-holder'), round);
  draw = enableDraw(svg, round, { onChange: refresh });
  document.getElementById('next').hidden = true;
  refresh();
}

// Рисование после раскрытия отключено: pointer-events срезает мышь и
// палец, снятие tabindex с blur — клавиатуру; «Стереть» недоступна.
function closeDrawing() {
  const svg = document.getElementById('chart');
  svg.classList.add('revealed');
  svg.removeAttribute('tabindex');
  svg.blur();
  document.getElementById('erase').disabled = true;
  document.getElementById('reveal').disabled = true;
  document.getElementById('next').hidden = false;
}

function openFact() {
  const guess = forecastYears.map((year) => draw.values().get(year));
  const hiddenValues = currentRound.points
    .slice(currentRound.cutoffIndex)
    .map((p) => p.value);
  const others = pseudoOthers(hiddenValues, othersRng);
  renderReveal(document.getElementById('chart-holder'), currentRound, guess, others);
  closeDrawing();
}

async function boot() {
  const response = await fetch(DATASET_URL);
  companies = loadDataset(await response.text()).companies;
  const seed = seedFromLocation();
  roundRng = mulberry32(seed);
  othersRng = mulberry32(seed);
  mountRound(pickRound(companies, roundRng));
}

document.getElementById('erase').addEventListener('click', () => draw.clear());
document.getElementById('reveal').addEventListener('click', openFact);
document.getElementById('next').addEventListener('click', () => {
  mountRound(pickRound(companies, roundRng));
});

boot();
