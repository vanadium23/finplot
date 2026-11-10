// bdd-standard: smoke-check отчёта на стенде.
// Открывает :PORT/testing/ головным Chromium, сравнивает счётчики
// (All/Passed/Failed) с локальным прогоном из .last-run.json.
// Запуск: node tests/check-stand-report.js http://localhost:41003
const { chromium } = require('@playwright/test');
const fs = require('fs');

const url = process.argv[2] || 'http://localhost:41003';

(async () => {
  const local = JSON.parse(fs.readFileSync('test-results/.last-run.json', 'utf8'));
  if (local.status !== 'passed') {
    console.error(`FAIL: локальный прогон не зелёный (${local.status}) — проверь make test`);
    process.exit(1);
  }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${url}/testing/`, { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  const text = await page.evaluate(() => document.body.innerText);
  await browser.close();
  const m = text.match(/All\s*(\d+)\s*Passed\s*(\d+)\s*Failed\s*(\d+)/);
  if (!m) {
    console.error('FAIL: счётчики отчёта не найдены — отчёт не рендерится или не тот');
    process.exit(1);
  }
  const [, all, passed, failed] = m.map(Number);
  if (failed !== 0 || passed !== all) {
    console.error(`FAIL: на стенде не зелёный: All ${all} / Passed ${passed} / Failed ${failed}`);
    process.exit(1);
  }
  console.log(`check-stand: OK — отчёт на стенде зелёный, All ${all} / Passed ${passed} / Failed ${failed}`);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
