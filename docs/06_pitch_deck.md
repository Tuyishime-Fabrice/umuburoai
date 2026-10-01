# 6 · Final Demo Pitch Deck
### Umuburo AI — Early-Warning & Prevention-Targeting System
*Predict · Localise · Prevent — turning Rwanda's surveillance data into action before the season.*

> Speaker notes are in _italics_. One `##` = one slide. Aim: ~5–7 minutes.

---

## Slide 1 — Title
**Umuburo AI — Early-Warning & Prevention System**
AI for Good · Public Hackathon
*Team [name]. We built an AI layer that helps Rwanda act on malaria **before** cases surge — not after.*

---

## Slide 2 — The wake-up call
- Rwanda's malaria incidence **jumped 45 → 76 per 1,000** in one year (FY2023‑24 → FY2024‑25).
- Cases nearly **doubled to ~1.13 million.**
- **~15 districts carry ~87%** of the burden.
*This is a resurgence. The system that nearly eliminated malaria is under pressure again — timing and targeting now matter more than ever.*

---

## Slide 3 — The real problem (framed honestly)
Rwanda **already has** excellent surveillance — HMIS/DHIS2, RapidSMS, weekly bulletins.
The documented gaps are:
> **"insufficient granular data"** and **"delayed decentralized use of data"** — *RBC's own reports.*

So abnormal rises are seen **too late** and **too coarsely**, and districts respond **after** the surge.
*We're not replacing the system. We're adding the missing intelligence layer on top of it.*

---

## Slide 4 — The insight
Malaria in Rwanda is **predictable**:
- **Seasonal** — peaks after the rains (~May/June & ~Nov/Dec).
- **Rainfall predicts cases ~8 weeks ahead.**
- **Localised** — a handful of districts, and specific sectors within them.
> If it's predictable, we can act **before** it — if we can *see* it early and *specifically*.

---

## Slide 5 — Our solution
An AI layer over existing Rwandan health data that does **two** things:
1. **Early warning** — detects *abnormal* rises early, per district **and sector** (to cell & village), with a **1–4 week forecast** and a *why*.
2. **Prevention targeting** — a **pre‑season plan** for where to concentrate nets, IRS, RDTs and CHWs, so **weak districts get help first**.
> The shift: from **alerts** → to **solutions**.

---

## Slide 6 — Live demo (Overview)
*Open the dashboard.*
- National **risk map** — **Huye is HIGH**, pulsing red.
- KPIs: incidence **76/1,000**, active alerts, data completeness.
- National **anomaly chart**: actual vs the **expected seasonal baseline**, with the **AI forecast** for the next **1–4 weeks**.
*Everything you see is grounded in real published RBC figures.*

---

## Slide 7 — Live demo (Early Warning + granularity)
*Click Huye.*
- Huye: **+29% above expected**, anomaly **z = 3.1**, forecast rising — flagged **weeks before** the Nov/Dec peak.
- **Drill into sectors** → **Tumba sector is the hotspot** (z ≈ 7).
> This is the granularity the national view lacks: we don't just say "Huye" — we say **"Tumba sector, now."** Response becomes micro‑targeted.

---

## Slide 8 — Live demo (the differentiator: Prevention & Resources)
*Open Prevention & Resources.*
- Ranked **pre‑season allocation plan** by vulnerability = predicted peak × prevention gap.
- **Nyagatare #1** — net gap. **Kirehe** — *owns nets but only 67% use them* → **behaviour‑change campaign**, not more nets.
- Estimated **cases avertible** if we act on time.
> This directly answers: *"Do households have and actually **use** their protection — and where do we put more effort before the year starts?"*

---

## Slide 9 — How the AI works (explainable, not black-box)
1. **Seasonal baseline** — learns what *normal* looks like, rescaled to the current level.
2. **Anomaly detection** — control‑chart z‑score; abnormal = clears the limit for ≥ 2 weeks.
3. **Forecast** — regression on lags + **8‑week rainfall lag** + temperature + seasonality.
4. **Risk engine** — fuses the signals into LOW/WATCH/HIGH **with the drivers listed**.
5. **Allocation** — turns the forecast into a ranked action plan.
*Every number is explainable and defensible — essential in public health.*

---

## Slide 10 — Responsible & secure by design
- **Verify‑before‑act:** AI recommends → a health officer **verifies** (reporting completeness, positivity, stock) → **then act**. Never automatic.
- **Privacy:** aggregate‑only, **no patient identifiers**; aligned with **Rwanda Law No. 058/2021**; runs **inside** MoH/RBC systems.
- **Security:** encryption, role‑based access, full audit trail.
- **Equity:** help routed to the **most vulnerable** districts first.

---

## Slide 11 — Data reality (we're honest about it)
- **Prototype:** calibrated to **public** RBC figures (incidence, seasonality, coverage). *Not official statistics.*
- **Production:** the **same pipeline** reads **authorised DHIS2 / RapidSMS / eLMIS** — only the loader changes.
- **Ask:** a data‑sharing agreement for a **pilot in Huye & Kirehe**.

---

## Slide 12 — Impact & roadmap
**Impact:** earlier action (≥ 2–4 weeks lead), targeted prevention spend, cases averted in high‑burden districts.
**Roadmap:**
1. Pilot (Huye, Kirehe) on authorised feeds.
2. National roll‑out (pipeline is district‑agnostic — all 30 districts).
3. Reuse the engine for **other outbreak‑prone diseases** on the same DHIS2 backbone.
> **Predict · Localise · Prevent.** Same data. Earlier, sharper, life‑saving decisions.

---

## Appendix — Q&A ready
- *"Is the data real?"* → Calibrated to public RBC figures; production uses authorised DHIS2. Facility data isn't public — that's the realistic framing.
- *"Won't it false‑alarm?"* → Verify‑before‑act: a wrong alert costs a check, not a wrong intervention.
- *"How is this different from existing bulletins?"* → Earlier (weekly, forecast), finer (sector), and it prescribes **action**, not just numbers.
- *"Privacy?"* → No PII; aggregate counts only; Law 058/2021 compliant.
