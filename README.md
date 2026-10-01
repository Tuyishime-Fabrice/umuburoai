# 🦟 Umuburo AI — Malaria Surveillance Signals

Umuburo AI turns weekly district malaria surveillance data into **explainable signals** for
district health teams. It compares each week with its recent baseline, flags unusual
increases, shows the evidence and the data quality behind each flag, and leaves the
decision to people.

> **Data → analysis → signal → explanation → human verification → action.**
> The system flags a signal; the health team verifies and decides. A signal is not a
> confirmed outbreak, and nothing is forecast.

---

## Single source of truth

All current analytics are calculated from one file:

```
backend/data/rwanda_malaria_surveillance_testing_data.csv
```

- 104 weekly records (52 weeks × 2 districts: **Nyagatare** and **Muhanga**), 6 Oct 2025 – 28 Sep 2026.
- 35 columns: cases (suspected, tested, confirmed, severe, deaths, admissions), rates,
  climate (rainfall, temperature, humidity, NDVI), vector indices, mobility, reporting
  completeness and delay, facilities, ACT/RDT stock, stockouts, bed occupancy, bed-net
  and IRS coverage, 4-week averages and an `alert_label` column.
- District-level aggregates only — no patient-level data.

Both the web app and the API read this file at runtime, re-reading it when it changes.
Replacing the file updates every figure. There is no other data source and no live
connection to DHIS2, eLMIS or any other system.

## The pipeline

Implemented in `web/lib/surveillance/pipeline.ts` and, identically, in
`backend/analytics.py` (their outputs are compared value-for-value).

| Stage | What happens |
|---|---|
| Validation | Required columns, valid dates/districts, duplicates, numeric values, value ranges, logical checks (confirmed ≤ tested ≤ suspected; reporting ≤ expected facilities), consistency of the file's derived columns, weekly continuity |
| Cleaning | Invalid rows dropped, invalid values set to missing — never filled in |
| Feature preparation | Weekly series per district, or all districts combined (counts summed, rates recomputed from sums, indices averaged) |
| Trend analysis | 4-week moving average |
| Baseline comparison | % change vs the average of the **previous** 4 weeks |
| Anomaly detection | z-score vs the previous 8 weeks |
| Risk signal | Rule-based: a case-based rule (cases ≥ 25% above baseline, or z ≥ 2) is required; with one more rule (positivity +3 pp, severe cases up) → **Elevated signal**, alone → **Watch** |
| Explainable alert | Each alert lists the rules that fired with their values, environmental context (only when the data supports it) and data-confidence notes |
| Human review | Every alert carries a verification checklist; the team marks it verified or not confirmed |

Environmental relationships are reported as lagged correlations (0–8 weeks) — associations
within this dataset, not causes, and not used to predict cases.

## Run locally

```bash
# web app (runs the pipeline itself)
cd web && npm ci && npm run dev                          # http://localhost:3000

# API (optional)
cd backend && pip install -r requirements.txt \
  && uvicorn main:app --port 8000                        # http://localhost:8000/docs
```

Demo accounts (password `demo`): `national@umuburo.rw` (all districts),
`nyagatare@umuburo.rw`, `muhanga@umuburo.rw` (own district only).

Set `API_URL` on the web app to have it fetch analytics from the API; if the API is
unreachable it falls back to its own identical pipeline. `SURVEILLANCE_CSV` overrides the
dataset path for either service.

## API

| Endpoint | |
|---|---|
| `GET /api/analytics?district=All\|Nyagatare\|Muhanga` | Full analytics for a scope |
| `GET /api/alerts?district=…` | Alerts only |
| `GET /api/data-quality?district=…` | Validation and data-quality summary |
| `GET /api/dataset` | The source CSV, unchanged |
| `POST /api/upload` | Validate a CSV against the surveillance format (nothing is stored) |

## Deploy (Railway)

- **Web:** repo root — uses the root `Dockerfile` and `railway.json` (the image includes the CSV).
- **API:** Root Directory `/backend`, config file `/backend/railway.json`.
- Optional: set `API_URL` on the web service to the API's public URL.

## Repository

```
backend/
  data/rwanda_malaria_surveillance_testing_data.csv   ← the dataset
  analytics.py      ← pipeline (Python)
  main.py           ← FastAPI service
web/
  lib/surveillance/ ← pipeline (TypeScript), loader, types
  app/(dashboard)/  ← District Monitor, Signal Analysis, Surveillance Alerts,
                      Health-System Context, Environment & Data Quality
docs/, *.pptx       ← hackathon submission documents (written for the earlier prototype)
```

### Limitations

- One season of data for two districts; thresholds are fixed rules, not a trained model.
- Review decisions on alerts are kept only in the browser tab.
- The demo sign-in is a prototype gate, not a production identity system.
