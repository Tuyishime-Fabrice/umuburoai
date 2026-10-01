"""Surveillance analytics pipeline (Python port of web/lib/surveillance/pipeline.ts).

upload(s) → validation → cleaning → combination → feature preparation → trend analysis
→ baseline comparison → anomaly detection → risk signal → explainable alert → human
review, plus relationships, prioritisation and a backtested projection.

The algorithm, rounding and wording match the TypeScript implementation exactly so the
web app gets the same result from the API or from its own fallback. Loops are written
out (no sum()) because Python 3.12's sum() of floats uses compensated summation, which
would differ from JavaScript in the last bit.
"""
from __future__ import annotations

import math
import re
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from functools import cmp_to_key
from typing import Any, Callable, Optional

Num = Optional[float]

# --------------------------------------------------------------------------- rules
CASE_DEVIATION_PCT = 25
Z_THRESHOLD = 2
POSITIVITY_RISE_PP = 3
SEVERE_RATIO = 1.5
SEVERE_MIN_EXCESS = 3
CONTEXT_ABOVE_PCT = 20
COMPLETENESS_MIN_PCT = 90
DELAY_MAX_DAYS = 3
STALE_AFTER_DAYS = 21
MIN_CORRELATION_PAIRS = 10
MAX_LAG_WEEKS = 8
NET_COVERAGE_REVIEW_PCT = 80
IRS_COVERAGE_REVIEW_PCT = 70
STOCK_REVIEW_DAYS = 14
FORECAST_MAX_H = 4
FORECAST_MIN_TRAIN = 16
FORECAST_MIN_BACKTEST = 8
FORECAST_RIDGE = 1

# --------------------------------------------------------------------------- reference
PROVINCES = ["Kigali City", "Southern", "Western", "Northern", "Eastern"]
DISTRICTS = (
    [{"district": d, "province": "Kigali City"} for d in ["Gasabo", "Kicukiro", "Nyarugenge"]]
    + [{"district": d, "province": "Southern"} for d in
       ["Gisagara", "Huye", "Kamonyi", "Muhanga", "Nyamagabe", "Nyanza", "Nyaruguru", "Ruhango"]]
    + [{"district": d, "province": "Western"} for d in
       ["Karongi", "Ngororero", "Nyabihu", "Nyamasheke", "Rubavu", "Rusizi", "Rutsiro"]]
    + [{"district": d, "province": "Northern"} for d in ["Burera", "Gakenke", "Gicumbi", "Musanze", "Rulindo"]]
    + [{"district": d, "province": "Eastern"} for d in
       ["Bugesera", "Gatsibo", "Kayonza", "Kirehe", "Ngoma", "Nyagatare", "Rwamagana"]]
)


def province_of(district: str) -> str:
    return next((d["province"] for d in DISTRICTS if d["district"] == district), "")


def province_label(p: str) -> str:
    return "Kigali City" if p == "Kigali City" else f"{p} Province"


def canonical_district(raw: str) -> Optional[str]:
    v = re.sub(r"\s+district$", "", raw.strip(), flags=re.I).strip().lower()
    return next((d["district"] for d in DISTRICTS if d["district"].lower() == v), None)


COLUMNS = [
    "week_start", "epidemiological_week", "district", "population_at_risk",
    "suspected_malaria_cases", "tested_cases", "confirmed_malaria_cases", "positive_tests_pct",
    "severe_malaria_cases", "malaria_deaths", "malaria_admissions", "outpatient_visits",
    "incidence_per_1000", "testing_rate_pct", "rainfall_mm", "mean_temperature_c",
    "relative_humidity_pct", "ndvi", "mosquito_density_index", "larval_density_index",
    "human_mobility_index", "reporting_completeness_pct", "reporting_delay_days",
    "facilities_expected", "facilities_reporting", "act_stock_days", "rdt_stock_days",
    "stockout_days", "bed_occupancy_pct", "bed_net_coverage_pct", "indoor_residual_spraying_pct",
    "confirmed_cases_4wk_avg", "rainfall_4wk_avg", "cases_change_vs_4wk_avg_pct", "alert_label",
]
CORE_COLUMNS = ["week_start", "district", "confirmed_malaria_cases"]
NUMERIC_COLUMNS = [c for c in COLUMNS if c not in ("week_start", "district")]
PCT_FIELDS = {
    "positive_tests_pct", "testing_rate_pct", "relative_humidity_pct", "reporting_completeness_pct",
    "bed_occupancy_pct", "bed_net_coverage_pct", "indoor_residual_spraying_pct",
}

NUM_RE = re.compile(r"[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?")
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")


# --------------------------------------------------------------------------- helpers
def rnd(x: float, d: int) -> float:
    """Round half up like JavaScript Math.round, to d decimals."""
    f = 10 ** d
    return math.floor(x * f + 0.5) / f


def rnd_n(x: Num, d: int) -> Num:
    return None if x is None else rnd(x, d)


def add(xs) -> float:
    s = 0
    for x in xs:
        s += x
    return s


def mean(xs: list) -> Num:
    if not xs:
        return None
    return add(xs) / len(xs)


def sample_sd(xs: list) -> Num:
    if len(xs) < 2:
        return None
    m = mean(xs)
    s = 0
    for x in xs:
        s += (x - m) * (x - m)
    return math.sqrt(s / (len(xs) - 1))


def non_null(xs) -> list:
    return [x for x in xs if x is not None]


def js_str(n) -> str:
    """Number to string the way JavaScript template literals print it."""
    if isinstance(n, float) and n.is_integer():
        return str(int(n))
    return str(n)


def fmt(x: Num, d: int = 0) -> str:
    """Like x.toLocaleString('en-US', {min/max fraction digits: d}).

    ICU rounds the shortest round-trip decimal form of the number (half away from
    zero), so start from repr(x), not from the exact binary value.
    """
    if x is None:
        return "—"
    q = Decimal(repr(x)).quantize(Decimal(1).scaleb(-d), rounding=ROUND_HALF_UP)
    return format(q, f",.{d}f")


def plural(n, word: str) -> str:
    return f"{js_str(n)} {word}{'' if n == 1 else 's'}"


def is_valid_date(s: str) -> bool:
    if not DATE_RE.fullmatch(s):
        return False
    try:
        datetime.strptime(s, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def days_between(a: str, b: str) -> int:
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def add_days(iso: str, days: int) -> str:
    return (date.fromisoformat(iso) + timedelta(days=days)).isoformat()


def group_by(xs: list, key: Callable) -> dict:
    out: dict = {}
    for x in xs:
        out.setdefault(key(x), []).append(x)
    return out


def ratio(num: Num, den: Num, scale: float) -> Num:
    if num is None or den is None or den == 0:
        return None
    return (num / den) * scale


def cmp(a: Num, b: Num) -> Optional[bool]:
    return None if a is None or b is None else a <= b


def trailing_mean(rs: list, i: int, get: Callable) -> Num:
    if get(rs[i]) is None:
        return None
    return mean(non_null(get(x) for x in rs[max(0, i - 3): i + 1]))


def district_week_key(r: dict):
    return (r["district"], r["week_start"])


# --------------------------------------------------------------------------- CSV
def parse_csv(text: str) -> list[list[str]]:
    src = text[1:] if text.startswith("﻿") else text
    rows: list[list[str]] = []
    row: list[str] = []
    field = ""
    in_quotes = False
    i = 0
    n = len(src)
    while i < n:
        c = src[i]
        if in_quotes:
            if c == '"':
                if i + 1 < n and src[i + 1] == '"':
                    field += '"'
                    i += 1
                else:
                    in_quotes = False
            else:
                field += c
        elif c == '"':
            in_quotes = True
        elif c == ",":
            row.append(field)
            field = ""
        elif c in ("\n", "\r"):
            if c == "\r" and i + 1 < n and src[i + 1] == "\n":
                i += 1
            row.append(field)
            field = ""
            rows.append(row)
            row = []
        else:
            field += c
        i += 1
    if field != "" or row:
        row.append(field)
        rows.append(row)
    return [r for r in rows if any(c.strip() != "" for c in r)]


# --------------------------------------------------------------------------- validate one dataset
def in_range(col: str, v: float) -> bool:
    if col == "ndvi":
        return -1 <= v <= 1
    if col == "mean_temperature_c":
        return -10 <= v <= 50
    if col == "cases_change_vs_4wk_avg_pct":
        return True
    if col == "epidemiological_week":
        return float(v).is_integer() and 1 <= v <= 53
    if col == "alert_label":
        return v in (0, 1)
    if col in PCT_FIELDS:
        return 0 <= v <= 100
    return v >= 0


def validate_dataset(inp: dict) -> dict:
    table = parse_csv(inp["csv"])
    header = [h.strip() for h in (table[0] if table else [])]
    body = table[1:]
    validation: list[dict] = []
    restrict = canonical_district(inp["restrictDistrict"]) if inp.get("restrictDistrict") else None

    missing_core = [c for c in CORE_COLUMNS if c not in header]
    missing_optional = [c for c in COLUMNS if c not in CORE_COLUMNS and c not in header]
    extra_cols = [h for h in header if h not in COLUMNS]
    if missing_core:
        validation.append({
            "check": "Required columns", "level": "error",
            "detail": f"Missing required column(s): {', '.join(missing_core)}. The file cannot be used.",
            "count": len(missing_core),
        })
    elif missing_optional:
        validation.append({
            "check": "Required columns", "level": "warn",
            "detail": f"Required columns present. Optional column(s) not supplied: {', '.join(missing_optional)}. "
                      "Analyses that need them show as unavailable.",
            "count": len(missing_optional),
        })
    else:
        validation.append({
            "check": "Required columns", "level": "ok",
            "detail": f"All {len(COLUMNS)} surveillance columns are present.", "count": 0,
        })
    if extra_cols:
        validation.append({
            "check": "Unrecognised columns", "level": "warn",
            "detail": f"Ignored: {', '.join(extra_cols)}.", "count": len(extra_cols),
        })
    idx = {h: i for i, h in enumerate(header)}

    def cell(r: list[str], c: str) -> str:
        i = idx.get(c)
        if i is None or i >= len(r):
            return ""
        return r[i].strip()

    dropped_invalid_key = 0
    dropped_duplicate = 0
    dropped_unknown = 0
    dropped_outside = 0
    unknown_names: list[str] = []
    invalid_numbers = 0
    invalid_number_cols: list[str] = []
    out_of_range = 0
    out_of_range_cols: list[str] = []
    seen: set = set()
    records: list[dict] = []

    for r in ([] if missing_core else body):
        week_start = cell(r, "week_start")
        raw_district = cell(r, "district")
        if not is_valid_date(week_start) or not raw_district:
            dropped_invalid_key += 1
            continue
        district = canonical_district(raw_district)
        if not district:
            dropped_unknown += 1
            if raw_district not in unknown_names:
                unknown_names.append(raw_district)
            continue
        if restrict and district != restrict:
            dropped_outside += 1
            continue
        key = f"{district}|{week_start}"
        if key in seen:
            dropped_duplicate += 1
            continue
        seen.add(key)

        rec: dict[str, Any] = {"week_start": week_start, "district": district}
        for col in NUMERIC_COLUMNS:
            raw = cell(r, col)
            v: Num = None
            if raw != "":
                if NUM_RE.fullmatch(raw):
                    v = float(raw)
                else:
                    invalid_numbers += 1
                    if col not in invalid_number_cols:
                        invalid_number_cols.append(col)
            if v is not None and not in_range(col, v):
                out_of_range += 1
                if col not in out_of_range_cols:
                    out_of_range_cols.append(col)
                v = None
            rec[col] = v
        records.append(rec)
    records.sort(key=district_week_key)

    validation.append({
        "check": "Row keys (date, district)", "level": "warn" if dropped_invalid_key else "ok",
        "detail": (
            f"{plural(dropped_invalid_key, 'row')} dropped: week_start is not a valid YYYY-MM-DD date or district is empty."
            if dropped_invalid_key else "Every row has a valid week_start date and a district."
        ),
        "count": dropped_invalid_key,
    })
    names = ", ".join(unknown_names[:5]) + (", …" if len(unknown_names) > 5 else "")
    validation.append({
        "check": "Districts", "level": "warn" if dropped_unknown else "ok",
        "detail": (
            f"{plural(dropped_unknown, 'row')} excluded: not a Rwandan district ({names})."
            if dropped_unknown else "All rows refer to recognised Rwandan districts."
        ),
        "count": dropped_unknown,
    })
    if restrict:
        validation.append({
            "check": "Access scope", "level": "warn" if dropped_outside else "ok",
            "detail": (
                f"{plural(dropped_outside, 'row')} for other districts excluded: this account can only submit {restrict} data."
                if dropped_outside else f"All rows are for {restrict}."
            ),
            "count": dropped_outside,
        })
    validation.append({
        "check": "Duplicate district-weeks", "level": "warn" if dropped_duplicate else "ok",
        "detail": (
            f"{plural(dropped_duplicate, 'duplicate row')} dropped (first occurrence kept)."
            if dropped_duplicate else "No district has two rows for the same week."
        ),
        "count": dropped_duplicate,
    })
    validation.append({
        "check": "Numeric values", "level": "warn" if invalid_numbers else "ok",
        "detail": (
            f"{plural(invalid_numbers, 'non-numeric value')} set to missing ({', '.join(invalid_number_cols)})."
            if invalid_numbers else "All numeric columns contain numbers."
        ),
        "count": invalid_numbers,
    })
    validation.append({
        "check": "Value ranges", "level": "warn" if out_of_range else "ok",
        "detail": (
            f"{plural(out_of_range, 'out-of-range value')} set to missing ({', '.join(out_of_range_cols)})."
            if out_of_range else "Percentages are within 0–100, counts are non-negative, NDVI is within −1 to 1."
        ),
        "count": out_of_range,
    })
    validation.append(missing_values_check(records, header, invalid_numbers + out_of_range))
    validation.extend(consistency_checks(records, header))
    validation.append(continuity_check(records))

    if not missing_core and not records:
        validation.append({
            "check": "Usable rows", "level": "error",
            "detail": "No usable rows remain after validation. The file cannot be used.", "count": 0,
        })

    dates = sorted(r["week_start"] for r in records)
    return {
        "header": header,
        "records": records,
        "summary": {
            "id": inp["id"],
            "name": inp["name"],
            "accepted": len(missing_core) == 0 and len(records) > 0,
            "columns": header,
            "missingOptionalColumns": missing_optional,
            "districts": sorted({r["district"] for r in records}),
            "period": {"start": dates[0] if dates else None, "end": dates[-1] if dates else None},
            "cleaning": {
                "rowsRead": len(body),
                "rowsKept": len(records),
                "droppedInvalidKey": dropped_invalid_key,
                "droppedDuplicate": dropped_duplicate,
                "droppedUnknownDistrict": dropped_unknown,
                "droppedOutsideScope": dropped_outside,
                "valuesSetToNull": invalid_numbers + out_of_range,
            },
            "validation": validation,
        },
    }


def missing_values_check(records: list[dict], supplied: list[str], nulled: int) -> dict:
    empty = 0
    for rec in records:
        for c in NUMERIC_COLUMNS:
            if c in supplied and rec[c] is None:
                empty += 1
    return {
        "check": "Missing values", "level": "warn" if empty else "ok",
        "detail": (
            f"{plural(empty, 'cell')} missing after cleaning ({nulled} set to missing by validation). "
            "Missing values are excluded from calculations, never filled in."
            if empty else "No missing values in the supplied columns."
        ),
        "count": empty,
    }


def consistency_checks(records: list[dict], supplied: list[str]) -> list[dict]:
    out: list[dict] = []

    def has(*cols):
        return all(c in supplied for c in cols)

    logical = [
        ("tested ≤ suspected", ["tested_cases", "suspected_malaria_cases"],
         lambda r: cmp(r["tested_cases"], r["suspected_malaria_cases"])),
        ("confirmed ≤ tested", ["confirmed_malaria_cases", "tested_cases"],
         lambda r: cmp(r["confirmed_malaria_cases"], r["tested_cases"])),
        ("facilities reporting ≤ expected", ["facilities_reporting", "facilities_expected"],
         lambda r: cmp(r["facilities_reporting"], r["facilities_expected"])),
    ]
    for label, cols, fn in logical:
        if not has(*cols):
            continue
        bad = len([r for r in records if fn(r) is False])
        out.append({
            "check": f"Logic: {label}", "level": "warn" if bad else "ok",
            "detail": (
                f"{plural(bad, 'row')} break this rule; values kept but should be checked at source."
                if bad else "Holds for every row."
            ),
            "count": bad,
        })

    def change_calc(r, _i, _rs):
        c = r["confirmed_malaria_cases"]
        a = r["confirmed_cases_4wk_avg"]
        return ((c - a) / a) * 100 if c is not None and a else None

    derived = [
        {
            "check": "positive_tests_pct = confirmed ÷ tested",
            "cols": ["positive_tests_pct", "confirmed_malaria_cases", "tested_cases"],
            "tol": 0.05, "unit": " pp",
            "note": "Single district-weeks show the file's value; combined figures are recomputed from counts.",
            "file": lambda r: r["positive_tests_pct"],
            "calc": lambda r, i, rs: ratio(r["confirmed_malaria_cases"], r["tested_cases"], 100),
        },
        {
            "check": "testing_rate_pct = tested ÷ suspected",
            "cols": ["testing_rate_pct", "tested_cases", "suspected_malaria_cases"],
            "tol": 0.05, "unit": " pp", "note": "",
            "file": lambda r: r["testing_rate_pct"],
            "calc": lambda r, i, rs: ratio(r["tested_cases"], r["suspected_malaria_cases"], 100),
        },
        {
            "check": "incidence_per_1000 = confirmed ÷ population × 1,000",
            "cols": ["incidence_per_1000", "confirmed_malaria_cases", "population_at_risk"],
            "tol": 0.001, "unit": "", "note": "",
            "file": lambda r: r["incidence_per_1000"],
            "calc": lambda r, i, rs: ratio(r["confirmed_malaria_cases"], r["population_at_risk"], 1000),
        },
        {
            "check": "confirmed_cases_4wk_avg = trailing 4-week mean (incl. current week)",
            "cols": ["confirmed_cases_4wk_avg", "confirmed_malaria_cases"],
            "tol": 0.05, "unit": "",
            "note": "The early-warning baseline uses the 4 weeks before the current week instead, so a rise is not averaged into its own baseline.",
            "file": lambda r: r["confirmed_cases_4wk_avg"],
            "calc": lambda r, i, rs: trailing_mean(rs, i, lambda x: x["confirmed_malaria_cases"]),
        },
        {
            "check": "cases_change_vs_4wk_avg_pct matches the 4-week average column",
            "cols": ["cases_change_vs_4wk_avg_pct", "confirmed_cases_4wk_avg", "confirmed_malaria_cases"],
            "tol": 0.05, "unit": " pp", "note": "",
            "file": lambda r: r["cases_change_vs_4wk_avg_pct"],
            "calc": change_calc,
        },
    ]

    by_district = group_by(records, lambda r: r["district"])
    for d in derived:
        if not has(*d["cols"]):
            continue
        compared = 0
        bad = 0
        worst = 0
        for rs in by_district.values():
            for i, r in enumerate(rs):
                f = d["file"](r)
                c = d["calc"](r, i, rs)
                if f is None or c is None:
                    continue
                compared += 1
                diff = abs(f - c)
                if diff > d["tol"] + 1e-9:
                    bad += 1
                    if diff > worst:
                        worst = diff
        if bad:
            detail = (
                f"{bad} of {compared} rows differ by more than {js_str(d['tol'])}{d['unit']} "
                f"(largest {fmt(rnd(worst, 3), 3)}{d['unit']}). {d['note']}"
            ).strip()
        else:
            detail = f"Consistent in all {compared} comparable rows." + (" " + d["note"] if d["note"] else "")
        out.append({"check": f"Derived: {d['check']}", "level": "warn" if bad else "ok", "detail": detail, "count": bad})
    return out


def continuity_check(records: list[dict]) -> dict:
    gaps = 0
    irregular = 0
    for rs in group_by(records, lambda r: r["district"]).values():
        for i in range(1, len(rs)):
            days = days_between(rs[i - 1]["week_start"], rs[i]["week_start"])
            if days % 7 != 0:
                irregular += 1
            elif days > 7:
                gaps += days // 7 - 1
    bad = gaps + irregular
    return {
        "check": "Weekly continuity", "level": "warn" if bad else "ok",
        "detail": (
            f"{plural(gaps, 'missing week')} and {plural(irregular, 'irregular interval')} between consecutive district records."
            if bad else "Each district has one record every 7 days with no gaps."
        ),
        "count": bad,
    }


# --------------------------------------------------------------------------- combine uploads
def combine(datasets: list[dict]) -> dict:
    validated = [validate_dataset(d) for d in datasets]
    merged: dict = {}
    superseded: dict = {}
    overlaps = 0
    supplied: list[str] = []
    for v in validated:
        if not v["summary"]["accepted"]:
            continue
        for h in v["header"]:
            if h in COLUMNS and h not in supplied:
                supplied.append(h)
        for rec in v["records"]:
            key = f"{rec['district']}|{rec['week_start']}"
            prev = merged.get(key)
            if prev:
                overlaps += 1
                superseded[prev["source"]] = superseded.get(prev["source"], 0) + 1
            merged[key] = {"rec": rec, "source": v["summary"]["id"]}
    records = sorted((m["rec"] for m in merged.values()), key=district_week_key)
    accepted = len([v for v in validated if v["summary"]["accepted"]])
    nulled = add(v["summary"]["cleaning"]["valuesSetToNull"] if v["summary"]["accepted"] else 0 for v in validated)

    validation = [
        {
            "check": "Datasets", "level": "ok" if accepted else "warn",
            "detail": (
                f"{plural(accepted, 'dataset')} combined into {plural(len(records), 'district-week record')}."
                if accepted else "No usable dataset has been imported."
            ),
            "count": accepted,
        },
        {
            "check": "Overlapping uploads", "level": "ok",
            "detail": (
                f"{plural(overlaps, 'district-week')} supplied again by a later upload; the most recent upload is used."
                if overlaps else "No district-week is supplied by more than one dataset."
            ),
            "count": overlaps,
        },
        missing_values_check(records, supplied, nulled),
        *consistency_checks(records, supplied),
        continuity_check(records),
    ]
    return {
        "records": records,
        "supplied": supplied,
        "validation": validation,
        "sources": [{**v["summary"], "superseded": superseded.get(v["summary"]["id"], 0)} for v in validated],
    }


# --------------------------------------------------------------------------- scopes
def scope_option(level: str, name: str, with_data: set) -> dict:
    if level == "national":
        return {"id": "national", "label": "National", "level": level, "province": None, "hasData": len(with_data) > 0}
    if level == "province":
        return {
            "id": f"province:{name}", "label": province_label(name), "level": level, "province": name,
            "hasData": any(d["province"] == name and d["district"] in with_data for d in DISTRICTS),
        }
    return {"id": f"district:{name}", "label": name, "level": level, "province": province_of(name),
            "hasData": name in with_data}


def scope_options(records: list[dict]) -> list[dict]:
    with_data = {r["district"] for r in records}
    out = [scope_option("national", "", with_data)]
    out += [scope_option("province", p, with_data) for p in PROVINCES]
    for p in PROVINCES:
        out += [scope_option("district", d["district"], with_data) for d in DISTRICTS if d["province"] == p]
    return out


def resolve_scope(records: list[dict], raw: Optional[str]) -> dict:
    opts = scope_options(records)
    v = (raw or "").strip().lower()
    direct = next((o for o in opts if o["id"].lower() == v), None)
    if direct:
        return direct
    bare = next((
        o for o in opts
        if o["level"] != "national"
        and (o["label"].lower() == v or ((o["province"] or "").lower() == v and o["level"] == "province"))
    ), None)
    return bare or opts[0]


def districts_of(scope: dict) -> list[str]:
    if scope["level"] == "national":
        return [d["district"] for d in DISTRICTS]
    if scope["level"] == "province":
        return [d["district"] for d in DISTRICTS if d["province"] == scope["province"]]
    return [scope["label"]]


def place_of(scope: dict) -> str:
    if scope["level"] == "national":
        return "across reporting districts nationally"
    if scope["level"] == "province":
        return f"across reporting districts in {scope['label']}"
    return f"in {scope['label']}"


# --------------------------------------------------------------------------- aggregation
SERIES_FIELDS = [
    ("population", "population_at_risk", "sum"),
    ("suspected", "suspected_malaria_cases", "sum"),
    ("tested", "tested_cases", "sum"),
    ("confirmed", "confirmed_malaria_cases", "sum"),
    ("severe", "severe_malaria_cases", "sum"),
    ("deaths", "malaria_deaths", "sum"),
    ("admissions", "malaria_admissions", "sum"),
    ("outpatient", "outpatient_visits", "sum"),
    ("facilities_expected", "facilities_expected", "sum"),
    ("facilities_reporting", "facilities_reporting", "sum"),
    ("stockout_days", "stockout_days", "sum"),
    ("rainfall_mm", "rainfall_mm", "mean"),
    ("rainfall_4wk_avg", "rainfall_4wk_avg", "mean"),
    ("temperature_c", "mean_temperature_c", "mean"),
    ("humidity_pct", "relative_humidity_pct", "mean"),
    ("ndvi", "ndvi", "mean"),
    ("mosquito_density", "mosquito_density_index", "mean"),
    ("larval_density", "larval_density_index", "mean"),
    ("mobility_index", "human_mobility_index", "mean"),
    ("reporting_completeness_pct", "reporting_completeness_pct", "mean"),
    ("reporting_delay_days", "reporting_delay_days", "mean"),
    ("act_stock_days", "act_stock_days", "mean"),
    ("rdt_stock_days", "rdt_stock_days", "mean"),
    ("bed_occupancy_pct", "bed_occupancy_pct", "mean"),
    ("bed_net_coverage_pct", "bed_net_coverage_pct", "mean"),
    ("irs_pct", "indoor_residual_spraying_pct", "mean"),
]


def build_series(records: list[dict], districts: list[str]) -> list[dict]:
    single = len(districts) == 1
    by_week = group_by([r for r in records if r["district"] in districts], lambda r: r["week_start"])
    points: list[dict] = []
    for w in sorted(by_week.keys()):
        rs = by_week[w]
        p: dict[str, Any] = {
            "week_start": w,
            "epi_week": rs[0]["epidemiological_week"],
            "districts_reporting": len(rs),
            "districts_expected": len(districts),
            "complete": len(rs) == len(districts),
        }
        for out, col, agg in SERIES_FIELDS:
            vals = [r[col] for r in rs]
            nn = non_null(vals)
            if agg == "sum":
                v = add(nn) if len(nn) == len(vals) else None
            else:
                v = mean(nn)
            p[out] = rs[0][col] if single else rnd_n(v, 2)

        if single:
            r = rs[0]
            p["positivity_pct"] = r["positive_tests_pct"]
            p["testing_rate_pct"] = r["testing_rate_pct"]
            p["incidence_per_1000"] = r["incidence_per_1000"]
            p["file_alert_label"] = r["alert_label"]
        else:
            p["positivity_pct"] = rnd_n(ratio(p["confirmed"], p["tested"], 100), 2)
            p["testing_rate_pct"] = rnd_n(ratio(p["tested"], p["suspected"], 100), 2)
            p["incidence_per_1000"] = rnd_n(ratio(p["confirmed"], p["population"], 1000), 3)
            labels = [r["alert_label"] for r in rs]
            p["file_alert_label"] = add(labels) if all(x is not None for x in labels) else None
        p["opd_malaria_share_pct"] = rnd_n(ratio(p["confirmed"], p["outpatient"], 100), 2)
        p["severe_pct_of_confirmed"] = rnd_n(ratio(p["severe"], p["confirmed"], 100), 2)
        points.append(p)
    return points


# --------------------------------------------------------------------------- features
def prev_window(points: list[dict], i: int, n: int, key: str) -> Optional[list]:
    if i < n:
        return None
    win = points[i - n: i]
    if not all(p["complete"] for p in win):
        return None
    vals = [x[key] for x in win]
    return vals if all(v is not None for v in vals) else None


def add_features(points: list[dict]) -> None:
    for i, p in enumerate(points):
        p["cases_ma4"] = rnd_n(trailing_mean(points, i, lambda x: x["confirmed"]), 2)
        ok = p["complete"]

        prev4 = prev_window(points, i, 4, "confirmed") if ok else None
        b = mean(prev4) if prev4 else None
        p["baseline_prev4"] = rnd_n(b, 2)
        p["change_vs_baseline_pct"] = (
            rnd(((p["confirmed"] - b) / b) * 100, 1)
            if b is not None and b > 0 and p["confirmed"] is not None else None
        )

        prev8 = prev_window(points, i, 8, "confirmed") if ok else None
        m8 = mean(prev8) if prev8 else None
        sd8 = sample_sd(prev8) if prev8 else None
        p["baseline_prev8_mean"] = rnd_n(m8, 2)
        p["baseline_prev8_sd"] = rnd_n(sd8, 2)
        p["z_prev8"] = (
            rnd((p["confirmed"] - m8) / sd8, 2)
            if m8 is not None and sd8 is not None and sd8 > 0 and p["confirmed"] is not None else None
        )

        pos4 = prev_window(points, i, 4, "positivity_pct") if ok else None
        pb = mean(pos4) if pos4 else None
        p["positivity_baseline_prev4"] = rnd_n(pb, 2)
        p["positivity_change_pp"] = (
            rnd(p["positivity_pct"] - pb, 2) if pb is not None and p["positivity_pct"] is not None else None
        )

        sev4 = prev_window(points, i, 4, "severe") if ok else None
        p["severe_baseline_prev4"] = rnd(mean(sev4), 2) if sev4 else None


# --------------------------------------------------------------------------- signals
CASE_SIGNALS = ("cases_above_baseline", "unusual_increase")


def period_refs(points: list[dict]) -> dict:
    def m(key):
        return rnd_n(mean(non_null(p[key] for p in points)), 2)
    return {
        "rainfall_4wk_avg": m("rainfall_4wk_avg"),
        "mosquito_density": m("mosquito_density"),
        "larval_density": m("larval_density"),
    }


def item(key: str, label: str, detail: str) -> dict:
    return {"key": key, "label": label, "detail": detail}


def evaluate_signal(p: dict, place: str, refs: dict) -> dict:
    signals: list[dict] = []
    observations: list[dict] = []
    context: list[dict] = []
    quality: list[dict] = []

    if p["change_vs_baseline_pct"] is not None and p["change_vs_baseline_pct"] >= CASE_DEVIATION_PCT:
        signals.append(item(
            "cases_above_baseline", "Cases above recent baseline",
            f"Confirmed malaria cases ({fmt(p['confirmed'])}) are {fmt(p['change_vs_baseline_pct'], 1)}% above "
            f"the previous 4-week average ({fmt(p['baseline_prev4'], 1)}) {place}.",
        ))
    if p["z_prev8"] is not None and p["z_prev8"] >= Z_THRESHOLD:
        signals.append(item(
            "unusual_increase", "Unusual increase",
            f"{fmt(p['confirmed'])} confirmed cases is {fmt(p['z_prev8'], 2)} standard deviations above the "
            f"previous 8 weeks (mean {fmt(p['baseline_prev8_mean'], 1)}, SD {fmt(p['baseline_prev8_sd'], 1)}).",
        ))
    if p["positivity_change_pp"] is not None and p["positivity_change_pp"] >= POSITIVITY_RISE_PP:
        signals.append(item(
            "positivity_increased", "Positivity increased",
            f"Test positivity was {fmt(p['positivity_pct'], 2)}%, {fmt(p['positivity_change_pp'], 2)} percentage "
            f"points above the previous 4-week average ({fmt(p['positivity_baseline_prev4'], 2)}%).",
        ))
    sb = p["severe_baseline_prev4"]
    if (
        p["severe"] is not None and sb is not None
        and p["severe"] >= SEVERE_RATIO * sb and p["severe"] - sb >= SEVERE_MIN_EXCESS
    ):
        signals.append(item(
            "severe_above_baseline", "Severe cases above recent baseline",
            f"{fmt(p['severe'])} severe malaria cases, against a previous 4-week average of {fmt(sb, 1)}.",
        ))

    if p["deaths"] is not None and p["deaths"] > 0:
        observations.append(item(
            "deaths_recorded", "Malaria deaths recorded",
            f"{plural(p['deaths'], 'malaria death')} recorded this week. Requires verification through death review.",
        ))

    case_based = any(s["key"] in CASE_SIGNALS for s in signals)
    if not case_based and signals:
        observations[0:0] = [{**s, "label": f"{s['label']} (no case-based signal)"} for s in signals]
        signals = []
    if not p["complete"] or p["baseline_prev4"] is None:
        level = "INSUFFICIENT"
    elif not case_based:
        level = "NONE"
    elif len(signals) >= 2:
        level = "ELEVATED"
    else:
        level = "WATCH"

    if level in ("ELEVATED", "WATCH"):
        def above(v, ref):
            if v is not None and ref is not None and ref > 0 and v >= ref * (1 + CONTEXT_ABOVE_PCT / 100):
                return rnd(((v - ref) / ref) * 100, 1)
            return None

        rain = above(p["rainfall_4wk_avg"], refs["rainfall_4wk_avg"])
        if rain is not None:
            context.append(item(
                "rainfall_elevated", "Rainfall elevated",
                f"Rainfall over the past 4 weeks averaged {fmt(p['rainfall_4wk_avg'], 1)} mm/week, {fmt(rain, 1)}% "
                f"above the dataset-period average ({fmt(refs['rainfall_4wk_avg'], 1)} mm/week).",
            ))
        mosq = above(p["mosquito_density"], refs["mosquito_density"])
        if mosq is not None:
            context.append(item(
                "mosquito_density_elevated", "Mosquito density elevated",
                f"Mosquito density index {fmt(p['mosquito_density'], 2)}, {fmt(mosq, 1)}% above the "
                f"dataset-period average ({fmt(refs['mosquito_density'], 2)}).",
            ))
        larv = above(p["larval_density"], refs["larval_density"])
        if larv is not None:
            context.append(item(
                "larval_density_elevated", "Larval density elevated",
                f"Larval density index {fmt(p['larval_density'], 2)}, {fmt(larv, 1)}% above the "
                f"dataset-period average ({fmt(refs['larval_density'], 2)}).",
            ))

    if not p["complete"]:
        quality.append(item(
            "incomplete_week", "Incomplete district reporting",
            f"{p['districts_reporting']} of {p['districts_expected']} districts reported this week, so early-warning "
            "rules were not applied to the combined figures.",
        ))
    comp = p["reporting_completeness_pct"]
    if comp is None:
        quality.append(item(
            "completeness_missing", "Reporting completeness not recorded",
            "The completeness of reporting for this week is unknown; interpret with caution.",
        ))
    elif comp < COMPLETENESS_MIN_PCT:
        quality.append(item(
            "completeness_low", "Low reporting completeness",
            f"Reporting completeness was {fmt(comp, 1)}% (below {COMPLETENESS_MIN_PCT}%). Interpret with caution: "
            "missing reports can distort the signal.",
        ))
    else:
        quality.append(item(
            "completeness_sufficient", "Reporting completeness sufficient",
            f"{fmt(comp, 1)}% of expected reports were received.",
        ))
    if p["reporting_delay_days"] is not None and p["reporting_delay_days"] > DELAY_MAX_DAYS:
        quality.append(item(
            "reporting_delay", "Reporting delays",
            f"Reports arrived on average {fmt(p['reporting_delay_days'], 1)} days late (more than {DELAY_MAX_DAYS}).",
        ))
    if (
        p["facilities_reporting"] is not None and p["facilities_expected"] is not None
        and p["facilities_reporting"] < p["facilities_expected"]
    ):
        quality.append(item(
            "facilities_missing", "Not all facilities reported",
            f"{fmt(p['facilities_reporting'])} of {fmt(p['facilities_expected'])} expected facilities reported.",
        ))

    return {"level": level, "signals": signals, "observations": observations, "context": context, "quality": quality}


def series_for(records: list[dict], districts: list[str], place: str) -> list[dict]:
    points = build_series(records, districts)
    add_features(points)
    refs = period_refs(points)
    for p in points:
        p["signal"] = evaluate_signal(p, place, refs)
    return points


# --------------------------------------------------------------------------- alerts
def build_alerts(district: str, points: list[dict]) -> list[dict]:
    last = points[-1]["week_start"] if points else None
    out: list[dict] = []
    for p in points:
        s = p["signal"]
        if s["level"] not in ("ELEVATED", "WATCH"):
            continue
        wk = p["week_start"] if p["epi_week"] is None else f"epi week {js_str(p['epi_week'])}"
        headline = (
            f"Elevated signal — {district}, {wk}" if s["level"] == "ELEVATED"
            else f"Increased surveillance attention — {district}, {wk}"
        )

        def has(k):
            return any(x["key"] == k for x in s["signals"])

        if has("cases_above_baseline"):
            lead = f"Confirmed malaria cases are {fmt(p['change_vs_baseline_pct'], 1)}% above the recent 4-week average in {district}."
        else:
            lead = (
                f"An unusual increase in confirmed malaria cases was observed in {district} "
                f"({fmt(p['z_prev8'], 2)} SD above the previous 8 weeks)."
            )
        if has("unusual_increase") and any(c["key"] == "rainfall_elevated" for c in s["context"]):
            lead += " The unusual increase coincides with elevated rainfall."
        summary = f"{lead} Requires verification by the district health team."

        verify = [
            f"Check facility registers for the week of {p['week_start']} to confirm the reported counts "
            f"({fmt(p['confirmed'])} confirmed, {fmt(p['tested'])} tested).",
        ]
        if p["reporting_completeness_pct"] is not None:
            verify.append(
                f"Confirm whether late or missing reports change the picture (completeness "
                f"{fmt(p['reporting_completeness_pct'], 1)}%, {fmt(p['facilities_reporting'])} of "
                f"{fmt(p['facilities_expected'])} facilities reported)."
            )
        if has("positivity_increased"):
            verify.append(
                f"Review testing practice for the week (positivity {fmt(p['positivity_pct'], 2)}%, "
                f"testing rate {fmt(p['testing_rate_pct'], 2)}%)."
            )
        if p["act_stock_days"] is not None or p["rdt_stock_days"] is not None:
            stock = f", {plural(p['stockout_days'], 'stockout day')} recorded" if p["stockout_days"] else ""
            verify.append(
                f"Check case-management stock: ACT {fmt(p['act_stock_days'])} days, RDT {fmt(p['rdt_stock_days'])} days{stock}."
            )
        verify.append("Decide with the district team whether field investigation or a response is needed.")

        out.append({
            "id": f"{district}-{p['week_start']}",
            "district": district,
            "province": province_of(district),
            "week_start": p["week_start"],
            "epi_week": p["epi_week"],
            "level": s["level"],
            "headline": headline,
            "summary": summary,
            "signals": s["signals"],
            "observations": s["observations"],
            "context": s["context"],
            "quality": s["quality"],
            "verify": verify,
            "isLatestWeek": p["week_start"] == last,
            "file_alert_label": p["file_alert_label"],
        })
    return out


# --------------------------------------------------------------------------- totals
def totals_for(points: list[dict]) -> dict:
    missing: dict[str, int] = {}

    def sum_of(name: str, key: str):
        vals = [p[key] for p in points]
        nn = non_null(vals)
        missing[name] = len(vals) - len(nn)
        return rnd(add(nn), 2) if nn else None

    def pair_ratio(ka: str, kb: str, scale: float):
        sa = 0
        sb = 0
        n = 0
        for p in points:
            x = p[ka]
            y = p[kb]
            if x is None or y is None:
                continue
            sa += x
            sb += y
            n += 1
        return rnd((sa / sb) * scale, 2) if n and sb > 0 else None

    pop_mean = mean(non_null(p["population"] for p in points))
    out: dict[str, Any] = {
        "weeks": len(points),
        "partial_weeks": len([p for p in points if not p["complete"]]),
    }
    out["suspected"] = sum_of("suspected", "suspected")
    out["tested"] = sum_of("tested", "tested")
    confirmed = sum_of("confirmed", "confirmed")
    out["confirmed"] = confirmed
    out["severe"] = sum_of("severe", "severe")
    out["deaths"] = sum_of("deaths", "deaths")
    out["admissions"] = sum_of("admissions", "admissions")
    out["outpatient"] = sum_of("outpatient", "outpatient")
    out["positivity_pct"] = pair_ratio("confirmed", "tested", 100)
    out["testing_rate_pct"] = pair_ratio("tested", "suspected", 100)
    out["incidence_per_1000"] = rnd((confirmed / pop_mean) * 1000, 2) if confirmed is not None and pop_mean else None
    out["severe_pct_of_confirmed"] = pair_ratio("severe", "confirmed", 100)
    out["deaths_per_1000_confirmed"] = pair_ratio("deaths", "confirmed", 1000)
    out["admissions_per_100_confirmed"] = pair_ratio("admissions", "confirmed", 100)
    out["opd_malaria_share_pct"] = pair_ratio("confirmed", "outpatient", 100)
    out["stockout_days"] = sum_of("stockout_days", "stockout_days")
    out["missing_weeks"] = missing
    return out


# --------------------------------------------------------------------------- relationships
REL_VARS = [
    ("rainfall_mm", "Rainfall", "environment", "mm/week"),
    ("temperature_c", "Mean temperature", "environment", "°C"),
    ("humidity_pct", "Relative humidity", "environment", "%"),
    ("ndvi", "NDVI (vegetation)", "environment", "index"),
    ("mosquito_density", "Mosquito density", "environment", "index"),
    ("larval_density", "Larval density", "environment", "index"),
    ("mobility_index", "Human mobility", "environment", "index"),
    ("bed_net_coverage_pct", "Bed-net coverage", "prevention", "%"),
    ("irs_pct", "Indoor residual spraying", "prevention", "%"),
]


def pearson(xs: list, ys: list) -> Num:
    n = len(xs)
    if n < MIN_CORRELATION_PAIRS:
        return None
    mx = mean(xs)
    my = mean(ys)
    sxy = 0
    sxx = 0
    syy = 0
    for i in range(n):
        dx = xs[i] - mx
        dy = ys[i] - my
        sxy += dx * dy
        sxx += dx * dx
        syy += dy * dy
    if sxx == 0 or syy == 0:
        return None
    return sxy / math.sqrt(sxx * syy)


def relationships(points: list[dict]) -> list[dict]:
    out = []
    for key, label, group, unit in REL_VARS:
        lags = []
        for lag in range(0, MAX_LAG_WEEKS + 1):
            xs: list = []
            ys: list = []
            for i in range(lag, len(points)):
                x = points[i - lag][key]
                y = points[i]["confirmed"]
                if x is None or y is None:
                    continue
                xs.append(x)
                ys.append(y)
            lags.append({"lag": lag, "r": rnd_n(pearson(xs, ys), 3), "n": len(xs)})
        best = None
        for l in lags:
            if l["r"] is None:
                continue
            if best is None or abs(l["r"]) > abs(best["r"]):
                best = {"lag": l["lag"], "r": l["r"], "n": l["n"]}
        a = abs(best["r"]) if best else 0
        strength = "insufficient" if not best else "strong" if a >= 0.5 else "moderate" if a >= 0.3 else "weak"
        out.append({"variable": key, "label": label, "group": group, "unit": unit, "lags": lags, "best": best,
                    "strength": strength})
    return out


# --------------------------------------------------------------------------- per-district status & prioritisation
LEVEL_RANK = {"ELEVATED": 0, "WATCH": 1, "NONE": 2, "INSUFFICIENT": 3}


def recent_indicators(s: list[dict]) -> dict:
    last4 = s[-4:]
    last = s[-1] if s else None
    conf = [p["confirmed"] for p in last4]
    tested = [p["tested"] for p in last4]
    incidence = (
        rnd((add(conf) / last["population"]) * 1000, 2)
        if len(last4) == 4 and all(x is not None for x in conf) and last and last["population"] else None
    )
    positivity = (
        rnd((add(conf) / add(tested)) * 100, 2)
        if len(last4) == 4 and all(x is not None for x in conf) and all(x is not None for x in tested)
        and add(tested) > 0 else None
    )
    stockout = non_null(p["stockout_days"] for p in last4)
    return {"last": last, "incidence": incidence, "positivity": positivity,
            "stockout_recent": add(stockout) if stockout else None}


def prioritisation(per_district: dict) -> list[dict]:
    rows = []
    for district, s in per_district.items():
        ri = recent_indicators(s)
        last = ri["last"]
        level = last["signal"]["level"] if last else "INSUFFICIENT"
        pts: list[str] = []
        if level == "ELEVATED":
            pts.append("Elevated signal in the latest week")
        if level == "WATCH":
            pts.append("Watch signal in the latest week")
        if last and last["bed_net_coverage_pct"] is not None and last["bed_net_coverage_pct"] < NET_COVERAGE_REVIEW_PCT:
            pts.append(f"Bed-net coverage {fmt(last['bed_net_coverage_pct'], 1)}% (below {NET_COVERAGE_REVIEW_PCT}%)")
        if last and last["irs_pct"] is not None and last["irs_pct"] < IRS_COVERAGE_REVIEW_PCT:
            pts.append(f"IRS coverage {fmt(last['irs_pct'], 1)}% (below {IRS_COVERAGE_REVIEW_PCT}%)")
        if last and last["act_stock_days"] is not None and last["act_stock_days"] < STOCK_REVIEW_DAYS:
            pts.append(f"ACT stock {fmt(last['act_stock_days'])} days (below {STOCK_REVIEW_DAYS})")
        if last and last["rdt_stock_days"] is not None and last["rdt_stock_days"] < STOCK_REVIEW_DAYS:
            pts.append(f"RDT stock {fmt(last['rdt_stock_days'])} days (below {STOCK_REVIEW_DAYS})")
        if ri["stockout_recent"]:
            pts.append(f"{plural(ri['stockout_recent'], 'stockout day')} in the last 4 weeks")
        if (last and last["reporting_completeness_pct"] is not None
                and last["reporting_completeness_pct"] < COMPLETENESS_MIN_PCT):
            pts.append(
                f"Reporting completeness {fmt(last['reporting_completeness_pct'], 1)}% (below {COMPLETENESS_MIN_PCT}%)"
            )
        rows.append({
            "rank": 0,
            "district": district,
            "province": province_of(district),
            "level": level,
            "recent_incidence_per_1000": ri["incidence"],
            "recent_positivity_pct": ri["positivity"],
            "bed_net_coverage_pct": last["bed_net_coverage_pct"] if last else None,
            "irs_pct": last["irs_pct"] if last else None,
            "act_stock_days": last["act_stock_days"] if last else None,
            "rdt_stock_days": last["rdt_stock_days"] if last else None,
            "review_points": pts,
        })

    def order(a, b):
        if LEVEL_RANK[a["level"]] != LEVEL_RANK[b["level"]]:
            return LEVEL_RANK[a["level"]] - LEVEL_RANK[b["level"]]
        ia = a["recent_incidence_per_1000"]
        ib = b["recent_incidence_per_1000"]
        if ia != ib:
            if ia is None:
                return 1
            if ib is None:
                return -1
            return -1 if ib - ia < 0 else (1 if ib - ia > 0 else 0)
        return -1 if a["district"] < b["district"] else (1 if a["district"] > b["district"] else 0)

    rows.sort(key=cmp_to_key(order))
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    return rows


def district_statuses(districts: list[str], per_district: dict, alerts: list[dict], today: str) -> list[dict]:
    out = []
    for d in districts:
        s = per_district.get(d)
        if not s:
            out.append({
                "district": d, "province": province_of(d), "hasData": False, "weeks": 0,
                "first_week": None, "latest_week": None, "days_since_latest": None, "stale": False,
                "latest_confirmed": None, "latest_change_vs_baseline_pct": None, "latest_level": None,
                "recent_incidence_per_1000": None, "recent_positivity_pct": None,
                "mean_reporting_completeness_pct": None, "alerts": 0, "totals": None,
            })
            continue
        ri = recent_indicators(s)
        last = ri["last"]
        since = days_between(last["week_start"], today)
        out.append({
            "district": d,
            "province": province_of(d),
            "hasData": True,
            "weeks": len(s),
            "first_week": s[0]["week_start"],
            "latest_week": last["week_start"],
            "days_since_latest": since,
            "stale": since > STALE_AFTER_DAYS,
            "latest_confirmed": last["confirmed"],
            "latest_change_vs_baseline_pct": last["change_vs_baseline_pct"],
            "latest_level": last["signal"]["level"],
            "recent_incidence_per_1000": ri["incidence"],
            "recent_positivity_pct": ri["positivity"],
            "mean_reporting_completeness_pct": rnd_n(mean(non_null(p["reporting_completeness_pct"] for p in s)), 2),
            "alerts": len([a for a in alerts if a["district"] == d]),
            "totals": totals_for(s),
        })
    return out


# --------------------------------------------------------------------------- projection
def solve(A: list[list[float]], b: list[float]) -> Optional[list[float]]:
    n = len(b)
    M = [list(row) + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        piv = c
        for r in range(c + 1, n):
            if abs(M[r][c]) > abs(M[piv][c]):
                piv = r
        if abs(M[piv][c]) < 1e-12:
            return None
        if piv != c:
            M[c], M[piv] = M[piv], M[c]
        for r in range(c + 1, n):
            f = M[r][c] / M[c][c]
            for k in range(c, n + 1):
                M[r][k] -= f * M[c][k]
    x = [0.0] * n
    for r in range(n - 1, -1, -1):
        s = M[r][n]
        for k in range(r + 1, n):
            s -= M[r][k] * x[k]
        x[r] = s / M[r][r]
    return x


def fit_ridge(X: list[list[float]], y: list[float]):
    n = len(X)
    k = len(X[0])
    mu: list[float] = []
    sd: list[float] = []
    for j in range(k):
        col = [r[j] for r in X]
        m = mean(col)
        s = 0
        for v in col:
            s += (v - m) * (v - m)
        d = math.sqrt(s / n)
        mu.append(m)
        sd.append(d if d > 0 else 1)
    ym = mean(y)
    Z = [[(v - mu[j]) / sd[j] for j, v in enumerate(r)] for r in X]
    A: list[list[float]] = []
    b: list[float] = []
    for i in range(k):
        row = []
        for j in range(k):
            s = 0
            for t in range(n):
                s += Z[t][i] * Z[t][j]
            row.append(s + FORECAST_RIDGE if i == j else s)
        A.append(row)
        s = 0
        for t in range(n):
            s += Z[t][i] * (y[t] - ym)
        b.append(s)
    beta = solve(A, b)
    if beta is None:
        return None

    def predict(x: list[float]) -> float:
        v = ym
        for j in range(k):
            v += beta[j] * ((x[j] - mu[j]) / sd[j])
        return 0 if v < 0 else v
    return predict


def projection(points: list[dict]) -> dict:
    n = len(points)

    def empty(reason: str) -> dict:
        return {"available": False, "reason": reason, "features": [], "origin_week": None, "horizons": []}

    if n < FORECAST_MIN_TRAIN + FORECAST_MIN_BACKTEST:
        return empty(f"Needs at least {FORECAST_MIN_TRAIN + FORECAST_MIN_BACKTEST} weeks of data.")
    if not all(p["complete"] and p["confirmed"] is not None for p in points):
        return empty("Needs a complete weekly case series (no missing or partially reported weeks).")
    for i in range(1, n):
        if days_between(points[i - 1]["week_start"], points[i]["week_start"]) != 7:
            return empty("Needs consecutive weeks with no gaps.")

    y = [p["confirmed"] for p in points]
    use_rain = all(p["rainfall_4wk_avg"] is not None for p in points)

    def feat(t: int) -> list[float]:
        return [y[t], y[t - 1], points[t]["rainfall_4wk_avg"]] if use_rain else [y[t], y[t - 1]]

    features = ["Confirmed cases in the latest week", "Confirmed cases the week before"]
    if use_rain:
        features.append("4-week average rainfall")

    def fit(h: int, origin: int):
        X = []
        Y = []
        t = 1
        while t + h <= origin:
            X.append(feat(t))
            Y.append(y[t + h])
            t += 1
        return fit_ridge(X, Y) if len(X) >= 8 else None

    last = n - 1
    horizons = []
    for h in range(1, FORECAST_MAX_H + 1):
        errs: list[float] = []
        naive: list[float] = []
        ape: list[float] = []
        o = FORECAST_MIN_TRAIN
        while o + h <= last:
            model = fit(h, o)
            if model:
                actual = y[o + h]
                e = actual - model(feat(o))
                errs.append(e)
                naive.append(abs(actual - y[o]))
                if actual > 0:
                    ape.append(abs(e) / actual)
            o += 1
        nb = len(errs)
        mae = mean([abs(e) for e in errs]) if nb else None
        naive_mae = mean(naive) if nb else None
        rmse = math.sqrt(mean([e * e for e in errs])) if nb else None
        skill = (1 - mae / naive_mae) * 100 if mae is not None and naive_mae else None
        model = fit(h, last)
        est = model(feat(last)) if model else None
        shown = est is not None and nb >= FORECAST_MIN_BACKTEST and skill is not None and skill > 0
        horizons.append({
            "h": h,
            "week_start": add_days(points[last]["week_start"], 7 * h),
            "estimate": None if est is None else rnd(est, 0),
            "lower": None if est is None or rmse is None else rnd(max(0, est - 1.96 * rmse), 0),
            "upper": None if est is None or rmse is None else rnd(est + 1.96 * rmse, 0),
            "shown": shown,
            "backtest": {
                "n": nb,
                "mae": rnd_n(mae, 1),
                "mape_pct": rnd(mean(ape) * 100, 1) if ape else None,
                "naive_mae": rnd_n(naive_mae, 1),
                "skill_pct": rnd_n(skill, 1),
            },
        })
    any_shown = any(h["shown"] for h in horizons)
    return {
        "available": any_shown,
        "reason": None if any_shown else (
            "The model did not outperform the naive estimate (next week = this week) in backtesting, "
            "so no projection is shown."
        ),
        "features": features,
        "origin_week": points[last]["week_start"],
        "horizons": horizons,
    }


# --------------------------------------------------------------------------- data quality
def quality_for(combined: dict, districts: list[str]) -> dict:
    rs = [r for r in combined["records"] if r["district"] in districts]
    dates = sorted(r["week_start"] for r in rs)
    weeks_per = {}
    for d in districts:
        n = len([r for r in rs if r["district"] == d])
        if n:
            weeks_per[d] = n
    missing_by_column = [
        {"column": c, "missing": len([r for r in rs if r[c] is None])}
        for c in NUMERIC_COLUMNS if c in combined["supplied"]
    ]
    comp = non_null(r["reporting_completeness_pct"] for r in rs)
    delay = non_null(r["reporting_delay_days"] for r in rs)
    latest_date = dates[-1] if dates else None
    latest = [r for r in rs if r["week_start"] == latest_date]

    def sum_latest(key: str):
        v = [r[key] for r in latest]
        return add(v) if v and all(x is not None for x in v) else None

    exp = sum_latest("facilities_expected")
    rep = sum_latest("facilities_reporting")
    return {
        "records": len(rs),
        "districts": list(weeks_per.keys()),
        "date_start": dates[0] if dates else None,
        "date_end": latest_date,
        "weeks_per_district": weeks_per,
        "missing_values_total": add(c["missing"] for c in missing_by_column),
        "missing_by_column": missing_by_column,
        "columns_not_supplied": [c for c in COLUMNS if c not in combined["supplied"]],
        "reporting_completeness": {
            "mean": rnd_n(mean(comp), 2),
            "min": min(comp) if comp else None,
            "weeks_below_90": len([x for x in comp if x < COMPLETENESS_MIN_PCT]),
        },
        "reporting_delay_days": {
            "mean": rnd_n(mean(delay), 2),
            "max": max(delay) if delay else None,
            "weeks_above_3": len([x for x in delay if x > DELAY_MAX_DAYS]),
        },
        "facilities": {
            "expected_latest": exp,
            "reporting_latest": rep,
            "reporting_rate_pct": rnd((rep / exp) * 100, 1) if exp and rep is not None else None,
        },
        "validation": combined["validation"],
    }


# --------------------------------------------------------------------------- method
METHOD = [
    {"key": "ingestion", "label": "Data ingestion",
     "rule": "Uploaded CSV files are validated, cleaned and combined. Required columns: week_start, district, confirmed_malaria_cases; other surveillance columns are optional. Rows for unrecognised districts are excluded. When two uploads supply the same district-week, the most recent upload is used. Missing values are excluded from calculations, never filled in."},
    {"key": "baseline", "label": "Recent baseline",
     "rule": "Average of confirmed cases in the 4 weeks before the current week (the current week is not included). Needs 4 earlier, fully reported weeks."},
    {"key": "cases_above_baseline", "label": "Cases above recent baseline",
     "rule": f"Confirmed cases are {CASE_DEVIATION_PCT}% or more above the recent baseline."},
    {"key": "unusual_increase", "label": "Unusual increase (anomaly)",
     "rule": f"Confirmed cases are {Z_THRESHOLD} or more standard deviations above the mean of the previous 8 weeks."},
    {"key": "positivity_increased", "label": "Positivity increased",
     "rule": f"Test positivity is {POSITIVITY_RISE_PP} or more percentage points above its previous 4-week average."},
    {"key": "severe_above_baseline", "label": "Severe cases above recent baseline",
     "rule": f"Severe cases are at least {SEVERE_RATIO}× and at least {SEVERE_MIN_EXCESS} cases above their previous 4-week average."},
    {"key": "level", "label": "Signal level",
     "rule": "A signal must include a case-based rule (cases above recent baseline, or unusual increase). Case-based rule plus at least one more rule → Elevated signal. One case-based rule alone → Watch (increased surveillance attention). Positivity or severe-case rises without a case-based rule are listed as observations, not alerts. Fewer than 4 earlier weeks, or incomplete district reporting → not evaluated."},
    {"key": "context", "label": "Environmental context",
     "rule": f"Shown only when a signal is present: 4-week rainfall, mosquito density or larval density {CONTEXT_ABOVE_PCT}% or more above its average over the data period. Context never raises the level on its own."},
    {"key": "quality", "label": "Data confidence",
     "rule": f"Reporting completeness below {COMPLETENESS_MIN_PCT}%, reporting delay above {DELAY_MAX_DAYS} days, facilities not reporting, or districts missing from a combined week are shown as cautions. Data is flagged as stale when no new week has been reported for more than {STALE_AFTER_DAYS} days."},
    {"key": "aggregation", "label": "Province and national figures",
     "rule": "Counts are summed over the districts that reported; positivity, testing rate and incidence are recomputed from the summed counts; environmental and health-system indices are averaged across districts. Districts with no uploaded data are not included and are shown as not reporting."},
    {"key": "relationships", "label": "Environmental and prevention relationships",
     "rule": f"Pearson correlation between confirmed cases and each variable 0–{MAX_LAG_WEEKS} weeks earlier. Association within the uploaded data only — not evidence of cause."},
    {"key": "prioritisation", "label": "Prevention prioritisation",
     "rule": f"Districts are ordered by latest signal level, then by incidence over the last 4 weeks. Review prompts list bed-net coverage below {NET_COVERAGE_REVIEW_PCT}%, IRS below {IRS_COVERAGE_REVIEW_PCT}%, ACT or RDT stock below {STOCK_REVIEW_DAYS} days, recent stockouts and low reporting completeness."},
    {"key": "projection", "label": "Short-term projection (model estimate)",
     "rule": f"Ridge regression on this week's and last week's confirmed cases and 4-week rainfall, one model per horizon (1–{FORECAST_MAX_H} weeks). Backtested with rolling origins after {FORECAST_MIN_TRAIN} weeks of history; a horizon is shown only if it has at least {FORECAST_MIN_BACKTEST} backtest points and beats the naive estimate (next week = this week). The range is ±1.96 × backtest RMSE. Estimates are not observations."},
]


# --------------------------------------------------------------------------- entry
def level_label(level: str) -> str:
    return {"ELEVATED": "Elevated signal", "WATCH": "Watch", "NONE": "No signal"}.get(level, "Not evaluated")


def _alert_cmp(a: dict, b: dict) -> int:
    if a["week_start"] == b["week_start"]:
        return -1 if a["district"] < b["district"] else 1
    return 1 if a["week_start"] < b["week_start"] else -1


def analyze(combined: dict, scope_raw: Optional[str], today: str) -> dict:
    records = combined["records"]
    scope = resolve_scope(records, scope_raw)
    with_data = {r["district"] for r in records}
    in_scope = districts_of(scope)
    data_districts = [d for d in in_scope if d in with_data]
    place = place_of(scope)

    weekly = series_for(records, data_districts, place) if data_districts else []
    per_district = {d: series_for(records, [d], f"in {d}") for d in data_districts}
    latest = weekly[-1] if weekly else None

    alerts: list[dict] = []
    for d in data_districts:
        alerts.extend(build_alerts(d, per_district[d]))
    alerts.sort(key=cmp_to_key(_alert_cmp))

    quality = quality_for(combined, data_districts)
    districts = district_statuses(in_scope, per_district, alerts, today)
    by_province = []
    for p in PROVINCES:
        ds = [d for d in DISTRICTS if d["province"] == p and d["district"] in in_scope]
        if ds:
            by_province.append({"province": p, "districts_total": len(ds),
                                "districts_with_data": len([d for d in ds if d["district"] in with_data])})
    coverage = {
        "districts_total": len(in_scope),
        "districts_with_data": len(data_districts),
        "districts_reporting_latest_week": latest["districts_reporting"] if latest else 0,
        "by_province": by_province,
    }
    since = days_between(latest["week_start"], today) if latest else None

    counts = {"ELEVATED": 0, "WATCH": 0}
    for p in weekly:
        if p["signal"]["level"] in counts:
            counts[p["signal"]["level"]] += 1
    accepted = [s for s in combined["sources"] if s["accepted"]]
    errors = len([v for v in combined["validation"] if v["level"] == "error"])
    warnings = len([v for v in combined["validation"] if v["level"] == "warn"])
    z_scored = [p for p in weekly if p["z_prev8"] is not None]
    forecast = projection(weekly)

    pipeline = [
        {"stage": "Data ingestion",
         "detail": f"{plural(len(accepted), 'dataset')} · {add(s['cleaning']['rowsRead'] for s in accepted)} rows uploaded"},
        {"stage": "Data validation",
         "detail": f"{len(combined['validation'])} checks on the combined data · {plural(errors, 'error')}, {plural(warnings, 'warning')}"},
        {"stage": "Data cleaning",
         "detail": f"{plural(len(records), 'district-week record')} kept · "
                   f"{add(s['cleaning']['rowsRead'] - s['cleaning']['rowsKept'] for s in accepted)} rows excluded · "
                   f"{add(s['cleaning']['valuesSetToNull'] for s in accepted)} values set to missing"},
        {"stage": "Feature preparation",
         "detail": f"{plural(len(weekly), 'weekly point')} for {scope['label']} from "
                   f"{plural(len(data_districts), 'reporting district')} · rates and 4-week moving average"},
        {"stage": "Trend analysis",
         "detail": (
             f"Latest week {latest['week_start']}: {fmt(latest['confirmed'])} confirmed cases · "
             f"4-week moving average {fmt(latest['cases_ma4'], 1)}" if latest else "No data"
         )},
        {"stage": "Baseline comparison",
         "detail": f"{plural(len([p for p in weekly if p['baseline_prev4'] is not None]), 'week')} compared with the previous 4-week average"},
        {"stage": "Anomaly detection",
         "detail": f"{plural(len(z_scored), 'week')} scored against the previous 8 weeks · "
                   f"{len([p for p in z_scored if p['z_prev8'] >= Z_THRESHOLD])} at or above {Z_THRESHOLD} SD"},
        {"stage": "Risk signal",
         "detail": f"{plural(counts['ELEVATED'], 'elevated week')}, {plural(counts['WATCH'], 'watch week')} · "
                   f"latest week: {level_label(latest['signal']['level']) if latest else '—'}"},
        {"stage": "Explainable alert",
         "detail": f"{plural(len(alerts), 'district alert')}, each listing the rules that fired and the values behind them"},
        {"stage": "Human review",
         "detail": "Every alert requires verification and a recorded decision by the district health team"},
    ]

    return {
        "scope": scope,
        "scopeOptions": scope_options(records),
        "districtsInScope": in_scope,
        "districtsWithData": data_districts,
        "hasData": len(data_districts) > 0,
        "today": today,
        "sources": combined["sources"],
        "coverage": coverage,
        "freshness": {
            "latest_week": latest["week_start"] if latest else None,
            "days_since_latest": since,
            "stale": since is not None and since > STALE_AFTER_DAYS,
        },
        "period": {"start": quality["date_start"], "end": quality["date_end"], "weeks": len(weekly)},
        "latest": latest,
        "weekly": weekly,
        "totals": totals_for(weekly),
        "districts": districts,
        "districtSignals": [
            {"district": d, "province": province_of(d), "latest": per_district[d][-1] if per_district[d] else None}
            for d in data_districts
        ],
        "alerts": alerts,
        "relationships": relationships(weekly),
        "prioritisation": prioritisation(per_district),
        "forecast": forecast,
        "quality": quality,
        "pipeline": pipeline,
        "method": METHOD,
    }
