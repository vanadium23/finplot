// FP-002: степы logic-проекта — чистые модули без браузера.
// test берём из 'playwright-bdd' (не '@playwright/test'); expect в v9
// не ре-экспортируется — импортируем штатно из '@playwright/test'.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { test, createBdd, defineParameterType } from 'playwright-bdd';
import { loadDataset } from '../../src/data.js';
import { pickRound } from '../../src/round.js';
import { score } from '../../src/score.js';
import { pseudoOthers } from '../../src/others.js';
import { mulberry32 } from '../../src/rng.js';

const { Given, When, Then } = createBdd();

defineParameterType({
  name: 'numlist',
  regexp: /\[[^\]]+\]/,
  transformer: (s) => JSON.parse(s),
  useForSnippets: false,
});

defineParameterType({
  name: 'num',
  regexp: /-?\d+(?:\.\d+)?/,
  transformer: (s) => Number(s),
  useForSnippets: false,
});

const FIXTURE = fileURLToPath(
  new URL('../../test/fixtures/mini-companies.json', import.meta.url),
);

// Состояние сценария: воркер гоняет сценарии последовательно, каждый Given
// полностью переинициализирует всё, что нужно его сценарию.
const state = {};

function fixtureText() {
  return readFileSync(FIXTURE, 'utf8');
}

function datasetCompanies() {
  return loadDataset(fixtureText()).companies;
}

function hiddenValues() {
  return state.round.points
    .slice(state.round.cutoffIndex)
    .map((p) => p.value);
}

function tryLoadDataset(text) {
  try {
    loadDataset(text);
    return null;
  } catch (e) {
    return e;
  }
}

// Сценарии 1-2: лента раундов.
Given('фикстура из 5 компаний и rng с seed {int}', async ({}, seed) => {
  state.companies = datasetCompanies();
  expect(state.companies).toHaveLength(5);
  state.rng = mulberry32(seed);
  delete state.round;
});

Given('движок выдал первый раунд', async () => {
  state.round = pickRound(state.companies, state.rng);
});

When('движок выдаёт первый раунд', async () => {
  state.round = pickRound(state.companies, state.rng);
});

When('игрок жмёт «Следующий график»', async () => {
  state.round = pickRound(state.companies, state.rng);
});

Then('компания раунда {string}', async ({}, ticker) => {
  expect(state.round.ticker).toBe(ticker);
});

Then('метрика раунда {string}', async ({}, metric) => {
  expect(state.round.metric).toBe(metric);
});

Then('cutoffIndex равен {int}', async ({}, expected) => {
  expect(state.round.cutoffIndex).toBe(expected);
});

Then('показанные годы с {int} по {int} — {int} точек', async ({}, y0, y1, n) => {
  const shown = state.round.points.slice(0, state.round.cutoffIndex);
  expect(shown).toHaveLength(n);
  expect(shown[0].year).toBe(y0);
  expect(shown[shown.length - 1].year).toBe(y1);
});

Then('годы для рисования с {int} по {int} — {int} точек', async ({}, y0, y1, n) => {
  const drawn = state.round.points.slice(state.round.cutoffIndex);
  expect(drawn).toHaveLength(n);
  expect(drawn[0].year).toBe(y0);
  expect(drawn[drawn.length - 1].year).toBe(y1);
});

// Сценарии 3-4: score. Раунд собирается настоящим pickRound по одной
// компании из фикстуры; stub-rng даёт нужную метрику (r2 < 0.5 → revenue).
Given('раунд {string} с метрикой {string} на фикстуре', async ({}, ticker, metric) => {
  state.companies = datasetCompanies();
  const company = state.companies.find((c) => c.ticker === ticker);
  if (!company) throw new Error(`нет компании ${ticker} в фикстуре`);
  const stubRng = () => (metric === 'revenue' ? 0.24 : 0.62);
  state.round = pickRound([company], stubRng);
  const values = state.round.points.map((p) => p.value);
  // ось по умолчанию: min/max полного факта (research pin)
  state.yMin = Math.min(...values);
  state.yMax = Math.max(...values);
});

Given('ось Y от {int} до {int}', async ({}, yMin, yMax) => {
  state.yMin = yMin;
  state.yMax = yMax;
});

Given('скрытая часть ряда {numlist}', async ({}, expected) => {
  expect(hiddenValues()).toEqual(expected);
});

When('игрок нарисовал {numlist}', async ({}, guess) => {
  state.guess = guess;
  state.result = score(guess, hiddenValues(), state.yMin, state.yMax);
});

Then('промахи по годам {numlist}', async ({}, expected) => {
  const actual = hiddenValues();
  const misses = state.guess.map((g, i) => Math.abs(g - actual[i]));
  expect(misses).toEqual(expected);
});

Then('avgMiss равен {num}', async ({}, expected) => {
  expect(state.result.avgMiss).toBeCloseTo(expected, 3);
});

Then('очки равны {int}', async ({}, expected) => {
  expect(state.result.points).toBe(expected);
});

// Сценарий 5: pseudoOthers на rng с seed 7 после 2 чисел pickRound.
Given('фикстура из 5 компаний и rng с seed {int} после 2 чисел pickRound', async ({}, seed) => {
  state.companies = datasetCompanies();
  state.rng = mulberry32(seed);
  state.round = pickRound(state.companies, state.rng);
});

When('движок генерирует линию «Другие»', async () => {
  state.others = pseudoOthers(hiddenValues(), state.rng);
});

Then('линия равна {numlist} с допуском {num}', async ({}, expected, tol) => {
  expect(state.others).toHaveLength(expected.length);
  state.others.forEach((v, i) =>
    expect(Math.abs(v - expected[i]), `точка ${i}`).toBeLessThanOrEqual(tol),
  );
});

Then('первая точка линии равна факту {num}', async ({}, anchor) => {
  expect(state.others[0]).toBe(hiddenValues()[0]);
  expect(state.others[0]).toBe(anchor);
});

Then('шум каждой точки в полосе 15% локального наклона', async () => {
  const actual = hiddenValues();
  for (let i = 1; i < state.others.length; i++) {
    const band = 0.15 * Math.abs(actual[i] - actual[i - 1]) + 0.001;
    expect(Math.abs(state.others[i] - actual[i]), `точка ${i}`)
      .toBeLessThanOrEqual(band);
  }
});

Then('линия не совпадает с фактом тождественно', async () => {
  const actual = hiddenValues();
  expect(state.others.some((v, i) => v !== actual[i])).toBe(true);
});

Then('повторный прогон с seed {int} даёт ту же линию', async ({}, seed) => {
  const rng = mulberry32(seed);
  pickRound(state.companies, rng);
  expect(pseudoOthers(hiddenValues(), rng)).toEqual(state.others);
});

// Сценарии 6-8: fail-fast loadDataset.
When('loadDataset получает {string}', async ({}, text) => {
  state.loadError = tryLoadDataset(text);
});

function mutatedFixture(mutator) {
  const data = JSON.parse(fixtureText());
  mutator(data);
  return JSON.stringify(data);
}

Given('датасет с пропуском одного года внутри ряда', async () => {
  state.rawText = mutatedFixture((data) => {
    delete data.companies[0].revenue['2010'];
  });
});

Given('датасет с рядом из 11 годовых точек', async () => {
  state.rawText = mutatedFixture((data) => {
    const row = data.companies[0].revenue;
    const years = Object.keys(row).sort();
    for (const y of years.slice(11)) delete row[y];
  });
});

When('loadDataset читает этот датасет', async () => {
  state.loadError = tryLoadDataset(state.rawText);
});

Then('загрузка бросает исключение', async () => {
  expect(state.loadError).toBeInstanceOf(Error);
});

export { test };
