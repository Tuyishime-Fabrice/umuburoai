# 🦟 Umuburo AI — Early-Warning & Prevention-Targeting System

**AI for Good · Public Hackathon** — an AI layer over Rwanda's existing malaria
surveillance that learns from historical and current data to **forecast where malaria
activity is likely to increase over the next 1–4 weeks**, explain the factors *why*, and
give district health teams an **early signal to verify and act** — plus a **pre-season
prevention plan** so weak areas get help before cases surge.

> **Predict · Localise · Prevent.**

**Three user groups:** **District malaria teams** (primary — investigate & respond) ·
**RBC / MOPDD** (national oversight) · **CHWs** (community reporting & action).

---

## Why this matters
Rwanda's malaria incidence **jumped from 45 → 76 per 1,000** (FY2023‑24 → FY2024‑25),
cases nearly doubling to **~1.13M**, with **~15 districts carrying ~87%** of the burden.
Rwanda already has strong surveillance (HMIS/DHIS2, RapidSMS, weekly bulletins); the
documented gaps are **"insufficient granular data"** and **"delayed decentralized use of
data."** This project fills exactly those gaps — as an intelligence layer *on top of* the
existing system, not a replacement.

## What it does
1. **Early warning** — per‑district **and sector** anomaly detection + **1–4 week forecast**, with explainable drivers and a **verify‑before‑act** workflow.
2. **Prevention targeting** — a ranked, pre‑season **resource‑allocation plan** combining predicted peak burden with prevention gaps (nets owned vs *actually used*, IRS spray status, care‑seeking) so **weak districts get help first**.

---

## Quick start (zero install)

```bash
# 1) generate the (realistic, reproducible) dataset
python data/generate_dataset.py

# 2) run the AI pipeline  ->  writes dashboard/data/*.json  + dashboard/data.js
python model/ai_pipeline.py

# 3) open the dashboard  (just double-click it — no server needed)
#    dashboard/index.html
```

- **Requirements:** Python 3 (standard library only — *no pandas / numpy / sklearn*). A modern browser.
- The dashboard loads its data via `<script src>` (not `fetch`), so it works straight from `file://` — **double-click `dashboard/index.html`**.

---

## The demo story (what to show judges)
1. **Sign in (credential login)** — a username + password form with **7 demo accounts across every level**: Super User, RBC National, District (Huye/Kirehe), Sector, Cell, Village CHW. Click a demo account to autofill; each sees only its authorised scope (RBAC). e.g. `rbc.national` / `rbc@2026`, or `admin` / `admin@123`.
2. **Overview (national)** — risk map with **Huye HIGH** (pulsing red); incidence 76/1,000; national anomaly + **1–4 week forecast**.
3. **Early Warning drill-down** — **Rwanda → Huye → Tumba sector → Tumba A cell → village**. Huye is +29% / z≈3.1 ahead of the Nov/Dec peak; Tumba is the hotspot; the village view shows **households own nets but only 57% use them**.
4. **Prevention & Resources** — ranked pre‑season plan (**Kirehe**: nets owned, low usage → behaviour campaign); est. cases avertible. Sector role sees a **household prevention register**.
5. **Alerts** — verify‑before‑act cards (evidence → verification step → action).
6. **Access & Permissions** — what every role can and cannot see. **Model & Data** — method, sources, security.
7. **Climate** — each node shows the rainfall (8‑wk lead) + temperature driver; `python data/fetch_climate.py` pulls **real** NASA POWER climate for a pilot district.

## Submission deliverables (hackathon annexes)
Filled PowerPoint decks for team **CodeNova** (challenge owner **RBC**), logo included:
- `CodeNovaRBC6ProblemFramingCanvas.pptx` (Annex A — provided by the team)
- `CodeNovaRBC6UserStakeholderMap.pptx` (Annex B)
- `docs/03_data_reality_check.md` (Annex C — no template provided; markdown)
- `CodeNovaRBC6SolutionArchitecture.pptx` (Annex D)
- `CodeNovaRBC6ResponsibleAIChecklist.pptx` (Annex E)
- `CodeNovaRBC6FinalDemo.pptx` (Annex H)

The `docs/*.md` files hold the same content as source/backup.

---

## Repository structure
```
codenava/
├─ README.md                     ← you are here
├─ data/
│  ├─ generate_dataset.py        ← builds the surveillance dataset (calibrated to RBC figures)
│  ├─ sources.md                 ← real data sources + the facts baked in
│  ├─ malaria_surveillance_district.csv   (generated)
│  └─ malaria_surveillance_sector.csv     (generated)
├─ model/
│  └─ ai_pipeline.py             ← baseline · anomaly · forecast · risk · allocation → JSON
├─ dashboard/
│  ├─ index.html · styles.css · app.js     ← offline dashboard (RBC navy/gold)
│  ├─ data.js                    (generated — the bundle the dashboard loads)
│  └─ data/*.json                (generated — same data, API-style)
└─ docs/                         ← submission canvases
   ├─ 01_problem_framing_canvas.md
   ├─ 02_stakeholder_map.md
   ├─ 03_data_reality_check.md
   ├─ 04_technical_architecture.md
   ├─ 05_responsible_ai_checklist.md   (incl. data security & privacy)
   └─ 06_pitch_deck.md
```

## The AI, briefly (all explainable — see `docs/04`)
| Stage | Method (prototype) | Production upgrade |
|---|---|---|
| Seasonal baseline | 52‑wk seasonal index × 12‑wk trailing trend (nowcast‑safe) | Farrington/GLM |
| Anomaly detection | residual z‑score control chart, count‑appropriate limits | CUSUM / EARS |
| Forecast | ridge regression on lags + 8‑wk rainfall lag + temp + seasonality | GBM / LSTM |
| Risk engine | explainable fusion → LOW/WATCH/HIGH + drivers | learned + SHAP |
| Allocation | vulnerability = predicted peak × prevention gap → ranked plan | constrained optimisation |

## Responsible & secure by design
**Verify‑before‑act** (AI recommends → human verifies → then act) · **no patient PII**
(aggregate counts only) · aligned with **Rwanda Law No. 058/2021** · encryption + RBAC +
audit trail · equity‑first allocation. Full checklist in `docs/05`.

---

### ⚠️ Prototype note
Figures are **calibrated to public RBC statistics** to make the demo realistic — they are
**not official RBC data**. In production the identical pipeline reads authorised
**DHIS2 / RapidSMS / eLMIS** feeds; only the data loader changes. Sources in `data/sources.md`.
