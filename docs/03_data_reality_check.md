# 3 · Data Reality Check
### Umuburo AI — Early-Warning & Prevention-Targeting System

Honest assessment of **what data exists, what is accessible, what is not, and how we
handle the gap** — so the judges know the prototype is realistic and the production path
is credible.

## What data exists in Rwanda (and where)
| Dataset | System | Granularity | Timeliness |
|---|---|---|---|
| CHW case reports (RDT+, treatment) | **RapidSMS / SISCom** | Village → health centre | **Real‑time / weekly** |
| Routine facility morbidity/mortality | **HMIS / DHIS2** | Facility → district → national | Monthly (some weekly) |
| Notifiable disease / outbreak signals | **IDSR** (Integrated Disease Surveillance & Response) | Facility → district → national | Weekly |
| Weekly epidemiological signals | **RBC weekly bulletins** | District | Weekly |
| Annual burden, incidence, deaths | **RBC MOPDD reports** | District, national | Annual |
| RDT & ACT stock | **eLMIS** | Facility | Continuous |
| Rainfall / temperature | **Met Rwanda, NASA/NOAA** | Grid / district | Daily → weekly |

## Accessibility: the honest split
| Tier | Data | Access reality |
|---|---|---|
| ✅ **Public now** | RBC annual reports, weekly bulletins, incidence figures, climate data, published prevention‑coverage studies | Downloadable today → used to **calibrate the prototype** |
| 🔒 **Authorised only** | Facility‑level DHIS2, RapidSMS line data, eLMIS stock | Controlled by MoH/RBC → needs a **data‑sharing agreement** for production |
| 🚫 **Not needed** | Patient names / national IDs / personal identifiers | The model works on **aggregate counts** — we deliberately avoid PII |

## What we actually built the prototype on
- A **reproducible synthetic dataset** whose incidence (**76/1,000**), seasonality (bimodal, May/June & Nov/Dec), burden concentration (Gisagara/Bugesera high), prevention coverage (~89% ITN/IRS with realistic *usage* gaps), and rainfall‑at‑8‑week‑lag relationship all **match published RBC figures** (see `data/sources.md`).
- **Why synthetic:** facility‑level data isn't public. This is the *correct, realistic* framing for a hackathon — and the pipeline is written so **only the loader changes** in production.

## The 5 core variables (kept deliberately small)
`epi_week · district (·sector) · confirmed_cases · rainfall_mm · temp_avg_c`

## Derived AI features (engineered from the 5)
`cases_lag1 · cases_lag2 · cases_lag4 · cases_4wk_mean · rainfall_lag8 · temperature · seasonal sin/cos · test_positivity`
plus prevention indicators: `itn_ownership · itn_usage · irs_coverage · careseeking · chw_reporting_completeness`.

## Data-quality risks & mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| **Reporting completeness varies** | A "spike" may just be late reports catching up | Model tracks `chw_reporting_pct`; **verify‑before‑act** step explicitly rules out reporting artefacts |
| **Denominator drift** (population at risk) | Incidence miscalculated | Use official district populations; update annually |
| **Seasonality vs anomaly confusion** | Every peak looks alarming | Seasonal baseline learns *normal* per week; anomaly = deviation *from that*, not raw level |
| **Resurgence shifts the baseline** | Whole year flags as abnormal | Baseline **rescaled by a 12‑week trailing trend** so it tracks the new level |
| **Climate data lag/missingness** | Forecast degraded | Rainfall used at 8‑wk lag (already observed); temperature falls back to seasonal normal |
| **Small counts in low‑burden areas** | Noisy z‑scores | Count‑appropriate control limit (proportional + Poisson floor) |

## Minimum viable data for production pilot
Weekly, per pilot district **and sector**: confirmed cases + tests (positivity) from
DHIS2/RapidSMS, RDT/ACT stock from eLMIS, and district rainfall/temperature. That alone
runs the full early‑warning + allocation engine.
