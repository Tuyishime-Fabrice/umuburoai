# Data sources & real-world grounding

This prototype is **calibrated to Rwanda's official published malaria figures**. The
primary source is the **RBC / MOPDD Malaria & Neglected Tropical Diseases Annual
Report FY2023-2024** (Ministry of Health / Rwanda Biomedical Centre), supplemented by
the RBC weekly Public Health Bulletins and peer-reviewed studies. The synthetic
dataset (`generate_dataset.py`) reproduces the report's *district ranking, levels,
seasonality and prevention coverage*, so the AI is demonstrated on data that behaves
like the real thing.

> **In production the same pipeline reads authorised feeds — only the data loader changes.**
> **Data systems it reads:** DHIS2/HMIS (routine facility reporting, weekly+monthly) ·
> **IDSR** (Integrated Disease Surveillance & Response — the weekly outbreak/threshold
> signal) · RapidSMS/**SISCom** (community/CHW monthly reports) · **eLMIS** (RDT & ACT
> stock) · **cEMR** (community EMR, being piloted by RBC) · NASA/NOAA climate. The AI
> reads these read-only and never writes back.

> Case numbers shown in the dashboard are **synthetic and illustrative** — calibrated to,
> but **not identical to, official RBC statistics**. They are for demonstration only.

---

## 1. National indicators (MOPDD Annual Report, Table 18 — verbatim)

| Indicator | 2021/22 | 2022/23 | 2023/24 |
|---|---|---|---|
| Malaria incidence / 1,000 / year | 76 | 47 | **45** |
| Slide Positivity Rate (%) | 18 | 14 | **14** |
| Uncomplicated malaria cases | 998,811 | 621,465 | **613,415** |
| Inpatient malaria cases | 3,843 | 3,307 | **4,055** |
| Severe malaria cases | 1,831 | 1,316 | **1,969** (+50%) |
| Malaria deaths | 71 | 41 | **67** (+23%) |
| Case Fatality Rate /100,000 | 7.0 | 6.4 | **10.9** |
| % of cases treated at community | 55 | 59 | **57** |

Key report facts: 27 of 30 districts kept incidence **below 100/1,000**; severe cases
**+50%** and deaths **+23%** vs FY2022-23 (partly attributed to declining immunity and
**confirmed artemisinin partial resistance** → the updated guidelines adopt **Multiple
First-line Therapies, MFT**).

**Resurgence note (later reporting):** subsequent RBC / news reporting (2026) records the
national incidence **rising back to ~76 / 1,000 in FY2024-25**, easing toward ~72 in
2025-26. The prototype's "current" window models this resurgence (headline ~75 across
the 21 monitored high-burden districts); the FY2023-24 base of **45** is the report's
figure. (Note the coincidence that 76 was *also* the FY2021-22 level before the decline.)

## 2. District incidence, FY2023-24 (Annual Report, Figure 27) — drives our burden ranking

`generate_dataset.py` sets each district's burden **directly from these real values**:

| Rank | District | Incidence /1,000 | | District | Incidence /1,000 |
|--:|---|--:|---|---|--:|
| 1 | **Nyamagabe** | 151 | | Gakenke | 37 |
| 2 | **Gisagara** | 143 | | **Kirehe** (pilot) | 33 |
| 3 | **Nyamasheke** (pilot) | 106 | | Nyarugenge | 33 |
| 4 | Gicumbi | 97 | | Rutsiro | 31 |
| 5 | Bugesera | 74 | | Rusizi | 28 |
| 6 | Nyagatare | 72 | | Nyanza / Musanze | 20 |
| 7 | Gasabo | 71 | | Kayonza | 10 |
| 8 | Kicukiro | 69 | | Ruhango | 9 |
| 9 | Nyaruguru | 63 | | **Huye** | 8 |
| 10 | Muhanga | 60 | | Gatsibo | 7 |
| 11 | Rulindo | 52 | | **Ngoma** | 4 (lowest) |
| 12 | Karongi | 39 | | **National** | **45** |

Only **3 districts** exceeded 100/1,000: Nyamagabe, Gisagara, Nyamasheke. **IRS districts
run LOW *because* IRS works** (Huye 8, Gatsibo 7, Ngoma 4 — all blanket-sprayed); the
persistent high burden sits in non-/focal-IRS Southern & Western districts.

**Districts that ROSE >20%** (Fig. 28 text): Nyagatare **+88%**, **Kirehe +50%**, Gisagara
+44%, Musanze +43%, Nyamagabe +37%, **Nyamasheke +34%**, Burera +26%, Bugesera +21%.
**Districts that FELL >20%** include **Huye −63%**, Ngororero −66%, Ruhango −56%,
Kamonyi −54%, Rwamagana −50%.

**Highest-incidence sectors** (Table 19, >450/1,000): Giti/Gicumbi **854**,
Cyanika/Nyamagabe **722**, Mukindo/Gisagara **477** (also Gikomero 448, Rwamiko 389,
Bukure 357, Ntarabana 353, Rutunga 351, Kamabuye 333).

## 3. The FY2024 upsurge — weekly IDSR (Annual Report, Table 24) → what our EWS mirrors

The report's own **"Malaria Case Investigation in Hotspot Sectors"** analysed **weekly IDSR
data (Epi-Week 20, 13 May → Week 26, 30 Jun 2024)** and found sharp sector-level surges —
*exactly the signal and workflow Umuburo AI automates.* Confirmed cases 2022 / 2023 / 2024:

| District | Sector | 2022 | 2023 | **2024** |
|---|---|--:|--:|--:|
| **Nyamasheke** | **Mahembe** | 150 | 247 | **1,038** |
| **Nyamasheke** | **Kagano** | 147 | 90 | **855** |
| **Nyamasheke** | **Macuba** | 66 | 58 | **814** |
| **Nyagatare** | Kagitumba | 155 | 78 | **838** |
| **Nyagatare** | Karangazi | 315 | 261 | **744** |
| **Kayonza** | Mwiri | 31 | 65 | **674** |
| **Kirehe** | **Nyamugari** | 138 | 248 | **500** |
| **Kirehe** | **Mpanga** | 39 | 173 | **393** |
| Rusizi | Nkombo | 29 | 11 | **232** |
| Kayonza | Murundi | 31 | 42 | 109 |
| Kirehe | Gahara | 59 | 38 | 77 |

**Documented risk factors** (report): in **Rusizi & Nyamasheke** the surge HCs border **Lake
Kivu**, where many men are **fishermen doing night activities without protection**; in the
**Eastern Province** the worst villages are those near **dams** or **bordering Tanzania**.
Plus **stock-outs** of malaria drugs/commodities and **low HBM** at community level.

→ This is why the two pilots are **Kirehe** (Eastern; dams/border; +50%) and **Nyamasheke**
(Western; Lake Kivu fishermen; +34%; Mahembe 247→1,038). The demo's hero alert flags the
**Mahembe / Kagano / Macuba** cluster — the exact sectors the report investigated.

**Severe cases by district** (Table 21, total 1,969): Gisagara **198** (10%), Nyamagabe 146,
Gicumbi 145, Rubavu 119, Kicukiro 105, Nyamasheke 103, Bugesera 99, Nyagatare 99,
Rusizi 93, Karongi 92, Musanze 87, Gasabo 82, Kirehe 81.

## 4. Prevention coverage (Annual Report + Malaria Indicator Survey 2023)

- **ITN possession** (≥1 net): **80%** · access to an ITN: **71%** · of those with access, **79%**
  slept under it · **U5 slept under a net: 70%** · **pregnant women: 70%** · households with
  1 ITN per 2 people: **55%** → a real **ownership-vs-USAGE behaviour gap** (baked into the model).
- **IRS**: **99.8%** of targeted structures sprayed; protected **5,724,307** people (incl.
  675,872 U5, 65,173 pregnant); **blanket in 12 districts + focal IRS in 15 sectors of 5**.
- Malaria prevalence (microscopy): U5 **0.6%**, 5-14y 0.7%, pregnant 0.7%.
- LLINs: 236,522 to 480 boarding schools; 309,412 to pregnant women (97% of ANC-1);
  331,227 to under-1s (97%); **470,823 to hotspot sectors** of Bugesera, Gisagara, Nyagatare.

## 5. Climate (Annual Report, Climate Surveillance / Table 11)

Transmission is favoured where **temperature 18-35 °C, rainfall > 80 mm/month, relative
humidity > 60%**. Rainfall in FY2023-24 **peaked in Oct 2023 and Apr 2024**, lowest Nov 2023
& May 2024 — roughly **~8 weeks before** the case peaks (the lag the forecaster uses).
Annual average rainfall 1,480 mm. `fetch_climate.py` pulls **real** NASA POWER rainfall/temp
to validate this seasonality.

## 6. The gap this tool fills (Annual Report, Part III — Key Challenges & Way Forward)

> *"**Lack of more granular data (cell, village, and individual level) to inform targeted
> interventions.** The inadequate use of data at the decentralized level for the timely
> response."*
> **Proposed way forward:** *"Introduce Community Electronic Medical Record (C-EMR) to
> improve data use and targeted response. Capacity building of district teams in data use
> for decision-making."*

And, repeatedly, on the upsurge in already-protected districts:
> *"There is a need to conduct a further investigation to understand the risk factors
> associated with malaria upsurge despite sustained blanket IRS and ITN distribution."*

Umuburo AI operationalizes exactly this: it turns the **manual, national, weekly** threshold
review into a **continuous, cell/village-granular, forecast-ahead** decision-support layer,
with humans kept in the loop (verify-before-act). Reporting rates the report notes (hospitals
90%, health centres 99.5%, health posts 57%, private 42%) are why every alert first asks the
user to **confirm reporting completeness** before acting.

## 7. Real published data grounding (RBC weekly bulletins)

The **RBC Public Health Bulletin, Epidemiological Week 39 (22-28 Sep 2025)** confirms the
same problem and workflow at national level:

> *"…the results revealed that **simple malaria cases surpassed the epidemic thresholds**.
> **A deep investigation is needed for simple malaria cases.**"* — with **72 severe malaria
> cases** reported that week.

RBC already does a **manual, weekly threshold comparison** at national level. Umuburo AI
automates and extends it: **earlier** (continuous), **finer** (district → sector → cell →
village), and **forward-looking** (1-4 week forecast).

## 8. Administrative & community-health structure (why the drill-down matters)

Rwanda: **5 provinces → 30 districts → 416 sectors → 2,148 cells → 14,837 villages**
(imidugudu). Each village has a **male + female CHW pair** plus a maternal-health CHW (ASM) —
on the order of **~44,500 CHWs** nationally. The surveillance gap RBC documents lives at the
cell/village level, which is also where CHW action happens — hence the drill-down.

## 9. Reference links

- **RBC / MOPDD Malaria & NTD Annual Report FY2023-24 (PRIMARY SOURCE)** — https://www.rbc.gov.rw/fileadmin/user_upload/report_2024/malaria_2025/MOPDD_Annual_Report_FY2023-2024.pdf
- RBC Public Health Bulletin — all issues — https://rbc.gov.rw/publichealthbulletin/issues/
- RBC Bulletin, Week 39 (22-28 Sep 2025) — https://rbc.gov.rw/fileadmin/user_upload/bulletin/2025/The_bulletin_week_39_from_22nd_to_28th__September_2025.pdf
- RBC Bulletin, Week 07 (10-16 Feb 2025) — https://rbc.gov.rw/fileadmin/user_upload/bulletin/2025/The_bulletin_week_07_from_10th_to_16th_February_2025.pdf
- Rwanda Public Health Bulletin — malaria incidence & deaths (2014-2024) — https://rbc.gov.rw/publichealthbulletin/articles/read/173/
- "Malaria incidence rises from 45 to 76 per 1,000" (resurgence, FY24-25) — https://www.topafricanews.com/2026/04/21/rwandas-malaria-incidence-rises-from-45-to-76-per-1000-in-2023-24-2024-25/
- "Malaria incidence falls as govt targets high-burden areas" (The New Times) — https://www.newtimes.co.rw/article/39300/news/health/malaria-incidence-falls-as-govt-targets-high-burden-areas
- Investigating the resurgence of malaria in Rwanda (PMC) — https://pmc.ncbi.nlm.nih.gov/articles/PMC12577953/
- Inequalities in household access to ITNs (medRxiv, 2025) — https://www.medrxiv.org/content/10.1101/2025.09.23.25336506v1.full
- Climatic factors & malaria in Rwanda 2012-2021 (Springer) — https://link.springer.com/article/10.1186/s12936-024-05097-5
- PMI Rwanda Malaria Profile FY2024 — https://mesamalaria.org/wp-content/uploads/2025/04/RWANDA-Malaria-Profile-PMI-FY-2024.pdf

## 10. Live climate retrieval (demonstrated)

`fetch_climate.py` pulls **real** rainfall & temperature for a pilot district from **NASA POWER**
(open, no API key). The retrieved data **validates the calibration**: rainfall peaks in the
rainy seasons, falls to ~0 mm/day in the dry season, temperature ~19-21 °C — matching the
seasonality the model uses. This is the production climate source; the AI pipeline itself runs
offline on the calibrated dataset.

## 11. Dataset files produced

- `malaria_surveillance_district.csv` — **21 districts × 196 weeks** (2023-W01 → 2026-W40):
  suspected/tested/confirmed cases, severe, deaths, positivity, rainfall, temperature, ITN
  ownership/usage, IRS, care-seeking, CHW reporting completeness. Burden set from real Fig. 27.
- `malaria_surveillance_sector.csv` — sector-level weekly data for the two pilot districts
  (**Kirehe, Nyamasheke**), with the FY2024 hotspot surge (Table 24) injected focally.
