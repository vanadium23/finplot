# Finplot

Игра «дорисуй график»: линия реальной годовой выручки или чистой прибыли
US-компании обрывается на срезе (~60% истории) — игрок дорисовывает
продолжение мышью или пальцем, затем видит факт, очки и средний промах.
Бесконечная лента. Русский интерфейс, frontend-only.

- Бриф: `loci-communes/briefs/finplot.md` (v1 accepted, 2026-11-10)
- Данные: SEC EDGAR XBRL (data.sec.gov), ~100 крупнейших US-компаний
  (S&P 500), датасет запечён в `public/data/companies.json` скриптом
  `tools/build_dataset.py` (обновление = перезапуск + перекоммит).
- Стек: vanilla HTML/CSS/JS + SVG, без сборки (ADR-0001).
- Тесты: bdd-standard, `make test` (RU-Gherkin, playwright-bdd);
  отчёт на стенде `/testing/`.
- Стенд: `:41007` (compose в faber-hermes-config/infra/finplot/).

## Разработка

```sh
npm i -D               # dev-зависимости (playwright-bdd, gherkin-lint)
make test              # линт + logic + e2e, HTML-отчёт в testing/
make stand-up          # поднять стенд :41007
make check-stand       # smoke: приложение + отчёт /testing зелёный
```

Карточки задач: `docs/tasks.md` (FP-NNN).
