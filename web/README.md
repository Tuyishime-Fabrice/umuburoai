# Umuburo AI

**Forecast malaria risk before it becomes an outbreak.**

An AI-powered malaria early-warning platform that turns surveillance, historical,
geographic and climate data into clear, three-week risk forecasts for the pilot
districts **Kirehe** and **Nyamasheke**. Built by team **CodeNova**.

- Professional **Next.js + TypeScript + Tailwind + shadcn/ui** frontend (dark
  health-intelligence UI, responsive left sidebar, Recharts, Leaflet).
- A light **FastAPI** backend that reuses the proven Python forecasting
  pipeline's output, with interactive docs at `/docs`.
- Two brand colours only: **gold + white** on deep navy. Risk scale: green
  (normal) · amber (watch) · red (high).

> Prototype data, calibrated to the national Malaria & NTD Annual Report
> (FY2023-24). Every alert lists a verification step **before** any action —
> the model informs, people decide.

---

## Run the frontend (main app)

Requires **Node 22+**.

```bash
cd web
npm install
npm run dev        # http://localhost:3000
```

Landing page → **Get Started / Sign In** → dashboard.

### Demo accounts (password: `demo`)

| Email                    | Role                | Scope       |
| ------------------------ | ------------------- | ----------- |
| national@umuburo.rw      | National coordinator| All districts |
| kirehe@umuburo.rw        | District team       | Kirehe      |
| nyamasheke@umuburo.rw    | District team       | Nyamasheke  |

The login screen also has one-click buttons for each. Any email + password also
works (defaults to the national view).

The app is self-contained: forecasts and upload validation run through Next.js
route handlers (`/api/forecast`, `/api/upload`) reading the bundled dataset, so
the demo works with **no backend running**.

---

## Run the Python API (optional — for judges / `/docs`)

Requires **Python 3.11+** (tested on 3.14).

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000   # http://localhost:8000/docs
```

Endpoints: `/api/dashboard`, `/api/districts`, `/api/district/{name}`,
`/api/forecast`, `/api/upload`, `/api/alerts`, `/api/reports`, `/api/auth/login`.
It returns the **same** results as the frontend (Nyamasheke → HIGH 87%,
Kirehe → WATCH 56%).

---

## Data

`web/data/` (bundled for the frontend) and `backend/data/` (served by the API)
are generated from the pipeline in `../model` + `../data`. To regenerate after
re-running the pipeline:

```bash
python web/scripts/export_data.py
```

The exporter also scrubs source-specific branding to neutral phrasing.

## What the AI does

`Data → Baseline & anomaly (z-score control chart) → Climate lag (rainfall leads
cases ~8 wks) → Ridge-regression 1–3 week forecast → Explainable risk score →
Early warning.` The forecast values come from the pipeline; the app presents them
with the contributing factors and the checks to run first.
