"""Umuburo AI — malaria early-warning API (FastAPI).

A light Python service over the proven forecasting pipeline's output. It serves
the cleaned dataset (data/*.json) and exposes the same explainable forecast and
data-validation logic as the web app, with interactive docs at /docs.

Run:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000
Then open http://localhost:8000/docs
"""
from __future__ import annotations

import csv
import io
import json
import math
import os
import re
from functools import lru_cache
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

app = FastAPI(
    title="Umuburo AI API",
    version="1.0.0",
    description=(
        "AI-powered malaria early-warning API for the Kirehe & Nyamasheke pilot. "
        "Turns surveillance, historical, geographic and climate data into explainable "
        "risk forecasts. Prototype data — verify-before-act."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

PILOTS = ["Kirehe", "Nyamasheke"]


# --------------------------------------------------------------------------- data
@lru_cache(maxsize=None)
def load(name: str) -> Any:
    with open(os.path.join(DATA_DIR, name), encoding="utf-8") as f:
        return json.load(f)


def districts() -> list[dict]:
    return load("districts.json")


def district(name: str) -> dict | None:
    return next((d for d in districts() if d["district"].lower() == name.lower()), None)


# --------------------------------------------------------------------------- risk
BAND = {"HIGH": (70, 93), "WATCH": (45, 67), "LOW": (8, 40)}
LABEL = {"HIGH": "High Risk", "WATCH": "Watch", "LOW": "Normal"}


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def risk_score(d: dict) -> int:
    s = 0.0
    s += clamp(d["anomaly_z"] / 4, 0, 1) * 44
    s += clamp(d["trend_pct"] / 50, 0, 1) * 22
    s += 12 if d.get("climate_signal") else 0
    s += clamp(d["prevention_gap"] / 110, 0, 1) * 14
    fc = d.get("forecast") or []
    if len(fc) >= 2:
        rise = (fc[-1] - fc[0]) / max(fc[0], 1)
        s += clamp(rise / 0.2, 0, 1) * 8
    lo, hi = BAND[d["risk"]]
    return round(lo + clamp(s / 100, 0, 1) * (hi - lo))


def risk_factors(d: dict) -> list[dict]:
    exp = max(d["expected_latest"], 1)
    factors = [
        {
            "label": "Case anomaly vs seasonal baseline",
            "detail": (
                f"Cases {'+' if d['cases_latest'] >= exp else ''}"
                f"{round((d['cases_latest'] - exp) / exp * 100)}% vs expected "
                f"(z = {d['anomaly_z']:.1f})."
            ),
            "weight": clamp(d["anomaly_z"] / 4, 0, 1),
            "tone": "HIGH" if d["anomaly_z"] >= 2 else "WATCH" if d["anomaly_z"] >= 1 else "LOW",
        },
        {
            "label": "Short-term trend",
            "detail": f"{'+' if d['trend_pct'] > 0 else ''}{d['trend_pct']}% vs the trailing 4-week average.",
            "weight": clamp(d["trend_pct"] / 50, 0, 1),
            "tone": "HIGH" if d["trend_pct"] >= 25 else "WATCH" if d["trend_pct"] >= 10 else "LOW",
        },
        {
            "label": "Climate lead signal",
            "detail": (
                f"Rainfall 6-8 weeks ago favourable for transmission ({d['rainfall_lead']:.0f} mm/wk)."
                if d.get("climate_signal")
                else "Recent climate not adding transmission risk."
            ),
            "weight": 0.6 if d.get("climate_signal") else 0.15,
            "tone": "WATCH" if d.get("climate_signal") else "LOW",
        },
        {
            "label": "Prevention gap",
            "detail": f"Prevention-gap index {d['prevention_gap']:.0f} (net ownership vs usage, spray coverage).",
            "weight": clamp(d["prevention_gap"] / 110, 0, 1),
            "tone": "HIGH" if d["prevention_gap"] >= 80 else "WATCH" if d["prevention_gap"] >= 50 else "LOW",
        },
    ]
    return sorted(factors, key=lambda f: f["weight"], reverse=True)


# --------------------------------------------------------------------------- models
class ForecastRequest(BaseModel):
    district: str = "Nyamasheke"
    weeks: int = 3


class LoginRequest(BaseModel):
    email: str
    password: str


# --------------------------------------------------------------------------- routes
@app.get("/", tags=["meta"])
def root():
    return {
        "product": "Umuburo AI",
        "tagline": "Forecast malaria risk before it becomes an outbreak.",
        "pilots": PILOTS,
        "docs": "/docs",
    }


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}


@app.get("/api/dashboard", tags=["dashboard"])
def dashboard():
    nat = load("national_summary.json")
    pilots = [d for d in districts() if d["district"] in PILOTS]
    return {
        "national": nat,
        "meta": load("meta.json"),
        "pilots": [{**p, "score": risk_score(p)} for p in pilots],
    }


@app.get("/api/districts", tags=["data"])
def list_districts():
    return [{**d, "score": risk_score(d)} for d in districts()]


@app.get("/api/district/{name}", tags=["data"])
def get_district(name: str):
    d = district(name)
    if not d:
        raise HTTPException(404, f"Unknown district: {name}")
    ts = load("timeseries.json").get(d["district"])
    prev = next(
        (p for p in load("prevention.json")["districts"] if p["district"] == d["district"]),
        None,
    )
    return {**d, "score": risk_score(d), "timeseries": ts, "prevention": prev}


@app.post("/api/forecast", tags=["forecast"])
def forecast(req: ForecastRequest):
    d = district(req.district)
    if not d:
        raise HTTPException(404, f"Unknown district: {req.district}")
    w = int(clamp(round(req.weeks or 3), 1, 3))
    fc = d.get("forecast") or []
    predicted = fc[w - 1] if w - 1 < len(fc) else (fc[-1] if fc else d["cases_latest"])
    current = d["cases_latest"]
    delta = round((predicted - current) / current * 100) if current else 0
    ts = load("timeseries.json").get(d["district"], {})
    series = {
        **ts,
        "forecast_weeks": (ts.get("forecast_weeks") or [])[:w],
        "forecast": (ts.get("forecast") or [])[:w],
    }
    return {
        "district": d["district"],
        "province": d["province"],
        "weeks": w,
        "level": d["risk"],
        "levelLabel": LABEL[d["risk"]],
        "score": risk_score(d),
        "current": current,
        "predicted": round(predicted),
        "deltaPct": delta,
        "series": series,
        "factors": risk_factors(d),
        "verifyFirst": [
            f"Confirm CHW reporting completeness (currently {d['chw_reporting_pct']}%).",
            f"Cross-check the facility register and RDT positivity ({round(d['positivity'] * 100)}%).",
            f"Check RDT & ACT stock for {d['district']} before acting.",
        ],
        "asOf": load("national_summary.json")["as_of"],
    }


@app.get("/api/alerts", tags=["alerts"])
def alerts():
    return load("alerts.json")


@app.get("/api/reports", tags=["reports"])
def reports():
    nat = load("national_summary.json")
    prev = {p["district"]: p for p in load("prevention.json")["districts"]}
    return {
        "suggestions": nat["suggestions"],
        "districts": [
            {
                "district": name,
                "risk": (district(name) or {}).get("risk"),
                "prevention": prev.get(name),
            }
            for name in PILOTS
        ],
    }


@app.post("/api/auth/login", tags=["auth"])
def login(req: LoginRequest):
    accounts = {
        "national@umuburo.rw": {"name": "Aline U.", "role": "national"},
        "kirehe@umuburo.rw": {"name": "Jean-Bosco N.", "role": "district", "district": "Kirehe"},
        "nyamasheke@umuburo.rw": {"name": "Claudine M.", "role": "district", "district": "Nyamasheke"},
    }
    acc = accounts.get(req.email.lower())
    if not acc or req.password != "demo":
        raise HTTPException(401, "Invalid credentials (demo password is 'demo').")
    return {"email": req.email, **acc}


# --------------------------------------------------------------------------- upload
NUM_RE = re.compile(r"^-?\d+(\.\d+)?$")
DATE_RE = re.compile(r"^\d{4}-W\d{1,2}$", re.I)
ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}")


def looks_date(v: str) -> bool:
    return bool(DATE_RE.match(v.strip()) or ISO_RE.match(v.strip()))


def analyze_csv(text: str, fmt: str, name: str) -> dict:
    reader = list(csv.reader(io.StringIO(text)))
    if not reader:
        raise HTTPException(400, "Empty file")
    header = [h.strip() for h in reader[0]]
    rows = [r for r in reader[1:] if any(c.strip() for c in r)]
    known = {d["district"].lower() for d in districts()}

    def find(pat: str) -> int:
        return next((i for i, h in enumerate(header) if re.search(pat, h, re.I)), -1)

    date_i, loc_i, case_i = find(r"date|week|period|epi"), find(r"district|sector|cell|village|location"), find(r"case|confirmed|positiv|malaria")
    numeric_i = [i for i, h in enumerate(header) if re.search(r"case|confirmed|positiv|population|rain|temp|count|number|incidence", h, re.I)]

    issues: list[dict] = []
    missing = [n for n, i in [("date/epi-week", date_i), ("location", loc_i), ("cases", case_i)] if i < 0]
    issues.append(
        {"level": "error", "label": "Required columns", "detail": f"Missing: {', '.join(missing)}."}
        if missing
        else {"level": "ok", "label": "Required columns", "detail": "date, location and cases found."}
    )

    cells = sum(len(header) for _ in rows)
    empty = sum(1 for r in rows for i in range(len(header)) if (r[i] if i < len(r) else "").strip() == "")
    pct = (empty / cells * 100) if cells else 0
    issues.append({
        "level": "ok" if empty == 0 else "error" if pct > 5 else "warn",
        "label": "Missing values",
        "detail": "No empty cells." if empty == 0 else f"{empty} empty cell(s) ({pct:.1f}%).",
    })

    seen: set = set()
    dupes = 0
    for r in rows:
        key = "\u0001".join(r)
        dupes += key in seen
        seen.add(key)
    issues.append({"level": "ok" if dupes == 0 else "warn", "label": "Duplicate records",
                   "detail": "No duplicate rows." if dupes == 0 else f"{dupes} duplicate row(s)."})

    if date_i >= 0:
        bad = sum(1 for r in rows if date_i < len(r) and r[date_i].strip() and not looks_date(r[date_i]))
        issues.append({"level": "ok" if bad == 0 else "error" if bad > len(rows) * 0.05 else "warn",
                       "label": "Invalid dates", "detail": "All dates parse." if bad == 0 else f"{bad} bad date(s)."})
    if loc_i >= 0 and re.search(r"district", header[loc_i], re.I):
        bad = sum(1 for r in rows if loc_i < len(r) and r[loc_i].strip() and r[loc_i].strip().lower() not in known)
        issues.append({"level": "ok" if bad == 0 else "warn", "label": "Invalid locations",
                       "detail": "All districts recognised." if bad == 0 else f"{bad} unrecognised district(s)."})
    if numeric_i:
        bad = sum(1 for r in rows for i in numeric_i if i < len(r) and r[i].strip() and not NUM_RE.match(r[i].strip()))
        issues.append({"level": "ok" if bad == 0 else "warn", "label": "Data types",
                       "detail": "Numeric columns valid." if bad == 0 else f"{bad} non-numeric value(s)."})

    preview = [{header[i]: (r[i] if i < len(r) else "") for i in range(len(header))} for r in rows[:8]]
    return {"kind": "dataset", "format": fmt, "fileName": name, "rowCount": len(rows),
            "columns": header, "preview": preview, "issues": issues}


@app.post("/api/upload", tags=["upload"])
async def upload(file: UploadFile = File(...)):
    name = file.filename or "upload"
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    raw = await file.read()
    size_kb = round(len(raw) / 1024)

    if ext in ("csv", "tsv"):
        return analyze_csv(raw.decode("utf-8", "replace"), "CSV", name)
    if ext in ("json", "geojson"):
        try:
            data = json.loads(raw.decode("utf-8", "replace"))
        except Exception:
            return {"kind": "binary", "format": "JSON", "fileName": name, "sizeKB": size_kb,
                    "note": "File is not valid JSON.", "issues": [{"level": "error", "label": "Parse", "detail": "JSON parse failed."}]}
        if ext == "geojson" or (isinstance(data, dict) and data.get("type") == "FeatureCollection"):
            feats = data.get("features", []) if isinstance(data, dict) else []
            return {"kind": "dataset", "format": "GeoJSON", "fileName": name, "rowCount": len(feats),
                    "columns": ["feature", "geometry", "properties"],
                    "preview": [{"feature": "Feature", "geometry": (f.get("geometry") or {}).get("type", "—"),
                                 "properties": ", ".join(list((f.get("properties") or {}).keys())[:4]) or "—"} for f in feats[:6]],
                    "issues": [{"level": "ok" if feats else "warn", "label": "GeoJSON structure",
                                "detail": f"FeatureCollection with {len(feats)} feature(s)."}]}
        arr = data if isinstance(data, list) else data.get("rows", []) if isinstance(data, dict) else []
        if arr and isinstance(arr[0], dict):
            header = list(arr[0].keys())
            out = io.StringIO()
            w = csv.writer(out)
            w.writerow(header)
            for o in arr:
                w.writerow([o.get(h, "") for h in header])
            return analyze_csv(out.getvalue(), "JSON", name)
        return {"kind": "binary", "format": "JSON", "fileName": name, "sizeKB": size_kb,
                "note": "JSON is not a tabular dataset.", "issues": [{"level": "warn", "label": "Shape", "detail": "Expected an array of records."}]}
    if ext in ("jpg", "jpeg", "png", "webp", "pdf"):
        return {"kind": "document", "format": "PDF" if ext == "pdf" else "Image", "fileName": name,
                "note": "Prototype extraction. Connect an OCR/document-AI service in production. Review and correct before saving.",
                "fields": [
                    {"key": "district", "label": "District", "value": "Kirehe", "confidence": 0.86},
                    {"key": "epi_week", "label": "Epi week", "value": "2026-W40", "confidence": 0.90},
                    {"key": "facility", "label": "Health facility", "value": "Kirehe HC", "confidence": 0.72},
                    {"key": "confirmed_cases", "label": "Confirmed cases", "value": "48", "confidence": 0.81},
                    {"key": "rdt_positivity", "label": "RDT positivity %", "value": "15", "confidence": 0.68},
                ]}
    fmt = {"xlsx": "Excel", "xls": "Excel", "parquet": "Parquet", "zip": "ZIP archive"}.get(ext, ext.upper() or "Binary")
    return {"kind": "binary", "format": fmt, "fileName": name, "sizeKB": size_kb,
            "note": f"{fmt} accepted ({size_kb} KB). Full profiling runs in the processing service.",
            "issues": [{"level": "ok", "label": "Received", "detail": f"{fmt} staged for import."}]}
