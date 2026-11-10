// FP-003: рисование прогноза поверх графика. Pointer Events — мышь и
// палец одной кодовой дорожкой; клавиатура: ←→ выбор года, ↑↓ значение
// (svg tabindex=0). Значение клампится в видимую ось; драг интерполирует
// пропущенные годы — каждый год зоны прогноза получает значение.
import {
  makeScales,
  formatBillions,
  VIEW_W,
  VIEW_H,
} from './chart.js';

const NS = 'http://www.w3.org/2000/svg';
const KEY_STEPS = 20; // нажатие ↑/↓ сдвигает на 1/20 оси
const DOT_R = 4;

function el(name, attrs = {}, text) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

export function enableDraw(svg, round, { onChange = () => {} } = {}) {
  const { x, y, yMin, yMax, yearAt, valueAt } = makeScales(round);
  const forecast = round.points.slice(round.cutoffIndex);
  const yearFrom = forecast[0].year;
  const yearTo = forecast.at(-1).year;
  const layer = svg.querySelector('#player-layer');
  const drawn = new Map();
  let selectedYear = yearFrom;
  let activePointer = null;
  let lastApplied = null;

  const clampYear = (year) => Math.min(yearTo, Math.max(yearFrom, year));
  const clampValue = (value) => Math.min(yMax, Math.max(yMin, value));

  function render() {
    layer.replaceChildren();
    const years = [...drawn.keys()].sort((a, b) => a - b);
    if (years.length > 0) {
      layer.append(el('polyline', {
        class: 'player',
        points: years.map((yr) => `${x(yr)},${y(drawn.get(yr))}`).join(' '),
      }));
      for (const yr of years) {
        const value = drawn.get(yr);
        const dot = el('circle', {
          class: 'drawn',
          'data-year': yr,
          'data-value': formatBillions(value),
          cx: x(yr),
          cy: y(value),
          r: DOT_R,
        });
        dot.append(el('title', {}, `${yr}: ${formatBillions(value)} $ млрд`));
        layer.append(dot);
      }
    }
    svg.dataset.selectedYear = String(selectedYear);
    onChange();
  }

  function toSvgPoint(event) {
    const box = svg.getBoundingClientRect();
    return {
      x: (event.clientX - box.left) * (VIEW_W / box.width),
      y: (event.clientY - box.top) * (VIEW_H / box.height),
    };
  }

  // Пропущенные при быстром драге годы интерполируются между двумя
  // срабатываниями — «каждый год обязан получить значение» выполняется.
  function applyPointer(event) {
    const p = toSvgPoint(event);
    const year = clampYear(Math.round(yearAt(p.x)));
    const value = clampValue(valueAt(p.y));
    if (lastApplied && lastApplied.year !== year) {
      const from = lastApplied.year < year ? lastApplied : { year, value };
      const to = from === lastApplied ? { year, value } : lastApplied;
      const span = to.year - from.year;
      for (let yr = from.year; yr <= to.year; yr++) {
        const t = (yr - from.year) / span;
        drawn.set(yr, clampValue(from.value + (to.value - from.value) * t));
      }
    } else {
      drawn.set(year, value);
    }
    lastApplied = { year, value };
    render();
  }

  function markPointer(event) {
    svg.dataset.lastPointerType = event.pointerType;
  }

  svg.addEventListener('pointerdown', (event) => {
    activePointer = event.pointerId;
    svg.setPointerCapture(event.pointerId);
    lastApplied = null;
    markPointer(event);
    event.preventDefault();
    applyPointer(event);
  });

  svg.addEventListener('pointermove', (event) => {
    if (activePointer !== event.pointerId) return;
    markPointer(event);
    applyPointer(event);
  });

  const release = (event) => {
    if (activePointer === event.pointerId) activePointer = null;
  };
  svg.addEventListener('pointerup', release);
  svg.addEventListener('pointercancel', release);

  function nudgeValue(direction) {
    const unit = (yMax - yMin) / KEY_STEPS;
    const base = drawn.has(selectedYear)
      ? drawn.get(selectedYear)
      : (yMin + yMax) / 2;
    drawn.set(selectedYear, clampValue(base + direction * unit));
    render();
  }

  svg.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') {
      selectedYear = clampYear(selectedYear + 1);
    } else if (event.key === 'ArrowLeft') {
      selectedYear = clampYear(selectedYear - 1);
    } else if (event.key === 'ArrowUp') {
      nudgeValue(1);
    } else if (event.key === 'ArrowDown') {
      nudgeValue(-1);
    } else {
      return;
    }
    event.preventDefault();
    render();
  });

  // Начальное состояние: выбранный год виден сразу после загрузки.
  render();

  return {
    clear() {
      drawn.clear();
      lastApplied = null;
      render();
    },
    values: () => drawn,
  };
}
