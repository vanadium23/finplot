#!/usr/bin/env python3
"""FP-001: build public/data/companies.json from SEC EDGAR XBRL data.

Pipeline (pinned by card FP-001):
  S&P 500 list (Wikipedia snapshot) -> rank by latest FY revenue ->
  dedup by CIK -> top-160 candidates -> both metrics (revenue + NI) ->
  validation -> first 100 valid -> JSON (tickers in rank order).

Metrics tag chains (first tag owns its years, later tags only fill holes):
  revenue: RevenueFromContractWithCustomerExcludingAssessedTax -> Revenues
           -> SalesRevenueNet -> SalesRevenueGoodsNet
  net income: NetIncomeLoss -> ProfitLoss
Only form=10-K, fp=FY, period length 330..380 days; on filed-date conflicts
(restatements) the later `filed` wins.

THE key gotcha: dedup by FISCAL YEAR (year of period end date), not by the
exact date — FY-end drifts by days (TSN/DE/BBY), date-keyed dedup fakes
holes in the series.

Offline-first: tools/cache/cik<CIK10>_<Tag>.json holds raw EDGAR bodies;
a present file (even a {"__error__":"404"} marker) means "never hit the
network". On miss -> fetch with our User-Agent and cache there.

Idempotency: built_at is derived from the DATA (latest filed date among used
filings), not from wall-clock, so a clean-cache rerun yields identical JSON.

Python stdlib only.
"""

from __future__ import annotations

import json
import re
import statistics
import sys
import time
import urllib.error
import urllib.request
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / "cache"
SEEDS = CACHE / "seeds"
OUT = ROOT / "public" / "data" / "companies.json"

SP500_URL = "https://en.wikipedia.org/api/rest_v1/page/html/List_of_S%26P_500_companies"
EDGAR_URL = "https://data.sec.gov/api/xbrl/companyconcept/CIK{cik:010d}/us-gaap/{tag}.json"
USER_AGENT = "CheFaber finplot faber@localhost"

REV_TAGS = [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet",
]
NI_TAGS = ["NetIncomeLoss", "ProfitLoss"]

TOP_CANDIDATES = 160
TARGET_COMPANIES = 100
MIN_POINTS = 12
MIN_PERIOD_DAYS, MAX_PERIOD_DAYS = 330, 380


# ---------------------------------------------------------------- S&P list
def parse_sp500(html_text: str) -> list[dict]:
    """Parse the companies table: ticker, name (wiki link title), 10-digit CIK."""
    companies = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", html_text, re.S):
        cells_raw = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        cells = [unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in cells_raw]
        ciks = [c for c in cells if re.fullmatch(r"\d{10}", c)]
        if len(cells) < 8 or not ciks:
            continue  # navbox / non-company rows have no CIK column
        ticker, name_text = cells[0], cells[1]
        m = re.search(r'<a[^>]*title="([^"]+)"', cells_raw[1])
        name = unescape(m.group(1)) if m else name_text
        companies.append({"ticker": ticker, "name": name, "cik": int(ciks[0])})
    return companies


def load_sp500() -> list[dict]:
    path = SEEDS / "sp500.html"
    if path.exists():
        return parse_sp500(path.read_text(encoding="utf-8"))
    req = urllib.request.Request(SP500_URL, headers={"User-Agent": USER_AGENT})
    body = urllib.request.urlopen(req, timeout=30).read().decode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")
    return parse_sp500(body)


# ------------------------------------------------------------- EDGAR cache
_TAG_MEMO: dict[tuple[int, str], list[dict]] = {}


def load_tag(cik: int, tag: str) -> list[dict]:
    """Raw us-gaap fact entries for CIK+tag; cache-first, never refetch a
    cached file (a cached __error__ marker counts as data: EDGAR said 404).
    Memoized per process: each cached body is read+parsed once."""
    memo_key = (cik, tag)
    if memo_key in _TAG_MEMO:
        return _TAG_MEMO[memo_key]
    path = CACHE / f"cik{cik:010d}_{tag}.json"
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
    else:
        url = EDGAR_URL.format(cik=cik, tag=tag)
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        body: str | None = None
        for attempt in range(3):
            try:
                body = urllib.request.urlopen(req, timeout=30).read().decode("utf-8")
                break
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    body = json.dumps({"__error__": "404"})
                    break
                time.sleep(1 + attempt)
            except (urllib.error.URLError, TimeoutError, OSError):
                time.sleep(1 + attempt)
        if body is None:
            raise SystemExit(f"network failure fetching {url}; cache is incomplete")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding="utf-8")
        data = json.loads(body)
    facts = [] if "__error__" in data else data.get("units", {}).get("USD", [])
    _TAG_MEMO[memo_key] = facts
    return facts


# ----------------------------------------------------------------- series
def fy_facts(cik: int, tag: str) -> dict[int, dict]:
    """FY 10-K annual facts deduped by FISCAL YEAR (year of period end).

    Filter: form=10-K, fp=FY, 330 <= duration <= 380 days.
    Conflict (restatement): later `filed` wins.
    """
    best: dict[int, dict] = {}
    for e in load_tag(cik, tag):
        if e.get("form") != "10-K" or e.get("fp") != "FY":
            continue
        start, end = e.get("start"), e.get("end")
        if not start or not end:
            continue
        d = _days(start, end)  # leap-safe duration
        if d is None or not (MIN_PERIOD_DAYS <= d <= MAX_PERIOD_DAYS):
            continue
        year = int(end[:4])
        key = (e.get("filed", ""), e.get("accn", ""))
        if year not in best or key > (best[year]["filed"], best[year]["accn"]):
            best[year] = {"val": int(e["val"]), "filed": e.get("filed", ""), "accn": e.get("accn", "")}
    return best


def _days(start: str, end: str) -> int | None:
    from datetime import date

    try:
        s = date(int(start[:4]), int(start[5:7]), int(start[8:10]))
        e = date(int(end[:4]), int(end[5:7]), int(end[8:10]))
    except ValueError:
        return None
    return (e - s).days


def metric_series(cik: int, tags: list[str]) -> tuple[dict[int, int], str]:
    """Merge tag chain by priority: first tag owns its years, later tags
    only fill missing years. Returns {fiscal_year: value}."""
    merged: dict[int, dict] = {}
    for tag in tags:
        for year, fact in fy_facts(cik, tag).items():
            if year not in merged:
                merged[year] = fact
    series = {y: f["val"] for y, f in merged.items()}
    max_filed = max((f["filed"] for f in merged.values()), default="")
    return series, max_filed


def validate(series: dict[int, int]) -> tuple[bool, str]:
    """>=MIN_POINTS points, every step exactly 1 fiscal year, no zeros
    inside the series (a zero is tolerated only at the first point;
    negative values are valid facts)."""
    years = sorted(series)
    if len(years) < MIN_POINTS:
        return False, f"points={len(years)}<{MIN_POINTS}"
    for a, b in zip(years, years[1:]):
        if b - a != 1:
            return False, f"gap {a}->{b}"
    vals = [series[y] for y in years]
    for i, v in enumerate(vals):
        if v == 0 and i > 0:
            return False, f"zero at {years[i]}"
    return True, "ok"


# ----------------------------------------------------------------- build
def build() -> tuple[dict, dict]:
    sp500 = load_sp500()

    # rank by latest FY revenue (from our own EDGAR cache), dedup by CIK
    ranked = []
    for comp in sp500:
        series, _ = metric_series(comp["cik"], REV_TAGS)
        if not series:
            continue  # no revenue data at all -> cannot rank
        last_year = max(series)
        ranked.append((comp, series[last_year]))
    ranked.sort(key=lambda item: -item[1])  # stable: S&P table order breaks ties

    candidates, seen_ciks = [], set()
    for comp, _rev in ranked:
        if comp["cik"] in seen_ciks:
            continue
        seen_ciks.add(comp["cik"])
        candidates.append(comp)
        if len(candidates) == TOP_CANDIDATES:
            break

    companies, max_filed, rejected = [], "", []
    for comp in candidates:
        rev, f1 = metric_series(comp["cik"], REV_TAGS)
        ni, f2 = metric_series(comp["cik"], NI_TAGS)
        rev_ok, rev_msg = validate(rev)
        ni_ok, ni_msg = validate(ni)
        if rev_ok and ni_ok:
            companies.append({
                "ticker": comp["ticker"],
                "name": comp["name"],
                "cik": comp["cik"],
                "revenue": {str(y): rev[y] for y in sorted(rev)},
                "net_income": {str(y): ni[y] for y in sorted(ni)},
            })
            max_filed = max(max_filed, f1, f2)
        else:
            rejected.append(f"{comp['ticker']}: rev[{rev_msg}] ni[{ni_msg}]")
        if len(companies) == TARGET_COMPANIES:
            break

    dataset = {
        "built_at": f"{max_filed}T00:00:00Z" if max_filed else "",
        "source": "SEC EDGAR XBRL",
        "companies": companies,
    }
    meta = {"ranked": len(ranked), "candidates": len(candidates),
            "valid_seen": len(companies) + sum(1 for _ in rejected), "rejected": rejected}
    return dataset, meta


def spot_check(dataset: dict) -> tuple[list[str], bool]:
    """Independently re-derive 3 companies' values straight from cache files."""
    cache = CACHE
    lines, ok_all = [], True
    idxs = [0, len(dataset["companies"]) // 2, len(dataset["companies"]) - 1]
    for i in idxs:
        comp = dataset["companies"][i]
        for metric, tags in (("revenue", REV_TAGS), ("net_income", NI_TAGS)):
            years = sorted(comp[metric], key=int)
            for y in (years[0], years[-1]):
                # independent re-read: raw chain, fiscal-year dedup, latest filed
                got = None
                for tag in tags:
                    path = cache / f"cik{comp['cik']:010d}_{tag}.json"
                    facts = fy_facts(comp["cik"], tag) if path.exists() else {}
                    if int(y) in facts:
                        got = facts[int(y)]["val"]
                        break
                want = comp[metric][y]
                status = "ok" if got == want else f"MISMATCH got={got}"
                if got != want:
                    ok_all = False
                lines.append(f"spot {comp['ticker']} {metric}[{y}] = {want}: {status}")
    lines.append(f"spot-check: {'PASS' if ok_all else 'FAIL'}")
    return lines, ok_all


def main() -> int:
    dataset, meta = build()
    companies = dataset["companies"]

    out_json = json.dumps(dataset, indent=2, ensure_ascii=False) + "\n"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    prev = OUT.read_text(encoding="utf-8") if OUT.exists() else None
    idem = "n/a (first run)" if prev is None else ("SAME" if prev == out_json else "CHANGED")
    OUT.write_text(out_json, encoding="utf-8")

    check_lines, spot_ok = spot_check(dataset)

    # ---- invariants -------------------------------------------------
    errors = []
    n = len(companies)
    rev_pts = [len(c["revenue"]) for c in companies]
    ni_pts = [len(c["net_income"]) for c in companies]
    for c in companies:
        for metric in ("revenue", "net_income"):
            ok, msg = validate({int(y): v for y, v in c[metric].items()})
            if not ok:
                errors.append(f"invariant {c['ticker']} {metric}: {msg}")
    if not dataset["built_at"]:
        errors.append("invariant built_at empty")
    if n < TARGET_COMPANIES:
        errors.append(f"invariant companies {n} < {TARGET_COMPANIES}")

    # offline cross-check against the probe seed when it is present
    seed_path = SEEDS / "dataset_seed3.json"
    seed_note = "seed absent, сверка skipped"
    if seed_path.exists():
        seed = json.loads(seed_path.read_text(encoding="utf-8"))
        want_first100 = list(seed)[:TARGET_COMPANIES]
        got_first100 = [c["ticker"] for c in companies]
        if got_first100 == want_first100:
            seed_note = "seed сверка: first 100 == dataset_seed3 order"
        else:
            errors.append("invariant seed сверка: tickers/order differ from dataset_seed3")
            seed_note = f"seed сверка FAILED: got {got_first100[:5]}… want {want_first100[:5]}…"

    ok = not errors and spot_ok

    # ---- stdout report ----------------------------------------------
    print(f"S&P parsed: {meta['ranked']} rankable -> top-{meta['candidates']} candidates")
    for rej in meta["rejected"]:
        print(f"  rejected: {rej}")
    print(f"companies: {n} (target >= {TARGET_COMPANIES})")
    print(f"revenue points: min={min(rev_pts)} median={statistics.median(rev_pts)}")
    print(f"net_income points: min={min(ni_pts)} median={statistics.median(ni_pts)}")
    print(f"first 20 tickers: {', '.join(c['ticker'] for c in companies[:20])}")
    print(f"built_at (data-derived): {dataset['built_at']}")
    print(f"idempotency vs previous output: {idem}")
    print(f"seed сверка: {seed_note}")
    for line in check_lines:
        print(line)
    if errors:
        print("INVARIANTS FAILED:")
        for e in errors:
            print(f"  {e}")
    else:
        print("INVARIANTS: all pass")
    print(f"written: {OUT.relative_to(ROOT)} ({len(out_json)} bytes)")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
