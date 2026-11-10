// FP-003: рукописный SVG-график раунда. Ось Y = min/max ПОЛНОГО факта
// (правило FP-002: факт обязан влезать при будущем reveal). Все шкалы
// и обратные к ним живут в makeScales — её же берёт enableDraw,
// единственный источник геометрии для графика и рисования.
const NS = 'http://www.w3.org/2000/svg';
export const VIEW_W = 960;
export const VIEW_H = 480;
export const MARGIN = { top: 28, right: 16, bottom: 32, left: 48 };
const Y_SEGMENTS = 4; // интервалов разметки оси Y
const TICK_LEN = 6;
const TICK_LABEL_GAP = 20;

function el(name, attrs = {}, text) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

// Единицы метрики: value/1e9, 0–1 знак после запятой.
export function formatBillions(value) {
  const billions = value / 1e9;
  const rounded =
    Math.abs(billions) >= 10 ? Math.round(billions) : Math.round(billions * 10) / 10;
  return String(rounded);
}

export function makeScales(round) {
  const years = round.points.map((p) => p.year);
  const values = round.points.map((p) => p.value);
  const yMin = Math.min(...values);
  const yMax = Math.max(...values);
  const plotW = VIEW_W - MARGIN.left - MARGIN.right;
  const plotH = VIEW_H - MARGIN.top - MARGIN.bottom;
  const x = (year) =>
    MARGIN.left + ((year - years[0]) / (years.at(-1) - years[0])) * plotW;
  const y = (value) =>
    MARGIN.top + (1 - (value - yMin) / (yMax - yMin || 1)) * plotH;
  return {
    x,
    y,
    yMin,
    yMax,
    yearAt: (px) =>
      years[0] + ((px - MARGIN.left) / plotW) * (years.at(-1) - years[0]),
    valueAt: (py) =>
      yMin + ((plotH + MARGIN.top - py) / plotH) * (yMax - yMin || 1),
  };
}

export function renderChart(container, round) {
  const { x, y, yMin, yMax } = makeScales(round);
  const shown = round.points.slice(0, round.cutoffIndex);
  const forecast = round.points.slice(round.cutoffIndex);
  const plotBottom = VIEW_H - MARGIN.bottom;
  const cutX = (x(shown.at(-1).year) + x(forecast[0].year)) / 2;
  const zoneEnd = x(forecast.at(-1).year);

  const svg = el('svg', {
    id: 'chart',
    viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
    tabindex: 0,
    role: 'img',
    'aria-label': 'График раунда: линия истории и зона прогноза',
  });
  svg.dataset.shownFrom = shown[0].year;
  svg.dataset.shownTo = shown.at(-1).year;
  svg.dataset.forecastFrom = forecast[0].year;
  svg.dataset.forecastTo = forecast.at(-1).year;

  // Затемнённая зона прогноза — от пунктира среза до последнего года.
  svg.append(
    el(
      'rect',
      {
        class: 'forecast',
        x: cutX,
        y: MARGIN.top,
        width: zoneEnd - cutX,
        height: plotBottom - MARGIN.top,
        'fill-opacity': 0.06,
      },
    ),
  );

  svg.append(el('line', { class: 'axis', x1: MARGIN.left, y1: MARGIN.top, x2: MARGIN.left, y2: plotBottom }));
  svg.append(el('line', { class: 'axis', x1: MARGIN.left, y1: plotBottom, x2: zoneEnd, y2: plotBottom }));

  for (const point of round.points) {
    const tickX = x(point.year);
    svg.append(el('line', { class: 'tick', 'data-year': point.year, x1: tickX, y1: plotBottom, x2: tickX, y2: plotBottom + TICK_LEN }));
    svg.append(el('text', { class: 'tick-label', x: tickX, y: plotBottom + TICK_LABEL_GAP, 'text-anchor': 'middle' }, String(point.year)));
  }

  for (let i = 0; i <= Y_SEGMENTS; i++) {
    const value = yMin + ((yMax - yMin) * i) / Y_SEGMENTS;
    const tickY = y(value);
    svg.append(el('line', { class: 'tick', x1: MARGIN.left - TICK_LEN, y1: tickY, x2: MARGIN.left, y2: tickY }));
    svg.append(el('text', { x: MARGIN.left - 9, y: tickY + 3, 'text-anchor': 'end' }, formatBillions(value)));
  }

  svg.append(el('text', { class: 'axis-caption', x: MARGIN.left, y: MARGIN.top - 8 }, '$ млрд'));

  // Пунктир среза — ровно между последним показанным и первым скрытым годом.
  svg.append(el('line', {
    class: 'cutoff',
    x1: cutX,
    y1: MARGIN.top,
    x2: cutX,
    y2: plotBottom,
    'stroke-dasharray': '5 4',
  }));

  svg.append(el('polyline', {
    class: 'history',
    points: shown.map((p) => `${x(p.year)},${y(p.value)}`).join(' '),
  }));

  // Слой игрока: заполняет enableDraw.
  svg.append(el('g', { id: 'player-layer' }));

  container.replaceChildren(svg);
  return { svg, x, y };
}
