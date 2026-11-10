// FP-003: степы e2e-проекта — браузерные сценарии рисования.
// URL и селекторы живут только здесь; в фиче — язык предметной области.
// test берём из 'playwright-bdd' (как в logic_steps.js) и экспортируем.
import { expect } from '@playwright/test';
import { test, createBdd } from 'playwright-bdd';

const { Given, When, Then } = createBdd();

const BASE = 'http://localhost:8123';
const CHART = '#chart';
const FORECAST_FROM = 2019;
const FORECAST_TO = 2025;

// Состояние сценария: воркер гоняет сценарии последовательно, каждый
// Given переинициализирует state.page (touch-сценарий — своей страницей).
const state = {};

async function gotoRound(page, url) {
  state.page = page;
  await page.goto(`${BASE}/${url}`);
  // svg появляется синхронно с завершением boot (fetch → renderChart):
  // после видимости графика весь chart-DOM уже построен.
  await expect(page.locator(CHART)).toBeVisible();
}

async function yearTickX(page, year) {
  const box = await page.locator(`${CHART} line[data-year="${year}"]`).boundingBox();
  return box.x + box.width / 2;
}

async function plotY(page) {
  const box = await page.locator(`${CHART} rect.forecast`).boundingBox();
  return box.y + box.height / 2;
}

// Мышь: зажать → провести → отпустить; реальные pointer-события.
async function dragMouse(page, x0, x1, y) {
  await page.mouse.move(x0, y);
  await page.mouse.down();
  await page.mouse.move(x1, y, { steps: 12 });
  await page.mouse.up();
}

// Палец: CDP touch-серия — Chromium порождает из неё pointer-события
// с pointerType 'touch' (не мышиная эмуляция).
async function dragTouch(page, x0, x1, y) {
  const session = await page.context().newCDPSession(page);
  const at = (x) => [{ x: Math.round(x), y: Math.round(y) }];
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(x0) });
  for (const t of [0.25, 0.5, 0.75, 1]) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: at(x0 + (x1 - x0) * t),
    });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function dragAcross(page, yearFrom, yearTo, how) {
  const y = await plotY(page);
  const x0 = await yearTickX(page, yearFrom);
  const x1 = await yearTickX(page, yearTo);
  await how(page, x0, x1, y);
}

function drawnDot(page, year) {
  return page.locator(`${CHART} circle.drawn[data-year="${year}"]`);
}

// Десктопные сценарии: пиновый раунд seed 42.
Given('открыта страница {string}', async ({ page }, url) => {
  await gotoRound(page, url);
});

// Сценарий «Палец на телефоне»: touch и viewport задаются только
// на новом контексте, поэтому он открывает пиновый seed сам.
Given('открыт телефон 390×844 с touch', async ({ page }) => {
  const context = await page.context().browser().newContext({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  state.page = await context.newPage();
  await gotoRound(state.page, 'index.html?seed=42');
});

// Сценарий 1.
Then('заголовок называет «Meta Platforms» и метрику «выручка» в «$ млрд»', async ({}) => {
  const title = state.page.locator('#round-title');
  await expect(title).toContainText('Meta Platforms');
  const text = await title.textContent();
  expect(text).toContain('(META)');
  expect(text).toContain('выручка');
  expect(text).toContain('$ млрд');
});

Then('линия истории идёт с {int} по {int} год', async ({}, from, to) => {
  const page = state.page;
  const raw = await page.locator(`${CHART} polyline.history`).getAttribute('points');
  expect(raw.split(' ')).toHaveLength(to - from + 1);
  // Концы линии против тиков лет — в единой экранной геометрии
  // (getBoundingClientRect: boundingBox Playwright у SVG даёт ink-box).
  const [historyX, historyRight, tickFrom, tickTo] = await page.evaluate(
    ([first, last]) => {
      const rectX = (selector) => document.querySelector(selector).getBoundingClientRect().x;
      const history = document.querySelector('#chart polyline.history').getBoundingClientRect();
      return [history.x, history.x + history.width, rectX(`#chart line[data-year="${first}"]`), rectX(`#chart line[data-year="${last}"]`)];
    },
    [from, to],
  );
  expect(Math.abs(historyX - tickFrom)).toBeLessThanOrEqual(1);
  expect(Math.abs(historyRight - tickTo)).toBeLessThanOrEqual(1);
});

// Пин FP-003: верхняя метка оси Y = max ПОЛНОГО факта (правило FP-002:
// факт обязан влезать при reveal). Скрытая часть 2019–2025 доходит до
// 201.0 $ млрд → верхняя метка '201'; ось по показанной части дала бы 56.
// Метки оси Y — text без класса левее оси (годовые тики — .tick-label,
// подпись единиц — .axis-caption).
Then('ось Y размечена по полному факту', async ({}) => {
  const topLabel = await state.page.evaluate(() => {
    const axisX = document.querySelector('#chart line.axis').getBoundingClientRect().x;
    const labels = [...document.querySelectorAll('#chart text')]
      .filter((t) => !t.classList.contains('tick-label') && !t.classList.contains('axis-caption'))
      .filter((t) => t.getBoundingClientRect().right <= axisX)
      .sort((a, b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y);
    return labels[0] ? labels[0].textContent : null;
  });
  expect(topLabel).toBe('201');
});

Then('срез отмечен пунктиром после {int} года', async ({}, afterYear) => {
  const page = state.page;
  const cutoff = page.locator(`${CHART} line.cutoff`);
  await expect(cutoff).toHaveCount(1);
  const box = await cutoff.boundingBox();
  const cx = box.x + box.width / 2;
  expect(cx).toBeGreaterThan(await yearTickX(page, afterYear));
  expect(cx).toBeLessThan(await yearTickX(page, afterYear + 1));
  expect(await cutoff.getAttribute('stroke-dasharray')).not.toBeNull();
});

Then('зона прогноза {int}–{int} затемнена', async ({}, from, to) => {
  const page = state.page;
  const zone = page.locator(`${CHART} rect.forecast`);
  await expect(zone).toHaveCount(1);
  const box = await zone.boundingBox();
  expect(box.x).toBeGreaterThan(await yearTickX(page, from - 1));
  expect(box.x).toBeLessThan(await yearTickX(page, from));
  expect(Math.abs(box.x + box.width - (await yearTickX(page, to)))).toBeLessThanOrEqual(1);
  const opacity = Number(await zone.getAttribute('fill-opacity'));
  expect(opacity).toBeGreaterThan(0);
  expect(opacity).toBeLessThan(1);
});

Then('кнопка «Открыть факт» заблокирована', async ({}) => {
  await expect(state.page.locator('#reveal')).toBeDisabled();
});

Then('кнопка «Открыть факт» активна', async ({}) => {
  await expect(state.page.locator('#reveal')).toBeEnabled();
});

// Сценарий 2.
When('я провожу мышью по затемнённой зоне через все годы прогноза', async ({}) => {
  await dragAcross(state.page, FORECAST_FROM, FORECAST_TO, dragMouse);
});

Then('за курсором тянется линия игрока', async ({}) => {
  const line = state.page.locator(`${CHART} polyline.player`);
  await expect(line).toHaveCount(1);
  const points = await line.getAttribute('points');
  expect(points.split(' ').length).toBeGreaterThanOrEqual(2);
});

Then('годы {int}–{int} заполнены значениями', async ({}, from, to) => {
  for (let year = from; year <= to; year++) {
    const dot = drawnDot(state.page, year);
    await expect(dot).toHaveCount(1);
    const value = Number(await dot.getAttribute('data-value'));
    expect(Number.isFinite(value), `значение года ${year}`).toBe(true);
  }
});

// Сценарии 3 и 6: частичная дорисовка.
When('нарисовано {int} из {int} лет прогноза', async ({}, count, total) => {
  expect(total).toBe(FORECAST_TO - FORECAST_FROM + 1);
  await dragAcross(state.page, FORECAST_FROM, FORECAST_FROM + count - 1, dragMouse);
});

When('дорисовываю последний год', async ({}) => {
  await dragAcross(state.page, FORECAST_TO - 1, FORECAST_TO, dragMouse);
});

// Сценарий 4.
Given('фокус на графике', async ({}) => {
  await state.page.locator(CHART).focus();
});

When('игрок жмёт → и ↓', async ({}) => {
  await state.page.locator(CHART).press('ArrowRight');
  await state.page.locator(CHART).press('ArrowDown');
});

Then('выбранный год получает значение', async ({}) => {
  const page = state.page;
  const selected = Number(await page.locator(CHART).getAttribute('data-selected-year'));
  await expect(drawnDot(page, selected)).toHaveCount(1);
});

Then('курсор года сдвинулся с {int} на {int}', async ({}, from, to) => {
  expect(Number(await state.page.locator(CHART).getAttribute('data-selected-year'))).toBe(to);
});

// Сценарий 5: доказательство, что рисовал именно палец.
When('провожу пальцем по зоне прогноза', async ({}) => {
  await dragAcross(state.page, FORECAST_FROM, FORECAST_TO, dragTouch);
  expect(await state.page.locator(CHART).getAttribute('data-last-pointer-type')).toBe('touch');
});

// Сценарий 6.
When('игрок жмёт «Стереть»', async ({}) => {
  await state.page.locator('#erase').click();
});

Then('линия игрока исчезает', async ({}) => {
  await expect(state.page.locator(`${CHART} polyline.player`)).toHaveCount(0);
});

Then('все годы прогноза пусты', async ({}) => {
  await expect(state.page.locator(`${CHART} circle.drawn`)).toHaveCount(0);
});

export { test };
