# 1 · Problem Framing Canvas
### Umuburo AI — Early-Warning & Prevention-Targeting System

---

## The problem (one sentence)
Rwanda has strong malaria surveillance infrastructure (HMIS/DHIS2, RapidSMS, weekly
bulletins), **but abnormal malaria increases are still recognised too late and too
coarsely** — the documented gaps are *insufficient granular data* and *delayed
decentralized use of data* — so districts respond **after** cases surge instead of
**before**.

## Why now (the trigger)
- National incidence **jumped from 45 → 76 per 1,000** between FY2023‑24 and FY2024‑25;
  cases nearly doubled to **~1.13 million**. This is a **resurgence**, not a steady state.
- ~**15 districts carry ~87%** of the burden — the problem is highly localised.
- Transmission is **seasonal and predictable** (peaks after the rains, ~May/June & ~Nov/Dec)
  and **rainfall predicts cases ~8 weeks ahead** — yet that lead time is not operationalised.

## What we are NOT claiming
We do **not** claim Rwanda lacks a surveillance system. It has an excellent one. Our
innovation is an **AI intelligence layer on top of it** that:
1. detects *abnormal* patterns earlier and at finer (sector) granularity, and
2. turns the lead time into **pre-season prevention action**, not just alerts.

## Reframed opportunity
> "What does *normal* malaria activity look like this week, where is the rise *abnormal*,
> and where should we put prevention effort **before** the season starts?"

## Target users & the job to be done
| User | Job to be done |
|---|---|
| District health team / RBC MOPDD | "Tell me *early* and *specifically* where an abnormal rise is starting, and whether it's real." |
| Program planners | "Tell me *before the peak* which districts are most vulnerable so I can pre-position nets, IRS, RDTs and CHWs." |
| CHW supervisors | "Show me the sector/village clusters so active case-finding is targeted, not blanket." |

## Solution in one line
An AI layer over existing Rwandan health data that **predicts and localises abnormal
malaria patterns**, **explains why**, and **recommends verified, pre-season prevention
actions** — moving districts from *reactive alerts* to *proactive protection*.

## Two capabilities (the shift from "alert" to "solution")
1. **Reactive early warning** — anomaly detection + **1–4 week forecast** per district & sector (down to cell & village), with a verify‑before‑act workflow.
2. **Proactive prevention targeting** — a ranked pre‑season resource-allocation plan that combines predicted peak burden with prevention gaps (nets owned vs *used*, IRS spray status, care‑seeking), so **weak districts get help first**.

## Success metrics
- **Lead time**: abnormal rise flagged **≥ 2–4 weeks** before it would appear in routine monthly review.
- **Precision**: alerts confirmed as real by district teams (verify‑before‑act) — target low false-alarm rate.
- **Coverage of usage gap**: reduction in the *own‑but‑don't‑use* net gap in targeted districts.
- **Outcome (long‑term)**: cases averted / incidence reduction in pilot districts (Huye, Kirehe) vs comparison districts.

## Scope
- **Pilot**: Huye (Southern) & Kirehe (Eastern) — high‑burden, with sector‑level drill‑down.
- **Prototype data**: public RBC figures (calibrated synthetic). **Production**: authorised DHIS2/RapidSMS/eLMIS.

## Constraints & assumptions
- Facility‑level DHIS2 data is **not public** → prototype uses calibrated data; production needs an MoH/RBC data‑sharing agreement.
- Must be **explainable** and **human‑in‑the‑loop** — AI recommends, people verify, then act.
- Must respect **data protection** (Rwanda Law No. 058/2021) and run inside authorised systems.
