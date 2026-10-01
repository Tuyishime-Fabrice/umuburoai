# 5 · Responsible AI & Data-Security Checklist
### Umuburo AI — Early-Warning & Prevention-Targeting System

This is a **public-health decision-support** system. The bar for safety, privacy and
accountability is high. This checklist is how we meet it.

## A. Human-in-the-loop (verify-before-act)
- [x] **AI recommends, people decide.** No alert triggers an automatic intervention.
- [x] Every alert ships with a **verification checklist** completed by a district/health‑centre officer *before* action:
  1. Confirm CHW **reporting completeness** — rule out a reporting artefact.
  2. Cross‑check the **facility register** and **test positivity**.
  3. Check **RDT/ACT stock in eLMIS**.
- [x] Only after verification is the **recommended action** taken; the action, the verifier, and the outcome are **logged**.
- [x] Officials can **override** any recommendation; overrides are recorded to improve the model.

## B. Explainability & transparency
- [x] Every risk level lists its **drivers** (anomaly %, trend, forecast, rainfall lead, prevention gap) — no black box.
- [x] The **method is documented** (docs/04) and the baseline distinguishes *seasonal normal* from *true anomaly*.
- [x] Uncertainty is shown (forecast is a range/estimate; "cases avertible" is explicitly **illustrative, not a guarantee**).
- [x] The dashboard is clearly labelled **PROTOTYPE** with a **not‑official‑RBC‑data** disclaimer.

## C. Fairness & equity
- [x] **Equity is the goal, not a risk:** the allocation engine sends help to the **most vulnerable / weakest‑prevention** districts first.
- [x] Count‑appropriate control limits so **low‑burden/rural** districts aren't ignored (small numbers handled correctly).
- [x] Watch for **surveillance bias**: better‑reporting districts can look "worse." Completeness is modelled and shown, not hidden.
- [ ] *Planned:* stratify performance by province/rural‑urban and review for systematic blind spots each season.

## D. Data privacy & protection
- [x] **Aggregate‑first / PII‑free:** the model runs on counts by district/sector/week — **no patient names or national IDs**.
- [x] **Data minimisation:** only the 5 core variables + prevention indicators are used; nothing personal is collected or stored.
- [x] Alignment with **Rwanda Law No. 058/2021** on personal data protection and MoH data‑governance policy.
- [x] Production runs **inside the MoH/RBC data environment** — no personal data leaves authorised systems.
- [ ] *Before pilot:* signed **data‑sharing agreement** and DPIA (Data Protection Impact Assessment) with MoH/RBC.

## E. Security controls
- [x] **Encryption** in transit (TLS) and at rest.
- [x] **Role‑based access control** — district users see their area; national users see all; least privilege by default.
- [x] **Authentication** via MoH SSO; no shared credentials.
- [x] **Full audit trail** — every data pull, alert, verification and action is logged and tamper‑evident.
- [x] **Segregation:** analytics layer is read‑only against source systems; it never writes back to clinical records.
- [ ] *Planned:* penetration test and security review before go‑live; key rotation policy.

## F. Safety & failure modes
- [x] **False alarms** → mitigated by the verify‑before‑act step (a wrong alert costs a check, not a wrong intervention).
- [x] **Missed events** → the seasonal baseline + rainfall lead reduce misses; monthly review remains as a backstop.
- [x] **Data outages** → forecast degrades gracefully (rainfall at lag is already observed; temperature falls back to normal); dashboard flags stale data.
- [x] **Model drift** → baseline auto‑tracks the resurgence; performance reviewed each season with district feedback.

## G. Accountability & governance
- [x] **Owner:** RBC MOPDD (clinical/programmatic) + MoH data governance.
- [x] Clear line: model output → **human verifier** → **accountable district decision‑maker**.
- [x] Change log & versioning on the model and dataset (deterministic, reproducible).
- [ ] *Planned:* an oversight review each malaria season (accuracy, equity, incidents).

Legend: **[x]** implemented / designed‑in for the prototype · **[ ]** planned before production pilot.
