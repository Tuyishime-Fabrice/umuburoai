# 🦟 Umuburo AI — Malaria Surveillance Platform

Umuburo AI turns weekly district malaria surveillance reports into **explainable
early-warning signals** for national and district health teams across Rwanda's
**30 districts**. Teams upload weekly data, the platform validates and analyses it, flags
unusual patterns with the evidence behind them, and records each team's verification
decision.

> **Data → analysis → signal → explanation → human verification → action.**
> A signal is a flag to verify, not a confirmed outbreak.

---

## What the platform does

| Area | What users get |
|---|---|
| **Situation Overview** | Latest fully reported week, national map of district signals, signals awaiting verification, generated key findings, trend, reporting coverage by province, recent imports |
| **Analytics** | A catalogue of 23 analyses — users choose what to run (or run the ones suggested for the latest data) for the nation, a province or a district. Each analysis explains how to read it, states what the data shows and lists recommended actions with the condition that triggered them; a summary collects the actions across the selected analyses |
| **Alerts & Verification** | One alert per district-week where a case-based rule fired, with the rules, values, context, data-confidence notes and a checklist; decisions (verified / under investigation / not confirmed) are recorded with reviewer and time |
| **Districts** | All 30 districts by province: reporting status, freshness, latest signal; a profile per district |
| **Data Management** | Landing page after sign-in. Upload → validate → import CSV files; dataset register (who, when, period, districts); removal; combined data-quality report; CSV template |
| **Settings & Methods** | Account, processing status, and every rule and threshold |

### Analysis catalogue
- **Surveillance burden:** confirmed cases trend · testing cascade · test positivity · incidence per 1,000 · severity, admissions and deaths · malaria share of outpatient visits
- **Early warning:** deviation from recent baseline · anomaly detection (z-score) · weekly signal evaluation · short-term projection (backtested)
- **Environment & vectors:** rainfall and cases · temperature and humidity · mosquito and larval density · NDVI and mobility · lagged relationships (0–8 weeks)
- **Health system:** reporting completeness and timeliness · facility reporting · ACT/RDT stock and stockouts · admissions and bed occupancy
- **Prevention:** bed-net and IRS coverage · prevention prioritisation
- **Comparison & data quality:** district comparison · data quality

Analyses that need columns a dataset did not supply are shown as unavailable, never estimated.
Recommended actions (`web/lib/surveillance/interpret.ts`) are prompts for the team to review; each states the threshold it uses.

### How signals are produced
`web/lib/surveillance/pipeline.ts` (identical implementation in `backend/analytics.py`;
outputs are compared value for value):

1. **Validation & cleaning** — required columns (`week_start`, `district`, `confirmed_malaria_cases`; all other surveillance columns optional), valid dates, recognised Rwandan districts, duplicates, numeric values, ranges, logic (confirmed ≤ tested ≤ suspected; reporting ≤ expected facilities), consistency of derived columns, weekly continuity. Missing values are excluded, never filled in.
2. **Combination** — imported datasets are merged in upload order; for a district-week supplied twice, the most recent upload wins.
3. **Baseline & anomaly** — change vs the average of the previous 4 weeks; z-score vs the previous 8 weeks.
4. **Signal** — a case-based rule is required (cases ≥ 25% above baseline, or z ≥ 2). Case-based rule + another rule (positivity +3 pp, severe cases up) → **Elevated signal**; alone → **Watch**. Province and national signals are only evaluated on weeks every reporting district has submitted.
5. **Context & confidence** — rainfall/vector context only when the data supports it; reporting completeness, delays, missing facilities and stale data are shown as cautions.
6. **Projection** — ridge regression, backtested with rolling origins; shown only for horizons where it beats the naive estimate (next week = this week). With the current data it does not, so no projection is displayed.

## Data

- Upload weekly district surveillance CSVs on **Data Management** (template provided).
- The platform starts with one dataset imported: `backend/data/rwanda_malaria_surveillance_testing_data.csv` (Nyagatare and Muhanga, 52 weeks). Other districts appear as *not reporting* until data is uploaded.
- District users can only see and submit data for their own district.

## Run locally

```bash
cd web && npm ci && npm run dev                          # http://localhost:3000
cd backend && pip install -r requirements.txt \
  && uvicorn main:app --port 8000                        # http://localhost:8000/docs (optional)
```

Demo accounts (password `demo`): `national@umuburo.rw` (all districts),
`nyagatare@umuburo.rw`, `muhanga@umuburo.rw` (own district).

| Variable | Service | Purpose |
|---|---|---|
| `DATA_DIR` | web | Where imported datasets and the verification log are stored (default `./storage`) |
| `API_URL` | web | Send analyses to the API service; falls back to the identical local pipeline if unreachable |
| `SURVEILLANCE_CSV` | both | Path to the initial dataset |

## Deploy (Railway)

- **Web:** repo root (root `Dockerfile` + `railway.json`). **Attach a volume mounted at `/app/storage`** so uploaded datasets and verification decisions survive redeploys.
- **API:** Root Directory `/backend`, config file `/backend/railway.json`.
- Optional: set `API_URL` on the web service to the API's public URL.

## API

| Endpoint | |
|---|---|
| `POST /api/analyze` | `{datasets: [{id, name, csv}], scope, today}` → full analysis (stateless) |
| `POST /api/validate` | Validate a CSV against the surveillance format |
| `GET /api/analytics?scope=national\|province:<name>\|district:<name>` | Analysis of the bundled reference dataset |
| `GET /api/districts` | Rwanda's 30 districts and provinces |

## Repository

```
backend/   analytics.py (pipeline) · main.py (FastAPI) · data/ (initial dataset)
web/       lib/surveillance/ (pipeline, catalogue, insights) · lib/store.ts (datasets, reviews)
           app/(dashboard)/ (overview, analytics, alerts, districts, data, settings)
           lib/geo/ (district boundaries: geoBoundaries, CC BY 4.0)
docs/, *.pptx   hackathon submission documents (written for the earlier prototype)
```

### Limitations
- Signals use fixed, documented rules on the uploaded data; they are not a trained model.
- The demo sign-in is a prototype gate, not a production identity system.
