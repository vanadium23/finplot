// FP-004: экран раскрытия — рисует В ТОМ ЖЕ SVG линии факта скрытых лет
// и «Других» (заглушка помечена явно — и подписью у линии, и легендой),
// легенду из трёх подписей и блок результатов. Шкалы берёт из
// makeScales — единственного источника геометрии графика и рисования.
import { makeScales, MARGIN } from './chart.js';
import { score } from './score.js';

const NS = 'http://www.w3.org/2000/svg';
const LEGEND_SWATCH = 24; // длина цветной черточки в легенде
const LEGEND_GAP = 8; // зазор между черточкой и подписью
const LEGEND_ROW = 18; // шаг строк легенды
const LEGEND_INSET = 8; // отступ легенды от угла плота
const CAPTION_DY = -10; // подпись «Других» над последней точкой линии
const MISS_DECIMALS = 1; // «X.X $ млрд» — один знак среднего промаха
const BILLIONS = 1e9; // промах показывается в единицах метрики ($ млрд)

const LEGEND_ITEMS = [
  { lineClass: 'player', label: 'Ты' },
  { lineClass: 'fact', label: 'Факт' },
  { lineClass: 'others', label: 'Другие (заглушка)' },
];

function el(name, attrs = {}, text) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

function polylineOf(cls, points) {
  return el('polyline', {
    class: cls,
    points: points.map((p) => `${p.x},${p.y}`).join(' '),
  });
}

// Линия игрока обязательна на экране раскрытия и должна совпадать с тем,
// что ушло в score: если слой draw по какой-то причине пуст, рисуем её
// заново из guess — тех же значений, что получили очки.
function ensurePlayerLine(svg, round, guess) {
  const layer = svg.querySelector('#player-layer');
  if (!layer || layer.querySelector('polyline.player')) return;
  const { x, y } = makeScales(round);
  const hidden = round.points.slice(round.cutoffIndex);
  const points = hidden.map((p, i) => ({ x: x(p.year), y: y(guess[i]) }));
  layer.append(polylineOf('player', points));
}

export function renderReveal(container, round, guess, others) {
  const { x, y, yMin, yMax } = makeScales(round);
  const svg = container.querySelector('svg');
  const hidden = round.points.slice(round.cutoffIndex);

  const factPoints = hidden.map((p) => ({ x: x(p.year), y: y(p.value) }));
  const otherPoints = hidden.map((p, i) => ({ x: x(p.year), y: y(others[i]) }));
  svg.append(polylineOf('fact', factPoints), polylineOf('others', otherPoints));

  // Подпись «Других» — у последней точки третьей линии, в зоне прогноза.
  const last = otherPoints.at(-1);
  svg.append(
    el(
      'text',
      { class: 'line-caption', 'text-anchor': 'end', x: last.x, y: last.y + CAPTION_DY },
      'Другие (заглушка)',
    ),
  );

  // Легенда из трёх подписей — левый верх плота, рядом с зоной линий.
  const legend = el('g', { id: 'reveal-legend' });
  const legendX = MARGIN.left + LEGEND_INSET;
  LEGEND_ITEMS.forEach((item, i) => {
    const rowY = MARGIN.top + LEGEND_INSET + i * LEGEND_ROW;
    legend.append(
      el('line', {
        class: `legend-swatch ${item.lineClass}`,
        x1: legendX,
        y1: rowY,
        x2: legendX + LEGEND_SWATCH,
        y2: rowY,
      }),
    );
    legend.append(
      el('text', { class: 'legend-label', x: legendX + LEGEND_SWATCH + LEGEND_GAP, y: rowY + 4 }, item.label),
    );
  });
  svg.append(legend);

  ensurePlayerLine(svg, round, guess);

  const { points, avgMiss } = score(guess, hidden.map((p) => p.value), yMin, yMax);
  const result = document.createElement('div');
  result.id = 'result';
  // Входы score публикуются для степа «согласованность рендера с ядром».
  result.dataset.guess = guess.join(',');
  result.dataset.actual = hidden.map((p) => p.value).join(',');
  result.dataset.yMin = String(yMin);
  result.dataset.yMax = String(yMax);
  const scoreLine = document.createElement('p');
  scoreLine.id = 'score-value';
  scoreLine.textContent = `Очки: ${points}`;
  const missLine = document.createElement('p');
  missLine.id = 'avg-miss';
  missLine.textContent = `Средний промах: ${(avgMiss / BILLIONS).toFixed(MISS_DECIMALS)} $ млрд`;
  result.append(scoreLine, missLine);
  container.append(result);

  return { svg, result };
}
