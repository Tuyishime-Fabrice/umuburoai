"""Surveillance analytics pipeline (Python port of web/lib/surveillance/pipeline.ts).

CSV → validation → cleaning → feature preparation → trend analysis → baseline
comparison → anomaly detection → risk signal → explainable alert → human review.

The algorithm, rounding and wording match the TypeScript implementation exactly so
the web app gets the same result from the API or from its own fallback. Loops are
written out (no sum()) because Python 3.12's sum() of floats uses compensated
summation, which would differ from JavaScript in the last bit.
"""
from __future__ import annotations

import math
import re
from datetime import date, datetime
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
MIN_CORRELATION_PAIRS = 10
MAX_LAG_WEEKS = 8

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
NUMERIC_COLUMNS = [c for c in COLUMNS if c not in ("week_start", "district")]

PCT_FIELDS = {
    "positive_tests_pct", "testing_rate_pct", "relative_humidity_pct", "reporting_completeness_pct",
    "bed_occupancy_pct", "bed_net_coverage_pct", "indoor_residual_spraying_pct",
}
SIGNED_FIELDS = {"mean_temperature_c", "ndvi", "cases_change_vs_4wk_avg_pct"}

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


# --------------------------------------------------------------------------- validate + clean
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
    if col in SIGNED_FIELDS:
        return True
    return v >= 0


def validate_and_clean(text: str) -> dict:
    table = parse_csv(text)
    header = [h.strip() for h in (table[0] if table else [])]
    body = table[1:]
    validation: list[dict] = []

    missing_cols = [c for c in COLUMNS if c not in header]
    extra_cols = [h for h in header if h not in COLUMNS]
    if missing_cols:
        validation.append({
            "check": "Required columns", "level": "error",
            "detail": f"Missing column(s): {', '.join(missing_cols)}. Analytics that need them show as missing.",
            "count": len(missing_cols),
        })
    else:
        validation.append({
            "check": "Required columns", "level": "ok",
            "detail": f"All {len(COLUMNS)} expected columns are present.", "count": 0,
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
    invalid_numbers = 0
    invalid_number_cols: list[str] = []
    out_of_range = 0
    out_of_range_cols: list[str] = []
    seen: set = set()
    records: list[dict] = []

    for r in body:
        week_start = cell(r, "week_start")
        district = cell(r, "district")
        if not is_valid_date(week_start) or not district:
            dropped_invalid_key += 1
            continue
        key = f"{district.lower()}|{week_start}"
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

    records.sort(key=lambda x: (x["district"], x["week_start"]))

    validation.append({
        "check": "Row keys (date, district)", "level": "warn" if dropped_invalid_key else "ok",
        "detail": (
            f"{plural(dropped_invalid_key, 'row')} dropped: week_start is not a valid YYYY-MM-DD date or district is empty."
            if dropped_invalid_key else "Every row has a valid week_start date and a district."
        ),
        "count": dropped_invalid_key,
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

    empty_cells = 0
    for rec in records:
        for c in NUMERIC_COLUMNS:
            if rec[c] is None:
                empty_cells += 1
    nulled_by_us = invalid_numbers + out_of_range
    validation.append({
        "check": "Missing values", "level": "warn" if empty_cells else "ok",
        "detail": (
            f"{plural(empty_cells, 'cell')} missing after cleaning ({nulled_by_us} set to missing by validation). "
            "Missing values are excluded from calculations, never filled in."
            if empty_cells else "No missing values."
        ),
        "count": empty_cells,
    })

    validation.extend(consistency_checks(records))
    validation.append(continuity_check(records))

    return {
        "records": records,
        "validation": validation,
        "header": header,
        "cleaning": {
            "rowsRead": len(body),
            "rowsKept": len(records),
            "droppedInvalidKey": dropped_invalid_key,
            "droppedDuplicate": dropped_duplicate,
            "valuesSetToNull": nulled_by_us,
        },
    }


def consistency_checks(records: list[dict]) -> list[dict]:
    out: list[dict] = []
    logical = [
        ("tested ≤ suspected", lambda r: cmp(r["tested_cases"], r["suspected_malaria_cases"])),
        ("confirmed ≤ tested", lambda r: cmp(r["confirmed_malaria_cases"], r["tested_cases"])),
        ("facilities reporting ≤ expected", lambda r: cmp(r["facilities_reporting"], r["facilities_expected"])),
    ]
    for label, fn in logical:
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
            "check": "positive_tests_pct = confirmed ÷ tested", "tol": 0.05, "unit": " pp",
            "note": "Single district-weeks show the file's value; combined figures are recomputed from counts.",
            "file": lambda r: r["positive_tests_pct"],
            "calc": lambda r, i, rs: ratio(r["confirmed_malaria_cases"], r["tested_cases"], 100),
        },
        {
            "check": "testing_rate_pct = tested ÷ suspected", "tol": 0.05, "unit": " pp", "note": "",
            "file": lambda r: r["testing_rate_pct"],
            "calc": lambda r, i, rs: ratio(r["tested_cases"], r["suspected_malaria_cases"], 100),
        },
        {
            "check": "incidence_per_1000 = confirmed ÷ population × 1,000", "tol": 0.001, "unit": "", "note": "",
            "file": lambda r: r["incidence_per_1000"],
            "calc": lambda r, i, rs: ratio(r["confirmed_malaria_cases"], r["population_at_risk"], 1000),
        },
        {
            "check": "confirmed_cases_4wk_avg = trailing 4-week mean (incl. current week)", "tol": 0.05, "unit": "",
            "note": "The system's baseline uses the 4 weeks before the current week instead, so a rise is not averaged into its own baseline.",
            "file": lambda r: r["confirmed_cases_4wk_avg"],
            "calc": lambda r, i, rs: trailing_mean(rs, i, lambda x: x["confirmed_malaria_cases"]),
        },
        {
            "check": "cases_change_vs_4wk_avg_pct matches the file's 4-week average", "tol": 0.05, "unit": " pp",
            "note": "",
            "file": lambda r: r["cases_change_vs_4wk_avg_pct"],
            "calc": change_calc,
        },
    ]

    by_district = group_by(records, lambda r: r["district"])
    for d in derived:
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
        complete = len(rs) == len(districts)
        p: dict[str, Any] = {
            "week_start": w,
            "epi_week": rs[0]["epidemiological_week"],
            "districts_reporting": len(rs),
        }
        for out, col, agg in SERIES_FIELDS:
            vals = [r[col] for r in rs]
            nn = non_null(vals)
            if agg == "sum":
                v = add(nn) if complete and len(nn) == len(vals) else None
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
            p["file_alert_label"] = (
                add(labels) if complete and all(x is not None for x in labels) else None
            )
        points.append(p)
    return points


# --------------------------------------------------------------------------- features
def prev_window(points: list[dict], i: int, n: int, key: str) -> Optional[list]:
    if i < n:
        return None
    vals = [x[key] for x in points[i - n: i]]
    return vals if all(v is not None for v in vals) else None


def add_features(points: list[dict]) -> None:
    for i, p in enumerate(points):
        p["cases_ma4"] = rnd_n(trailing_mean(points, i, lambda x: x["confirmed"]), 2)

        prev4 = prev_window(points, i, 4, "confirmed")
        b = mean(prev4) if prev4 else None
        p["baseline_prev4"] = rnd_n(b, 2)
        p["change_vs_baseline_pct"] = (
            rnd(((p["confirmed"] - b) / b) * 100, 1)
            if b is not None and b > 0 and p["confirmed"] is not None else None
        )

        prev8 = prev_window(points, i, 8, "confirmed")
        m8 = mean(prev8) if prev8 else None
        sd8 = sample_sd(prev8) if prev8 else None
        p["baseline_prev8_mean"] = rnd_n(m8, 2)
        p["baseline_prev8_sd"] = rnd_n(sd8, 2)
        p["z_prev8"] = (
            rnd((p["confirmed"] - m8) / sd8, 2)
            if m8 is not None and sd8 is not None and sd8 > 0 and p["confirmed"] is not None else None
        )

        pos4 = prev_window(points, i, 4, "positivity_pct")
        pb = mean(pos4) if pos4 else None
        p["positivity_baseline_prev4"] = rnd_n(pb, 2)
        p["positivity_change_pp"] = (
            rnd(p["positivity_pct"] - pb, 2) if pb is not None and p["positivity_pct"] is not None else None
        )

        sev4 = prev_window(points, i, 4, "severe")
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
            f"the previous 4-week average ({fmt(p['baseline_prev4'], 1)}) in {place}.",
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
    if p["baseline_prev4"] is None:
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
        elif has("unusual_increase"):
            lead = (
                f"An unusual increase in confirmed malaria cases was observed in {district} "
                f"({fmt(p['z_prev8'], 2)} SD above the previous 8 weeks)."
            )
        else:
            lead = s["signals"][0]["detail"]
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
        stock = f", {plural(p['stockout_days'], 'stockout day')} recorded" if p["stockout_days"] else ""
        verify.append(
            f"Check case-management stock: ACT {fmt(p['act_stock_days'])} days, RDT {fmt(p['rdt_stock_days'])} days{stock}."
        )
        verify.append("Decide with the district team whether field investigation or a response is needed.")

        out.append({
            "id": f"{district}-{p['week_start']}",
            "district": district,
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

    def both(ka: str, kb: str):
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
        return (sa, sb) if n else None

    pos = both("confirmed", "tested")
    tr = both("tested", "suspected")
    pop_mean = mean(non_null(p["population"] for p in points))
    out = {"weeks": len(points)}
    out["suspected"] = sum_of("suspected", "suspected")
    out["tested"] = sum_of("tested", "tested")
    confirmed = sum_of("confirmed", "confirmed")
    out["confirmed"] = confirmed
    out["severe"] = sum_of("severe", "severe")
    out["deaths"] = sum_of("deaths", "deaths")
    out["admissions"] = sum_of("admissions", "admissions")
    out["outpatient"] = sum_of("outpatient", "outpatient")
    out["positivity_pct"] = rnd((pos[0] / pos[1]) * 100, 2) if pos and pos[1] > 0 else None
    out["testing_rate_pct"] = rnd((tr[0] / tr[1]) * 100, 2) if tr and tr[1] > 0 else None
    out["incidence_per_1000"] = (
        rnd((confirmed / pop_mean) * 1000, 2) if confirmed is not None and pop_mean else None
    )
    out["stockout_days"] = sum_of("stockout_days", "stockout_days")
    out["missing_weeks"] = missing
    return out


# --------------------------------------------------------------------------- relationships
REL_VARS = [
    ("rainfall_mm", "Rainfall", "mm/week"),
    ("temperature_c", "Mean temperature", "°C"),
    ("humidity_pct", "Relative humidity", "%"),
    ("ndvi", "NDVI (vegetation)", "index"),
    ("mosquito_density", "Mosquito density", "index"),
    ("larval_density", "Larval density", "index"),
    ("mobility_index", "Human mobility", "index"),
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
    for key, label, unit in REL_VARS:
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
        out.append({"variable": key, "label": label, "unit": unit, "lags": lags, "best": best, "strength": strength})
    return out


# --------------------------------------------------------------------------- data quality
def quality_for(clean: dict, districts: list[str]) -> dict:
    rs = [r for r in clean["records"] if r["district"] in districts]
    dates = sorted(r["week_start"] for r in rs)
    weeks_per = {d: len([r for r in rs if r["district"] == d]) for d in districts}
    missing_by_column = [
        {"column": c, "missing": len([r for r in rs if r[c] is None])} for c in NUMERIC_COLUMNS
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
        "districts": districts,
        "date_start": dates[0] if dates else None,
        "date_end": latest_date,
        "weeks_per_district": weeks_per,
        "missing_values_total": add(c["missing"] for c in missing_by_column),
        "missing_by_column": missing_by_column,
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
        "validation": clean["validation"],
        "cleaning": clean["cleaning"],
    }


# --------------------------------------------------------------------------- method
METHOD = [
    {"key": "baseline", "label": "Recent baseline",
     "rule": "Average of confirmed cases in the 4 weeks before the current week (the current week is not included). Needs 4 earlier weeks."},
    {"key": "cases_above_baseline", "label": "Cases above recent baseline",
     "rule": f"Confirmed cases are {CASE_DEVIATION_PCT}% or more above the recent baseline."},
    {"key": "unusual_increase", "label": "Unusual increase (anomaly)",
     "rule": f"Confirmed cases are {Z_THRESHOLD} or more standard deviations above the mean of the previous 8 weeks."},
    {"key": "positivity_increased", "label": "Positivity increased",
     "rule": f"Test positivity is {POSITIVITY_RISE_PP} or more percentage points above its previous 4-week average."},
    {"key": "severe_above_baseline", "label": "Severe cases above recent baseline",
     "rule": f"Severe cases are at least {SEVERE_RATIO}× and at least {SEVERE_MIN_EXCESS} cases above their previous 4-week average."},
    {"key": "level", "label": "Signal level",
     "rule": "A signal must include a case-based rule (cases above recent baseline, or unusual increase). Case-based rule plus at least one more rule → Elevated signal. One case-based rule alone → Watch (increased surveillance attention). Positivity or severe-case rises without a case-based rule are listed as observations, not alerts. Fewer than 4 earlier weeks → Insufficient history."},
    {"key": "context", "label": "Environmental context",
     "rule": f"Shown only when a signal is present: 4-week rainfall, mosquito density or larval density {CONTEXT_ABOVE_PCT}% or more above its average over the dataset period. Context never raises the level on its own."},
    {"key": "quality", "label": "Data confidence",
     "rule": f"Reporting completeness below {COMPLETENESS_MIN_PCT}%, reporting delay above {DELAY_MAX_DAYS} days, or facilities not reporting are shown as cautions."},
    {"key": "aggregation", "label": "All districts combined",
     "rule": "Counts are summed (missing if any district is missing that week); positivity, testing rate and incidence are recomputed from the summed counts; environmental and health-system indices are averaged across districts."},
    {"key": "relationships", "label": "Environmental relationships",
     "rule": f"Pearson correlation between confirmed cases and each variable 0–{MAX_LAG_WEEKS} weeks earlier. Association within this dataset only — not evidence of cause."},
    {"key": "forecast", "label": "Forecasting",
     "rule": "No forecasting model is implemented. All figures are observed values or calculations from them."},
]


# --------------------------------------------------------------------------- entry
def districts_in(clean: dict) -> list[str]:
    return sorted({r["district"] for r in clean["records"]})


def resolve_scope(clean: dict, requested: Optional[str]) -> str:
    want = (requested or "").strip().lower()
    return next((d for d in districts_in(clean) if d.lower() == want), "All")


def level_label(level: str) -> str:
    return {
        "ELEVATED": "Elevated signal",
        "WATCH": "Watch",
        "NONE": "No signal",
    }.get(level, "Insufficient history")


def _alert_cmp(a: dict, b: dict) -> int:
    if a["week_start"] == b["week_start"]:
        return -1 if a["district"] < b["district"] else 1
    return 1 if a["week_start"] < b["week_start"] else -1


def analyze(clean: dict, scope_requested: Optional[str], file_name: str) -> dict:
    all_d = districts_in(clean)
    scope = resolve_scope(clean, scope_requested)
    districts = all_d if scope == "All" else [scope]
    place = "all districts combined" if scope == "All" else scope

    weekly = series_for(clean["records"], districts, place)
    per_district = {d: series_for(clean["records"], [d], d) for d in districts}
    latest = weekly[-1] if weekly else None

    alerts: list[dict] = []
    for d in districts:
        alerts.extend(build_alerts(d, per_district[d]))
    alerts.sort(key=cmp_to_key(_alert_cmp))

    comparison = []
    if scope == "All":
        for d in districts:
            s = per_district[d]
            last = s[-1] if s else None
            comparison.append({
                "district": d,
                "latest_confirmed": last["confirmed"] if last else None,
                "latest_change_vs_baseline_pct": last["change_vs_baseline_pct"] if last else None,
                "latest_level": last["signal"]["level"] if last else "INSUFFICIENT",
                "totals": totals_for(s),
                "mean_reporting_completeness_pct": rnd_n(mean(non_null(p["reporting_completeness_pct"] for p in s)), 2),
                "alerts": len([a for a in alerts if a["district"] == d]),
            })

    quality = quality_for(clean, districts)
    counts = {"ELEVATED": 0, "WATCH": 0}
    for p in weekly:
        if p["signal"]["level"] in counts:
            counts[p["signal"]["level"]] += 1
    errors = len([v for v in clean["validation"] if v["level"] == "error"])
    warnings = len([v for v in clean["validation"] if v["level"] == "warn"])
    z_scored = [p for p in weekly if p["z_prev8"] is not None]
    cl = clean["cleaning"]

    pipeline = [
        {"stage": "CSV", "detail": f"{file_name}: {cl['rowsRead']} rows × {len(clean['header'])} columns read"},
        {"stage": "Data validation",
         "detail": f"{len(clean['validation'])} checks · {plural(errors, 'error')}, {plural(warnings, 'warning')}"},
        {"stage": "Data cleaning",
         "detail": f"{cl['rowsKept']} rows kept · {cl['droppedInvalidKey'] + cl['droppedDuplicate']} dropped · "
                   f"{cl['valuesSetToNull']} values set to missing"},
        {"stage": "Feature preparation",
         "detail": f"{plural(len(weekly), 'weekly point')} for {place} · rates and 4-week moving average"},
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
         "detail": "Every alert requires verification and a decision by the district health team"},
    ]

    district_signals = []
    for d in districts:
        s = per_district[d]
        district_signals.append({"district": d, "latest": s[-1] if s else None})

    return {
        "scope": scope,
        "scopes": ["All", *all_d],
        "districts": districts,
        "source": {"file": file_name, "rows": cl["rowsRead"], "columns": len(clean["header"])},
        "period": {"start": quality["date_start"], "end": quality["date_end"], "weeks": len(weekly)},
        "latest": latest,
        "weekly": weekly,
        "totals": totals_for(weekly),
        "districtSignals": district_signals,
        "alerts": alerts,
        "relationships": relationships(weekly),
        "comparison": comparison,
        "quality": quality,
        "pipeline": pipeline,
        "method": METHOD,
    }
