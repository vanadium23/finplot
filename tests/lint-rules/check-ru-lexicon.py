#!/usr/bin/env python3
# bdd-standard: пре-чек RU-Gherkin лексики.
# Ловит класс ошибок «валидный Gherkin, битый русский»: латинские
# подмены в ключевых словах (Допustim), обрезанные ключи (Сcnario).
# Парсер такие строки считает текстом шага — линт молчит, раннер
# падает «Missing step definitions» (или хуже: молча пропускает).
# Запуск: python3 tests/lint-rules/check-ru-lexicon.py tests/features
import re
import sys
from pathlib import Path

# Словарь = RU-диалект gherkin-go v26 (dialects_builtin.go): NOT общий
# Gherkin — расхождения молча съедаются парсером (кейс: «Фон» — не
# ключевое слово gherkin-go, фоновые шаги теряются без ошибок).
KEYWORDS = {
    'Функция', 'Функциональность', 'Функционал', 'Свойство', 'Фича',
    'Правило', 'Предыстория', 'Контекст', 'Сценарий', 'Пример',
    'Структура сценария', 'Шаблон сценария', 'Примеры', 'Допустим',
    'Дано', 'Пусть', 'Если', 'Когда', 'То', 'Затем', 'Тогда', 'Также',
    'И', 'К тому же', 'А', 'Иначе', 'Но',
}
# Слова, которые выглядят ключевыми словами Gherkin, но gherkin-go их
# НЕ знает: строка станет текстом шага (для playwright-bdd — норм).
TRAPS = {
    'Фон': 'gherkin-go: используй «Предыстория» или «Контекст»',
}
# язык определяется по заголовку файла
LANG_RE = re.compile(r'^#\s*language:\s*(\S+)', re.M)
# строка шага/заголовка: 0+ пробелов, слово (кириллица/латиница любым
# регистром), затем пробел или двоеточие
LINE_RE = re.compile(r'^(\s*)([А-ЯЁа-яёA-Za-z]+)(\s+|:)(.*)$')
# латиница внутри кириллического слова = гомоглиф
HOMOGLYPH_RE = re.compile(r'\b\w*[А-ЯЁа-яё]\w*[A-Za-z]\w*\b|\b\w*[A-Za-z]\w*[А-ЯЁа-яё]\w*\b')

def check(path: Path) -> list:
    errors = []
    text = path.read_text(encoding='utf-8')
    lang = LANG_RE.search(text)
    if not lang or lang.group(1) != 'ru':
        return errors  # чек только для ru-фич
    for i, line in enumerate(text.splitlines(), 1):
        m = LINE_RE.match(line)
        if not m:
            continue
        word = m.group(2)
        if word in TRAPS:
            errors.append(f'{path}:{i}: «{word}» — не ключевое слово gherkin-go ({TRAPS[word]}) — строка станет текстом шага')
            continue
        if word in KEYWORDS or word.startswith('#'):
            # ключевое слово найдено — гомоглифов в нём быть не может,
            # но проверим: словарь точный, любое несовпадение уже ловится ниже
            continue
        # похоже на ключевое слово, но его нет в словаре
        kw_lower = {k.lower() for k in KEYWORDS}
        truncated = any(len(word) >= 4 and k.startswith(word.lower()) and len(word) < len(k) for k in kw_lower)
        if HOMOGLYPH_RE.search(word) or word.lower() in kw_lower or truncated:
            why = 'латинская подмена' if HOMOGLYPH_RE.search(word) else ('обрезанное ключевое слово' if truncated else 'опечатка')
            errors.append(f'{path}:{i}: подозрительное ключевое слово «{word}» — {why} (словарь: {", ".join(sorted(KEYWORDS))})')
    return errors

def main():
    roots = sys.argv[1:] or ['tests/features']
    errors = []
    files = []
    for root in roots:
        p = Path(root)
        if p.is_file():
            files.append(p)
        else:
            files += list(p.rglob('*.feature'))
    for p in files:
        errors += check(p)
    if errors:
        print('\n'.join(errors))
        sys.exit(1)
    print(f'ru-lexicon: OK ({len(files)} файлов)')

if __name__ == '__main__':
    main()
