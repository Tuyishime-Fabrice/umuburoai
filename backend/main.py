"""Umuburo AI — malaria surveillance analytics API (FastAPI).

A stateless analytics engine. POST /api/analyze takes uploaded surveillance datasets
(CSV text) and a scope (national, a province or a district) and returns the full
analysis: validation, weekly series, signals, alerts, relationships, prioritisation,
backtested projection and data quality (see analytics.py).

GET endpoints analyse the reference dataset bundled in data/ for quick inspection.

Run:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000
Then open http://localhost:8000/docs
"""
from __future__ import annotations

import os
from datetime import date
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

import analytics

DATASET_FILE = "rwanda_malaria_surveillance_testing_data.csv"
DATA_PATH = os.environ.get("SURVEILLANCE_CSV") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "data", DATASET_FILE
)
MAX_UPLOAD_BYTES = 25 * 1024 * 1024

app = FastAPI(
    title="Umuburo AI API",
    version="3.0.0",
    description=(
        "Malaria surveillance analytics for Rwanda's 30 districts. Uploaded weekly district "
        "surveillance data is validated, combined and analysed: baseline comparison, anomaly "
        "detection, explainable signals for verification, environmental relationships, "
        "prevention prioritisation and a backtested short-term projection."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_cache: dict = {}


def reference_datasets() -> list[dict]:
    """The bundled reference dataset as pipeline input (re-read when the file changes)."""
    try:
        st = os.stat(DATA_PATH)
    except FileNotFoundError:
        raise HTTPException(503, f"Reference dataset not found at {DATA_PATH}")
    key = (DATA_PATH, st.st_mtime_ns, st.st_size)
    if _cache.get("key") != key:
        with open(DATA_PATH, encoding="utf-8") as f:
            _cache["datasets"] = [{"id": "reference", "name": DATASET_FILE, "csv": f.read()}]
        _cache["key"] = key
    return _cache["datasets"]


def check_today(today: Optional[str]) -> str:
    if not today:
        return date.today().isoformat()
    if not analytics.is_valid_date(today):
        raise HTTPException(422, "today must be a YYYY-MM-DD date")
    return today


class DatasetIn(BaseModel):
    id: str
    name: str
    csv: str
    restrictDistrict: Optional[str] = None


class AnalyzeRequest(BaseModel):
    datasets: list[DatasetIn] = Field(default_factory=list)
    scope: Optional[str] = "national"
    today: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


# --------------------------------------------------------------------------- routes
@app.get("/", tags=["meta"])
def root():
    return {
        "product": "Umuburo AI",
        "purpose": "Flag unusual malaria surveillance signals for verification by health teams.",
        "districts": len(analytics.DISTRICTS),
        "docs": "/docs",
    }


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}


@app.post("/api/analyze", tags=["analytics"])
def analyze(req: AnalyzeRequest):
    """Analyse uploaded datasets (in upload order) for a scope."""
    total = sum(len(d.csv) for d in req.datasets)
    if total > MAX_UPLOAD_BYTES * 8:
        raise HTTPException(413, "Datasets too large")
    combined = analytics.combine([d.model_dump() for d in req.datasets])
    return analytics.analyze(combined, req.scope, check_today(req.today))


@app.get("/api/analytics", tags=["reference data"])
def get_analytics(
    scope: Optional[str] = Query(None, description="national, province:<name> or district:<name>"),
    district: Optional[str] = Query(None, description="Deprecated alias for a district or province name"),
    today: Optional[str] = Query(None, description="Reference date (YYYY-MM-DD) for data freshness"),
):
    combined = analytics.combine(reference_datasets())
    return analytics.analyze(combined, scope or district or "national", check_today(today))


@app.get("/api/alerts", tags=["reference data"])
def get_alerts(scope: Optional[str] = Query("national"), today: Optional[str] = Query(None)):
    a = analytics.analyze(analytics.combine(reference_datasets()), scope, check_today(today))
    return {"scope": a["scope"], "alerts": a["alerts"]}


@app.get("/api/data-quality", tags=["reference data"])
def get_quality(scope: Optional[str] = Query("national"), today: Optional[str] = Query(None)):
    a = analytics.analyze(analytics.combine(reference_datasets()), scope, check_today(today))
    return {"sources": a["sources"], "quality": a["quality"]}


@app.get("/api/dataset", tags=["reference data"])
def download_dataset():
    """The bundled reference CSV, unchanged."""
    reference_datasets()
    return FileResponse(DATA_PATH, media_type="text/csv", filename=DATASET_FILE)


@app.get("/api/districts", tags=["reference data"])
def list_districts():
    return analytics.DISTRICTS


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


# --------------------------------------------------------------------------- upload check
def upload_report(name: str, raw: bytes, restrict_district: Optional[str]) -> dict:
    """Validate an uploaded file against the surveillance format. Nothing is stored here."""
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    size_kb = int(analytics.rnd(len(raw) / 1024, 0))
    if ext != "csv":
        fmt = ext.upper() or "Unknown"
        return {
            "kind": "unsupported", "format": fmt, "fileName": name, "sizeKB": size_kb,
            "note": "Only CSV files in the weekly surveillance format can be imported.",
            "issues": [{"level": "error", "label": "Format", "detail": f"{fmt} files are not supported."}],
        }
    text = raw.decode("utf-8", "replace")
    v = analytics.validate_dataset({"id": "upload", "name": name, "csv": text, "restrictDistrict": restrict_district})
    table = analytics.parse_csv(text)
    header = v["header"]
    preview = [
        {header[i]: (r[i] if i < len(r) else "") for i in range(len(header))}
        for r in table[1:9]
    ]
    return {"kind": "dataset", "format": "CSV", "fileName": name, "summary": v["summary"], "preview": preview}


@app.post("/api/validate", tags=["upload"])
async def validate(file: UploadFile = File(...), restrict_district: Optional[str] = Form(None)):
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File exceeds 25 MB")
    return upload_report(file.filename or "upload", raw, restrict_district)
