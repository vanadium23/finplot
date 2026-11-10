# Задачи Finplot (FP)

Реестр ID: `docs/tasks/INDEX.md` (схема faber-hermes-config/docs/task-ids.md).
Карточка не диспетчится без `bdd: ready`. Бриф: loci-communes/briefs/finplot.md (v1 accepted).

### FP-001: Датасет v1 — builder + companies.json
- files: tools/build_dataset.py, public/data/companies.json
- design: pinned — контракт `companies.json`:
  `{"built_at": "<ISO>", "source": "SEC EDGAR XBRL", "companies": [{"ticker","name","cik","revenue":{"<FY-end ISO>": <USD>}, "net_income":{...}}]}`;
  пайплайн: S&P 500 (Wikipedia, CIK оттуда же) → ранг по последней FY-выручке
  (EDGAR) → топ-150 кандидатов → обе метрики (цепочка тегов RFCWC → Revenues
  → SalesRevenueNet; NI = NetIncomeLoss; только 10-K FY, длительность
  330–380 дн., при конфликте filed-дат побеждает поздняя) → валидация
  (≥12 точек, шаги 330–400 дн., без нулей/дыр внутри) → первые 100 валидных.
  Кэш ответов в `tools/cache/` (gitignored) — повторный прогон оффлайн.
- ideate: n/a
- bdd: n/a — build-инструмент вне JS-харнесса; инварианты = exit-code
  билдера + AC карточки (ревьюер перезапускает). Контракт датасета
  проверяется на стороне потребителя в FP-002.
- depends: —
- must work: прогон из кэша идемпотентен; датасет проходит инварианты
- out of scope: авто-обновление, не-US, метрики кроме revenue/NI
- AC: companies.json в репо; ≥100 компаний; у каждой оба ряда ≥12 FY-точек
  без дыр; builder печатает инварианты и выходит 0; спот-чек ревьюером:
  3 компании сверены с data.sec.gov вручную
- status: todo

### FP-002: Ядро игры — чистые модули + замороженная фикстура
- files: src/data.js, src/round.js, src/score.js, src/others.js,
  test/fixtures/mini-companies.json, tests/features/logic/game-core.feature,
  tests/steps/logic_steps.js
- design: pinned — сигнатуры:
  `loadDataset(rawJsonText) -> {companies}` (throw при битом/невалидном);
  `pickRound(dataset, rng) -> {ticker, metric, points[{year,value}], cutoffIndex}`
  (метрика 50/50, cutoffIndex = floor(0.6*n), rng = mulberry32-инъекция);
  `score(guess[], actual[], yMin, yMax) -> {avgMiss, points}`:
  avgMiss = mean(|g-a|), points = round(100*max(0, 1-avgMiss/(yMax-yMin)));
  `pseudoOthers(actual[], rng) -> number[]` — факт с детерминированным шумом
  ±15% (масштаб — локальный |наклон|), честно помечается на UI.
- ideate: n/a — формулы запинены брифом и картой
- bdd: todo — test/spec/fp-002.feature.md → tests/features/logic/
- depends: — (контракт из FP-001 заморожен здесь; разработка на фикстуре
  mini-companies.json — 5 рукописных компаний, руки+точные числа в спеке;
  прод-датасет не трогает)
- must work: логика без браузера гоняется playwright-проектом logic
- out of scope: SVG, UI, события мыши
- AC: logic-фичи зелёные; негативные сценарии: битый JSON, ряд с дырой,
  <12 точек; числа спеки посчитаны живым прогоном на фикстуре
- status: doing
- ход работы: 2026-11-10 старт в worktree fp-002 — RED: фича + степы
  на пустых модулях src/*.js

### FP-003: График и рисование
- files: index.html, src/chart.js, src/draw.js, src/app.js, src/style.css,
  tests/features/e2e/draw.feature, tests/steps/draw_steps.js
- design: pinned — `renderChart(container, round) -> {svg, x(year), y(value)}`;
  `enableDraw(svg, round, {onComplete})` — pointer events (мышь+touch),
  клавиатура ←→ год, ↑↓ значение; каждый год обязан иметь значение
- ideate: n/a
- bdd: todo — e2e: playwright webServer на public/ (без file://-флагов)
- depends: FP-002
- must work: бриф-AC «дорисовка мышью и пальцем, каждый год»; пунктир
  среза, затемнённая зона прогноза; кнопка «Открыть факт» активна только
  при полном ряде
- out of scope: экран reveal (FP-004), стиль-полировка (FP-005)
- AC: e2e-draw зелёвой; драг рисует все годы; неполный ряд держит кнопку
  disabled; скрины desktop (1280px) + mobile (390px) в docs/acceptance/
- status: todo

### FP-004: Reveal и бесконечная лента
- files: src/reveal.js, src/app.js (расширение), src/style.css,
  tests/features/e2e/reveal.feature, tests/steps/reveal_steps.js
- design: pinned — `renderReveal(container, round, guess, others)`;
  «Следующий график» = pickRound со следующим rng-шагом, счёт раундов
  в памяти страницы
- ideate: n/a
- bdd: todo
- depends: FP-003
- must work: три линии (игрок/факт/«Другие (заглушка)»), очки + средний
  промах в единицах метрики, следующий раунд — другая компания
- out of scope: шеринг, сохранение прогресса
- AC: e2e-reveal зелёвой; подпись заглушки видима; очки считаются как в
  FP-002; скрины двух состояний
- status: todo

### FP-005: RU-минимализм и мобильная доводка
- files: src/style.css, index.html
- design: n/a
- ideate: n/a
- bdd: n/a — визуальная карточка; доказательство = скрины по чек-листу
- depends: FP-004
- must work: читаемость на 390px, рисование пальцем без зума страницы,
  RU-тексты во всех состояниях
- out of scope: тёмная тема, i18n-переключатель
- AC: скрины iPhone-viewport: лента, рисование, reveal; ни одного
  латинского UI-текста (кроме тикеров/имён компаний)
- status: todo

### FP-006: Стенд :41007 + /testing-отчёт
- files: faber-hermes-config/infra/finplot/{docker-compose.yml, nginx.conf,
  mime.types}, faber-hermes-config/infra/PORTS.md
- design: n/a
- ideate: n/a
- bdd: n/a — infra; проверка = make check-stand
- depends: FP-003 (поднять можно рано; полный check-stand — после FP-004)
- must work: nginx:alpine, bind-mount репо, порт 41007, mime mjs
  (урок taste-map-v2), /testing/ отдаёт зелёный отчёт
- out of scope: prod-домены
- AC: PORTS.md строка тем же коммитом; make check-stand зелёный на
  :41007; curl -I ...app.js → application/javascript (не octet-stream)
- status: todo

## Волны

1. FP-001 ∥ FP-002 (контракт датасета заморожен в картах, фикстура в FP-002)
2. FP-003 → FP-004 (один файл app.js — не параллелим)
3. FP-005 ∥ FP-006
