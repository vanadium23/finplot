// FP-004: степы e2e-проекта — экран раскрытия и лента «Следующий график».
// URL и селекторы живут только здесь; в фиче — язык предметной области.
// Приём драга — тот же, что в draw_steps.js: тики лет и зона прогноза
// через экранную геометрию, реальные pointer-события мыши.
// Шаги с круглыми скобками в тексте определены regexp'ом: cucumber-
// выражение трактует скобки как необязательную группу, а не литерал.
import { expect } from '@playwright/test';
import { test, createBdd } from 'playwright-bdd';
import { score } from '../../src/score.js';

const { Given, When, Then } = createBdd();

const BASE = 'http://localhost:8123';
const CHART = '#chart';
const PIN_URL = 'index.html?seed=42';
const BILLIONS = 1e9; // единицы метрики на экране — $ млрд

// Состояние сценария: воркер гоняет сценарии последовательно, каждый
// Given переинициализирует state.page.
const state = {};

async function gotoRound(page, url) {
  state.page = page;
  await page.goto(`${BASE}/${url}`);
  // svg появляется синхронно с завершением boot (fetch → renderChart).
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

// Годы зоны прогноза текущего раунда — из data-атрибутов svg, поэтому
// шаг рисования одинаково работает в любом раунде ленты.
async function forecastRange(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#chart');
    return { from: Number(svg.dataset.forecastFrom), to: Number(svg.dataset.forecastTo) };
  });
}

async function hiddenPointCount(page) {
  const { from, to } = await forecastRange(page);
  return to - from + 1;
}

async function drawAllForecastYears(page) {
  const { from, to } = await forecastRange(page);
  const y = await plotY(page);
  await dragMouse(page, await yearTickX(page, from), await yearTickX(page, to), y);
}

async function openRevealScreen(page) {
  await drawAllForecastYears(page);
  await page.locator('#reveal').click();
  await expect(page.locator('#result')).toBeVisible();
}

// Дано нарисованы все годы раунда (META, seed 42)
Given(/^нарисованы все годы раунда \(META, seed 42\)$/, async ({ page }) => {
  await gotoRound(page, PIN_URL);
  await drawAllForecastYears(page);
});

// Дано открыт экран раскрытия (META, seed 42)
Given(/^открыт экран раскрытия \(META, seed 42\)$/, async ({ page }) => {
  await gotoRound(page, PIN_URL);
  await openRevealScreen(page);
});

// Дано открыт раунд 2 (PG) после одного раскрытия (seed 42)
Given(/^открыт раунд 2 \(PG\) после одного раскрытия \(seed 42\)$/, async ({ page }) => {
  await gotoRound(page, PIN_URL);
  await openRevealScreen(page);
  await page.locator('#next').click();
  await expect(page.locator(CHART)).toBeVisible();
  await expect(page.locator('#round-title')).toContainText('(PG)');
});

When('жму «Открыть факт»', async ({}) => {
  await state.page.locator('#reveal').click();
  await expect(state.page.locator('#result')).toBeVisible();
});

When('жму «Следующий график»', async ({}) => {
  await state.page.locator('#next').click();
  await expect(state.page.locator(CHART)).toBeVisible();
});

When('нарисованы все годы раунда', async ({}) => {
  await drawAllForecastYears(state.page);
});

// Сценарий 1.
Then('появляется линия факта скрытых лет', async ({}) => {
  const fact = state.page.locator(`${CHART} polyline.fact`);
  await expect(fact).toHaveCount(1);
  const points = await fact.getAttribute('points');
  // FP-007: первая вершина факта — якорь (последняя точка истории),
  // поэтому вершин на одну больше скрытых лет.
  expect(points.split(' ')).toHaveLength((await hiddenPointCount(state.page)) + 1);
});

Then('моя линия остаётся на экране', async ({}) => {
  const page = state.page;
  await expect(page.locator(`${CHART} polyline.player`)).toHaveCount(1);
  await expect(page.locator(`${CHART} circle.drawn`)).toHaveCount(await hiddenPointCount(page));
});

Then(/^третья линия подписана «Другие \(заглушка\)»$/, async ({}) => {
  await expect(state.page.locator(`${CHART} polyline.others`)).toHaveCount(1);
  const labels = state.page.locator(`${CHART} .legend-label`);
  await expect(labels.filter({ hasText: 'Другие (заглушка)' })).toHaveCount(1);
});

Then('показаны очки от 0 до 100', async ({}) => {
  const text = await state.page.locator('#score-value').textContent();
  const match = text.match(/Очки: (\d+)/);
  expect(match, 'текст вида «Очки: N»').not.toBeNull();
  expect(Number(match[1])).toBeGreaterThanOrEqual(0);
  expect(Number(match[1])).toBeLessThanOrEqual(100);
});

Then('средний промах показан в «$ млрд» с 1 знаком', async ({}) => {
  // Единицы пиняем ядром: текст обязан равняться avgMiss от score(),
  // переведённому в $ млрд, с одним знаком.
  const inputs = await state.page.evaluate(() => {
    const result = document.querySelector('#result');
    return {
      guess: result.dataset.guess,
      actual: result.dataset.actual,
      yMin: result.dataset.yMin,
      yMax: result.dataset.yMax,
      text: document.querySelector('#avg-miss').textContent,
    };
  });
  const toNumbers = (csv) => csv.split(',').map(Number);
  const { avgMiss } = score(
    toNumbers(inputs.guess),
    toNumbers(inputs.actual),
    Number(inputs.yMin),
    Number(inputs.yMax),
  );
  expect(inputs.text).toBe(`Средний промах: ${(avgMiss / BILLIONS).toFixed(1)} $ млрд`);
});

Then('счёт раунда «Раунд 1» виден', async ({}) => {
  await expect(state.page.locator('#round-counter')).toHaveText('Раунд 1');
});

// Сценарий 2: согласованность рендера с ядром — степ импортирует
// src/score.js и считает score() ровно по тем входам (моя линия, факт,
// ось), которые рендер опубликовал в data-атрибутах блока результатов.
Then(/^число очков на экране равно значению score\(\) по тем же входам$/, async ({}) => {
  const inputs = await state.page.evaluate(() => {
    const result = document.querySelector('#result');
    return {
      guess: result.dataset.guess,
      actual: result.dataset.actual,
      yMin: result.dataset.yMin,
      yMax: result.dataset.yMax,
    };
  });
  const toNumbers = (csv) => csv.split(',').map(Number);
  const { points } = score(
    toNumbers(inputs.guess),
    toNumbers(inputs.actual),
    Number(inputs.yMin),
    Number(inputs.yMax),
  );
  await expect(state.page.locator('#score-value')).toContainText(`Очки: ${points}`);
});

// Сценарий 3.
Then(/^заголовок «Procter & Gamble \(PG\) · выручка FY, \$ млрд»$/, async ({}) => {
  await expect(state.page.locator('#round-title'))
    .toHaveText('Procter & Gamble (PG) · выручка FY, $ млрд');
});

Then('история снова идёт до среза', async ({}) => {
  const page = state.page;
  const points = await page.locator(`${CHART} polyline.history`).getAttribute('points');
  const shown = await page.evaluate(() => {
    const svg = document.querySelector('#chart');
    return { from: Number(svg.dataset.shownFrom), to: Number(svg.dataset.shownTo) };
  });
  expect(points.split(' ')).toHaveLength(shown.to - shown.from + 1);
});

Then('зона прогноза снова пуста', async ({}) => {
  await expect(state.page.locator(`${CHART} circle.drawn`)).toHaveCount(0);
});

Then('кнопка «Открыть факт» снова заблокирована', async ({}) => {
  await expect(state.page.locator('#reveal')).toBeDisabled();
});

Then('счёт раунда «Раунд 2» виден', async ({}) => {
  await expect(state.page.locator('#round-counter')).toHaveText('Раунд 2');
});

// Сценарий 4.
Then(/^раунд 3 — «Phillips 66 \(PSX\)»$/, async ({}) => {
  const title = state.page.locator('#round-title');
  await expect(title).toContainText('Phillips 66');
  await expect(title).toContainText('(PSX)');
});

Then('счёт раунда «Раунд 3» виден', async ({}) => {
  await expect(state.page.locator('#round-counter')).toHaveText('Раунд 3');
});

Then('URL страницы не менялся', async ({}) => {
  expect(state.page.url()).toBe(`${BASE}/${PIN_URL}`);
});

// Сценарий 5: пробный драг идёт на другой высоте (верхняя восьмая зоны) —
// на высоте исходного рисования живой ввод повторил бы те же точки и
// Then прошёл бы вакуумно.
When('пробую тянуть линию в зоне прогноза', async ({}) => {
  const page = state.page;
  state.playerPoints = await page.locator(`${CHART} polyline.player`).getAttribute('points');
  const { from, to } = await forecastRange(page);
  const fbox = await page.locator(`${CHART} rect.forecast`).boundingBox();
  await dragMouse(
    page,
    await yearTickX(page, from),
    await yearTickX(page, to),
    fbox.y + fbox.height / 8,
  );
});

Then('нарисованная мной линия не меняется', async ({}) => {
  const page = state.page;
  // Ввод закрыт на уровне стилей: computed pointer-events обязан быть none.
  const pointerEvents = await page.evaluate(
    () => getComputedStyle(document.querySelector('#chart')).pointerEvents,
  );
  expect(pointerEvents).toBe('none');
  const points = await page.locator(`${CHART} polyline.player`).getAttribute('points');
  expect(points).toBe(state.playerPoints);
});

// Сценарий 6: подпись с «(заглушка)» стоит рядом с третьей линией —
// в зоне прогноза, правее пунктира среза.
Then(/^подпись «\(заглушка\)» видима рядом с третьей линией$/, async ({}) => {
  const caption = state.page.locator(`${CHART} text.line-caption`);
  await expect(caption).toBeVisible();
  expect(await caption.textContent()).toContain('(заглушка)');
  const [captionX, cutoffX] = await state.page.evaluate(() => {
    const left = (selector) => document.querySelector(selector).getBoundingClientRect().x;
    return [left('#chart text.line-caption'), left('#chart line.cutoff')];
  });
  expect(captionX).toBeGreaterThan(cutoffX);
});

Then(/^легенда из трёх подписей: моя\/факт\/другие$/, async ({}) => {
  await expect(state.page.locator(`${CHART} .legend-label`))
    .toHaveText(['Ты', 'Факт', 'Другие (заглушка)']);
});

// FP-007: якорь непрерывности — на раскрытии все три линии (игрок,
// факт, «Другие») начинаются с последней точки истории: первая вершина
// каждой polyline обязана совпасть с последней вершиной polyline
// истории (атрибуты points + экранная геометрия getBoundingClientRect).
Then('все три линии начинаются из конца истории', async ({}) => {
  const [firsts, historyLast, lefts, historyRight] = await state.page.evaluate(() => {
    const vertices = (selector) =>
      document
        .querySelector(selector)
        .getAttribute('points')
        .split(' ')
        .map((pair) => pair.split(',').map(Number));
    const box = (selector) => document.querySelector(selector).getBoundingClientRect();
    const history = box('#chart polyline.history');
    return [
      ['player', 'fact', 'others'].map((cls) => vertices(`#chart polyline.${cls}`)[0]),
      vertices('#chart polyline.history').at(-1),
      ['player', 'fact', 'others'].map((cls) => box(`#chart polyline.${cls}`).x),
      history.x + history.width,
    ];
  });
  firsts.forEach(([vx, vy], index) => {
    expect(vx, `x первой вершины линии ${index}`).toBe(historyLast[0]);
    expect(vy, `y первой вершины линии ${index}`).toBe(historyLast[1]);
  });
  lefts.forEach((lx, index) => {
    expect(Math.abs(lx - historyRight), `левый край линии ${index} на экране`).toBeLessThanOrEqual(1);
  });
});

export { test };
