"""Umuburo AI — malaria surveillance analytics API (FastAPI).

Every figure is calculated from the surveillance CSV in data/ by analytics.py
(validation → cleaning → features → baseline → anomaly → signal → alert). There is
no other data source, no forecast and no live system connection.

Run:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000
Then open http://localhost:8000/docs
"""
from __future__ import annotations

import os
from typing import Optional

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

import analytics

DATASET_FILE = "rwanda_malaria_surveillance_testing_data.csv"
DATA_PATH = os.environ.get("SURVEILLANCE_CSV") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "data", DATASET_FILE
)

app = FastAPI(
    title="Umuburo AI API",
    version="2.0.0",
    description=(
        "Malaria surveillance analytics for Nyagatare and Muhanga, calculated from the weekly "
        f"surveillance CSV ({DATASET_FILE}). Signals flag unusual patterns for the district "
        "health team to verify — they are not confirmed outbreaks, and nothing is forecast."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_cache: dict = {}


def dataset() -> dict:
    """Validated + cleaned records, re-read whenever the file changes on disk."""
    try:
        st = os.stat(DATA_PATH)
    except FileNotFoundError:
        raise HTTPException(503, f"Surveillance dataset not found at {DATA_PATH}")
    key = (DATA_PATH, st.st_mtime_ns, st.st_size)
    if _cache.get("key") != key:
        with open(DATA_PATH, encoding="utf-8") as f:
            _cache["clean"] = analytics.validate_and_clean(f.read())
        _cache["key"] = key
    return _cache["clean"]


class LoginRequest(BaseModel):
    email: str
    password: str


# --------------------------------------------------------------------------- routes
@app.get("/", tags=["meta"])
def root():
    clean = dataset()
    return {
        "product": "Umuburo AI",
        "purpose": "Flag unusual malaria surveillance signals for human verification.",
        "dataset": DATASET_FILE,
        "districts": analytics.districts_in(clean),
        "docs": "/docs",
    }


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}


@app.get("/api/analytics", tags=["analytics"])
def get_analytics(district: Optional[str] = Query("All", description="All, or a district in the dataset")):
    """Full analytics for a scope: weekly series, signals, alerts, data quality, relationships."""
    return analytics.analyze(dataset(), district, DATASET_FILE)


@app.get("/api/alerts", tags=["analytics"])
def get_alerts(district: Optional[str] = Query("All")):
    a = analytics.analyze(dataset(), district, DATASET_FILE)
    return {"scope": a["scope"], "alerts": a["alerts"]}


@app.get("/api/data-quality", tags=["analytics"])
def get_quality(district: Optional[str] = Query("All")):
    a = analytics.analyze(dataset(), district, DATASET_FILE)
    return a["quality"]


@app.get("/api/dataset", tags=["data"])
def download_dataset():
    """The source CSV, unchanged — every figure can be traced back to it."""
    dataset()
    return FileResponse(DATA_PATH, media_type="text/csv", filename=DATASET_FILE)


@app.post("/api/auth/login", tags=["auth"])
def login(req: LoginRequest):
    accounts = {
        "national@umuburo.rw": {"name": "Aline U.", "role": "national"},
        "nyagatare@umuburo.rw": {"name": "Jean-Bosco N.", "role": "district", "district": "Nyagatare"},
        "muhanga@umuburo.rw": {"name": "Claudine M.", "role": "district", "district": "Muhanga"},
    }
    acc = accounts.get(req.email.lower())
    if not acc or req.password != "demo":
        raise HTTPException(401, "Invalid credentials (demo password is 'demo').")
    return {"email": req.email, **acc}


# --------------------------------------------------------------------------- upload
def upload_report(name: str, raw: bytes) -> dict:
    """Check an uploaded file against the surveillance schema. Nothing is stored."""
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    size_kb = int(analytics.rnd(len(raw) / 1024, 0))
    if ext != "csv":
        fmt = ext.upper() or "Unknown"
        return {
            "kind": "unsupported", "format": fmt, "fileName": name, "sizeKB": size_kb,
            "note": "Only CSV files in the surveillance format can be validated. This file was not read and nothing was stored.",
            "issues": [{"level": "error", "label": "Format", "detail": f"{fmt} files are not processed."}],
        }
    text = raw.decode("utf-8", "replace")
    clean = analytics.validate_and_clean(text)
    table = analytics.parse_csv(text)
    header = clean["header"]
    preview = [
        {header[i]: (r[i] if i < len(r) else "") for i in range(len(header))}
        for r in table[1:9]
    ]
    dates = sorted(r["week_start"] for r in clean["records"])
    return {
        "kind": "dataset", "format": "CSV", "fileName": name,
        "rowCount": clean["cleaning"]["rowsRead"],
        "columns": header,
        "preview": preview,
        "issues": [{"level": v["level"], "label": v["check"], "detail": v["detail"]} for v in clean["validation"]],
        "cleaning": clean["cleaning"],
        "districts": analytics.districts_in(clean),
        "period": {"start": dates[0] if dates else None, "end": dates[-1] if dates else None},
    }


@app.post("/api/upload", tags=["upload"])
async def upload(file: UploadFile = File(...)):
    raw = await file.read()
    return upload_report(file.filename or "upload", raw)
