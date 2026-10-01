# 4 · Solution & Technical Architecture Canvas
### Umuburo AI — Early-Warning & Prevention-Targeting System

## Architecture at a glance
```
        PUBLIC DATA                        AUTHORISED DATA (production)
   RBC reports · bulletins            DHIS2/HMIS · IDSR · RapidSMS/SISCom · eLMIS
   climate (NASA/NOAA/Met)                         │
            │                                      │
            └───────────────┬──────────────────────┘
                            ▼
                 ┌──────────────────────┐
                 │   DATA INGESTION     │  loaders + validation + completeness check
                 └──────────┬───────────┘
                            ▼
                 ┌──────────────────────┐
                 │  FEATURE ENGINEERING │  lags, 8-wk rainfall lag, seasonality, positivity
                 └──────────┬───────────┘
             ┌──────────────┼─────────────────────────────┐
             ▼              ▼                              ▼
   ┌──────────────┐ ┌───────────────┐          ┌──────────────────────┐
   │ SEASONAL     │ │ FORECAST      │          │ PREVENTION GAP        │
   │ BASELINE +   │ │ (ridge → GBM/ │          │ SCORING               │
   │ ANOMALY z    │ │  LSTM)        │          │ (own vs use, IRS…)    │
   └──────┬───────┘ └──────┬────────┘          └──────────┬───────────┘
          └──────┬─────────┘                              │
                 ▼                                        ▼
        ┌─────────────────┐                    ┌────────────────────────┐
        │  RISK ENGINE    │                    │ RESOURCE ALLOCATION     │
        │ LOW/WATCH/HIGH  │                    │ ranked pre-season plan  │
        │ + explanation   │                    │ (who gets what, why)    │
        └────────┬────────┘                    └───────────┬────────────┘
                 └───────────────┬──────────────────────────┘
                                 ▼
                      ┌────────────────────────┐
                      │ VERIFY-BEFORE-ACT       │  human confirms → then act
                      │ ALERTS + DASHBOARD API  │
                      └───────────┬─────────────┘
                                  ▼
                 District teams · RBC MOPDD · CHW supervisors
```

## The AI, module by module
| # | Module | Method (prototype) | Production upgrade |
|---|---|---|---|
| 1 | **Seasonal baseline** | 52‑week seasonal index rescaled by a 12‑week trailing trend (nowcast‑safe: excludes the last 2 weeks) | Farrington/GLM seasonal expectation |
| 2 | **Anomaly detection** | Residual **z‑score control chart** with a count‑appropriate limit (`max(0.13·expected, √expected, 3)`); abnormal = z ≥ 2 for ≥ 2 wks | CUSUM / EARS C1‑C3, Farrington flexible |
| 3 | **Forecast** | **Ridge regression** trained per district on lags + 8‑wk‑lag rainfall + temperature + seasonality (pure‑Python normal equations) | Gradient boosting, Prophet, or LSTM; probabilistic intervals |
| 4 | **Risk engine** | Explainable fusion of anomaly z, short‑term trend, forecast trajectory, rainfall lead, positivity → LOW/WATCH/HIGH **+ driver list** | Learned classifier with SHAP explanations |
| 5 | **Prevention‑gap scoring** | Weighted gaps: net ownership, **net usage (behaviour)**, IRS spray status, care‑seeking, reporting | Coverage surveys (DHS/MIS) + geospatial layers |
| 6 | **Resource allocation** | Vulnerability = predicted peak × (1 + gap) → ranked interventions + illustrative cases‑avertible | Optimisation under budget/logistics constraints |
| 7 | **Verify‑before‑act** | Every alert ships with a human verification checklist before any action | Workflow + audit trail in the ops system |

## Tech stack
- **Prototype (this repo):** Python 3 standard library only (`generate_dataset.py`, `ai_pipeline.py`) → JSON → a **static, offline dashboard** (HTML/CSS/vanilla‑JS, hand‑drawn SVG charts & map). Zero install, opens with a double‑click.
- **Production:** FastAPI service + scheduled jobs pulling DHIS2 (API), RapidSMS, eLMIS; PostgreSQL/TimescaleDB; the same model modules as installable packages; dashboard served behind MoH SSO; deployed **inside the MoH/RBC environment**.

## Why this design
- **Explainable over black‑box** — health officials must see *why*, and defend the action.
- **Runs on data that already exists** — no new collection burden on CHWs.
- **Aggregate‑first** — no PII needed → privacy‑by‑design and easier approval.
- **Reproducible & portable** — deterministic pipeline, no heavy dependencies; the method transfers to other diseases (cholera, measles) on the same DHIS2 backbone.

## Data flow contract (prototype)
`data/*.csv → model/ai_pipeline.py → dashboard/data/*.json (+ data.js) → dashboard/index.html`

## Deployment & scaling path
1. **Pilot** (Huye, Kirehe) on authorised weekly feeds, sector granularity.
2. **National** roll‑out across all 30 districts (the pipeline is district‑agnostic).
3. **Multi‑disease** reuse of the anomaly/forecast core on the same HMIS backbone.
