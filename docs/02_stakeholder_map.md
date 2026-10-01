# 2 · User & Stakeholder Map
### Umuburo AI — Early-Warning & Prevention-Targeting System

Malaria data in Rwanda flows **village → health centre → district → national (RBC)**.
Our system plugs into that flow and serves each level with the decision it actually makes.

## Three user groups (who the AI serves)
1. **District malaria surveillance & response teams — *primary users.*** Use the main dashboard; analyse forecasts & risk maps; investigate AI alerts; coordinate local response.
2. **RBC / MOPDD — *national users.*** Monitor malaria risk across districts; compare trends & forecasts; identify emerging hotspots; support national planning & oversight.
3. **Community Health Workers (CHWs) — *community users.*** Receive predictions/alerts for their local area; report suspected or unusual increases; support targeted community response.

> **Mission:** the AI learns from historical and current malaria surveillance data to forecast where malaria activity is likely to increase over the next **1–4 weeks**, explain the factors behind the prediction, and give district health teams an early signal to **verify and act**.

```
        DATA UP  ↑                                      ↓ INTELLIGENCE DOWN
  ┌─────────────────────────────────────────────────────────────────────┐
  │  CHW / Umujyanama w'ubuzima  ──RapidSMS/SISCom──►  Health Centre       │
  │        (RDT + treat)                               (verify, aggregate) │
  │                                     │ DHIS2                            │
  │                                     ▼                                  │
  │                              District Hospital / District Health Team  │
  │                                     │ DHIS2                            │
  │                                     ▼                                  │
  │                         RBC — Malaria & OPD Division (MOPDD) / MoH      │
  └─────────────────────────────────────────────────────────────────────┘
                 ▲  AI EARLY-WARNING + PREVENTION LAYER  ▲
        (reads the flow, returns risk, forecast, and a targeted action plan)
```

## Primary users (they act on the output)
| Stakeholder | Role in the flow | What the AI gives them | Decision it enables |
|---|---|---|---|
| **RBC MOPDD analysts** | National surveillance & policy | National risk map, ranked district vulnerability, resurgence tracking | Where to direct national resources & campaigns |
| **District Health Team (District Hospital)** | Supervises health centres | District & **sector** risk, anomaly + forecast, verify‑before‑act steps | Whether/where to launch a response *now* |
| **Health Centre data manager / Community Health Officer** | Verifies & enters data | Alert with the exact sector + verification checklist | Confirm the signal, check register & stock |
| **Program planners (MoH/RBC + partners)** | Nets, IRS, RDT/ACT supply | Pre‑season allocation plan (net top‑up, IRS, behaviour campaign, CHW surge) | Pre‑position prevention **before** the peak |

## Frontline & community
| Stakeholder | Relationship to system |
|---|---|
| **CHWs (Abajyanama b'ubuzima)** | Data *source* (RapidSMS/SISCom) **and** action *agents* (active case‑finding, net‑use promotion) in targeted sectors |
| **Households** | Ultimate beneficiaries; the "own‑but‑don't‑use" net gap makes them a *behaviour* target, not just a *coverage* number |
| **Patients (esp. under‑5, pregnant women)** | Highest‑risk groups the earlier response protects |

## Enabling & governance stakeholders
| Stakeholder | Interest |
|---|---|
| **Ministry of Health (MoH)** | Policy owner; data governance; sign‑off on production data access |
| **HMIS / DHIS2 administrators** | Provide authorised data feeds; integration & security |
| **eLMIS team** | Stock data for verify‑before‑act (RDT/ACT availability) |
| **Rwanda Meteorology Agency / NASA‑NOAA** | Rainfall & temperature inputs (the 8‑week lead predictor) |
| **Data Protection Office** | Compliance with Law No. 058/2021 |
| **Funding partners (Global Fund, PMI)** | Efficiency of prevention spend; measurable impact |

## Stakeholder power / interest (who to win first)
- **High power, high interest → co-design partners:** RBC MOPDD, MoH, District Health Teams. *Win these first.*
- **High interest, enabling:** HMIS/DHIS2 & eLMIS teams, Met agency, CHW supervisors.
- **High power, keep aligned:** Data Protection Office, funding partners.
- **Beneficiaries to design *for*:** CHWs, households, high-risk patients.

## Key insight
The same pipe carries data **up** and intelligence **down**. Value is created only when the
intelligence returns to the **district and health‑centre** level in time to act — which is
exactly the "delayed decentralized use of data" gap RBC itself documents.
