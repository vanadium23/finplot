#!/usr/bin/env python3
"""FP-002 probe: пинованные числа спеки test/spec/fp-002.feature.md.

Python-референс формул карточки FP-002 (независимая реализация для
сверки с JS). Детерминирован: читает замороженную фикстуру, без сети.

Прогон: python3 tools/spec_fp002_probe.py
"""
import json, math, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

def mulberry32(seed):
    a = seed & 0xFFFFFFFF
    def rnd():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = a
        t = ((t ^ (t >> 15)) * t) & 0xFFFFFFFF
        t = ((t ^ (t + 0x1D872B41)) & 0xFFFFFFFF) ^ (t >> 7)
        t = (t ^ (t >> 14)) & 0xFFFFFFFF
        return t / 4294967296
    return rnd

def pick_round(companies, rng):
    """2 числа rng: компания, метрика. cutoffIndex = floor(0.6*n)."""
    r1, r2 = rng(), rng()
    comp = companies[math.floor(r1 * len(companies))]
    metric = 'revenue' if r2 < 0.5 else 'net_income'
    years = sorted(int(y) for y in comp[metric])
    vals = [comp[metric][str(y)] for y in years]
    cut = math.floor(0.6 * len(vals))
    return comp, metric, years, vals, cut

def score(guess, actual, ymin, ymax):
    misses = [abs(g - a) for g, a in zip(guess, actual)]
    avg = sum(misses) / len(misses)
    pts = round(100 * max(0.0, 1 - avg / (ymax - ymin)))
    return misses, avg, pts

def pseudo_others(hidden, rng):
    """others[0]=факт (якорь); others[i]=actual[i]+u_i*0.15*|actual[i]-actual[i-1]|."""
    out = [float(hidden[0])]
    prev = hidden[0]
    for a in hidden[1:]:
        u = 2 * rng() - 1
        out.append(a + u * 0.15 * abs(a - prev))
        prev = a
    return out

if __name__ == '__main__':
    data = json.loads((ROOT / 'test/fixtures/mini-companies.json').read_text())
    comps = data['companies']

    r = mulberry32(42)
    comp, metric, years, vals, cut = pick_round(comps, r)
    print(f"S1 seed=42: {comp['ticker']} {metric}, shown {years[0]}-{years[cut-1]} "
          f"({cut} pts), draw {years[cut:]}")
    comp2, m2, *_ = pick_round(comps, r)
    print(f"S2 next: {comp2['ticker']} {m2}")

    drama = next(c for c in comps if c['ticker'] == 'DRAMA')
    y = sorted(int(k) for k in drama['revenue'])
    vals = [drama['revenue'][str(i)] for i in y]
    cut = math.floor(0.6 * len(vals))
    hidden = vals[cut:]
    m, avg, pts = score(hidden[:], hidden, min(vals), max(vals))
    print(f"S3 exact: avgMiss={avg!r} points={pts}")
    m, avg, pts = score([25.0] * len(hidden), hidden, min(vals), max(vals))
    print(f"S4 flat25: misses={m} avgMiss={avg!r} ({avg:.6f}) points={pts}")

    r = mulberry32(7)
    pick_round(comps, r)  # SMALL revenue (пин спеки)
    small = next(c for c in comps if c['ticker'] == 'SMALL')
    y = sorted(int(k) for k in small['revenue'])
    vals = [small['revenue'][str(i)] for i in y]
    cut = math.floor(0.6 * len(vals))
    others = pseudo_others(vals[cut:], r)
    print(f"S5 others SMALL seed=7: {[round(o, 4) for o in others]}")
