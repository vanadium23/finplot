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
- Ход работы:
  - doing: tools/build_dataset.py — пайплайн по пину, offline-first из tools/cache/
  - sp500.html → 503 компании (имя = title-колонка ссылки), ранг по последней FY-выручке из кэша
  - дедуп: по CIK (GOOGL/GOOG, FOXA/FOX, NWSA/NWS — стабильная сортировка держит первую строку) и по фискальному году как ключ ряда (FY-end гуляет на дни — TSN/DE/BBY)
  - метрики: цепочки 4 тега выручки + 2 NI, только 10-K FY 330–380 дн., конфликт filed → поздний; приоритетный тег владеет своими годами, остальные заполняют дыры
  - валидация: ≥12 точек, шаг ровно 1 год, нули запрещены кроме первой точки (ORCL), отрицательные валидны
  - прогон: 490 ранжируемых → топ-160 → 126 валидных → первые 100; seed-сверка: порядок первых 100 == dataset_seed3
  - спот-чек AMZN/CSCO/AMAT (обе метрики, первый+последний год) против кэша: PASS; инварианты exit 0
  - built_at из max filed данных (не из часов); повторный прогон: sha256 совпал, SAME
- Rejected findings:
  - [r1] mobile тики/подписи плотные — территория FP-005.
  - [r1] boundingBox SVG ink-box и When→Then→When — уроки в pending на bdd-standard.
  - [r1] enableDraw {onChange} vs design {onComplete} — расхождение формулировок, семантика шире.
  - [r1] некруглые метки Y (52/101/151) — стиль разметки, полировка FP-005.
  - [r1] мутант (f) HTML-disabled — эквивалентен (boot() дизейблит после fetch), правомерно пережил.
- status: done — review: r1 request_changes (пин Y-оси), фикс d475470, r2 approve 2026-11-10

- review: approve 2026-11-10 (кроссчек 100 компаний, спот MSFT/BA/DE, мутации 3 killed + 1 эквивалентный).

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
- Rejected findings:
  - [r1] bddgen пишет в .features-gen/ при output '.bdd-gen' — вольность v9, оба в gitignore.
  - [r1] pickRound(companies, rng) vs (dataset, rng) в design — расхождение формулировок, семантика та же.
  - [r1] src/rng.js вне files: — санкционированный мост (mulberry32 в design карточки).
  - [r1] узкий kill-set мутанта max-vs-mean — сценарий 3 эквивалентен на нулях, сценарий 4 различает.
  - [r2] CI-аннотации Node 20 deprecated / ubuntu-latest — предупреждения раннера, вне карточки.
- status: done — review: r1 request_changes D-1 (пин потока rng), фикс 5fcf1dd, r2 approve 2026-11-10
- ход работы: 2026-11-10, worktree fp-002 — RED: фича + степы на пустых
  модулях (6fb06fd) → GREEN: src/{data,round,score,others,rng}.js;
  mulberry32 — бит-в-бит порт tools/spec_fp002_probe.py (потоки seed 42/7/
  123456789 совпали с питон-референсом; первый порт пропустил финальный
  xor-shift14 — поймано сверкой потоков); DRAMA flat-25 через node -e:
  avgMiss = 5.428571428571429 = 38/7, points = 94; make test зелёный
  (lint + logic 8/8)
  round 1: request_changes D-1 (пины грубые) → пин сырого потока
  mulberry32 добавлен (seed 42×6 + seed 7×3, toBe без допуска,
  литералы с spec_fp002_probe.py); мутант (e) убит: RED → GREEN 9/9

### FP-003: График и рисование
- files: index.html, src/chart.js, src/draw.js, src/app.js, src/style.css,
  playwright.config.js (webServer на статику), tests/features/e2e/draw.feature,
  tests/steps/draw_steps.js
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
- AC: e2e-draw зелёной; драг рисует все годы; неполный ряд держит кнопку
  disabled; скрины desktop (1280px) + mobile (390px) в docs/acceptance/
- Ход работы:
  - 2026-11-10, worktree fp-003 — RED (e0500f0): фича
    tests/features/e2e/draw.feature, 6 сценариев спеки 1:1; пин seed 42 →
    META · выручка (показано 2010–2018, рисовать 2019–2025) сверен живым
    прогоном на прод-датасете; степы draw_steps.js падают на пустой
    странице
  - GREEN (c6e3864): chart.js — рукописный SVG и makeScales (ось Y =
    min/max полного факта + обратные шкалы для draw), история, пунктир
    среза между 2018/2019, затемнённая зона; draw.js — Pointer Events
    одной дорожкой (мышь+палец), драг интерполирует пропущенные годы,
    клавиатура ←→ год ↑↓ значение (tabindex=0), кламп значения в ось;
    app.js — seed из ?seed= иначе crypto, fetch → loadDataset →
    pickRound → renderChart + enableDraw; «Открыть факт» disabled до
    полного ряда, клик — заглушка (reveal в FP-004); «Стереть» чистит
    слой игрока; webServer python3 http.server :8123 в playwright.config
  - e2e 6/6: неполный ряд (6 из 7) держит кнопку disabled; touch — новый
    context hasTouch 390×844, драг через CDP Input.dispatchTouchEvent,
    реальный pointer-type touch доказан data-атрибутом; make test зелёный
    весь: lint + logic 9 + e2e 6 = 15 passed, прогон повторён
  - уловки в степы: keywords-in-logical-order запрещает When→Then→When —
    второй When записан «И»-континуатором; Playwright boundingBox у SVG
    возвращает ink-box со штрихом (+4px) — геометрия истории сравнивается
    через getBoundingClientRect
  - скрины AC: docs/acceptance/fp-003-desktop.png (1280×800),
    fp-003-mobile.png (390×844) после загрузки seed=42
  - 2026-11-10, round 1 — request_changes: пин Y-оси (min/max полного
    факта) не закреплён — добавлен шаг «И ось Y размечена по полному
    факту» ('201'), мутант (e) «ось по показанной части» убит
- status: done

### FP-004: Reveal и бесконечная лента
- files: src/reveal.js, src/app.js (расширение), src/style.css,
  tests/features/e2e/reveal.feature, tests/steps/reveal_steps.js
- design: pinned — `renderReveal(container, round, guess, others)`;
  «Следующий график» = pickRound со следующим rng-шагом, счёт раундов
  в памяти страницы
- ideate: n/a
- bdd: ready — test/spec/fp-004.feature.md (ОК Ивана 2026-11-10)
- depends: FP-003
- must work: три линии (игрок/факт/«Другие (заглушка)»), очки + средний
  промах в единицах метрики, следующий раунд — другая компания
- out of scope: шеринг, сохранение прогресса
- AC: e2e-reveal зелёной; подпись заглушки видима; очки считаются как в
  FP-002; скрины двух состояний
- Ход работы:
  - 2026-11-10, worktree fp-004: RED (6 failed на пустом #result) → GREEN:
    reveal.js renderReveal (факт скрытых лет, «Другие (заглушка)», очки +
    средний промах со входами score в data-атрибутах), app.js (лента =
    полный ре-рендер, ввод после раскрытия закрыт pointer-events +
    снятие tabindex), скрины AC desktop+mobile, уловка: скобки/слеши в
    шагах — только regexp, units-мутант убит сверкой score/1e9
  - rng: пины META→PG→PSX даёт только цепь pickRound (roundRng 2 числа/
    раунд + othersRng на pseudoOthers); расхождение с research — pending
    диспетчеру
  - make test зелёный ×2: 21 passed (lint + logic 9 + draw 6 + reveal 6)
  - round 1: request_changes D-1 — слабый oracle сценария 5 (драг на той
    же высоте — Then вакуумный); фикс: драг на верхней восьмой зоны +
    ассерт computed pointer-events=none; мутант (e) убит — RED сценария 5
    при снятом class revealed, полный прогон 21 passed
- status: doing — фикс D-1 раунда 1 ревью

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
