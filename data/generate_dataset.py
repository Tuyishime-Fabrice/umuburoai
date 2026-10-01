"""
generate_dataset.py  -  Malaria surveillance dataset builder (prototype)
=======================================================================
Builds a REALISTIC, reproducible weekly malaria surveillance dataset for Rwanda,
calibrated to the **RBC / MOPDD Malaria & NTD Annual Report FY2023-2024** (the
official published figures) plus the RBC weekly Public Health Bulletins.

WHY SYNTHETIC?
  Facility-level DHIS2 / HMIS data is not publicly downloadable (it is controlled
  by RBC / Ministry of Health). For the hackathon PROTOTYPE we generate data whose
  district ranking, levels, seasonality and prevention coverage match the PUBLIC
  RBC reports (see data/sources.md). In PRODUCTION the exact same pipeline reads
  authorised DHIS2 / RapidSMS / eLMIS feeds - only the loader changes.

REAL FACTS BAKED IN (primary source: MOPDD Annual Report FY2023-24; see sources.md):
  * National incidence 45 / 1,000 (FY2023-24) -> resurged to 76 / 1,000 (FY2024-25),
    easing toward ~72 in 2025-26. Each district's synthetic burden is set from its
    REAL FY2023-24 incidence (Fig. 27), lifted by the documented resurgence ramp.
  * District ranking is faithful: Nyamagabe (151), Gisagara (143), Nyamasheke (106),
    Gicumbi (97) highest; Huye (8), Gatsibo (7), Ngoma (4) lowest. IRS districts run
    LOW *because* IRS works; the persistent high burden is in non-/focal-IRS South & West.
  * Documented FY2024 upsurge (report's own "hotspot investigation", Table 24, weekly
    IDSR): Nyamasheke (Mahembe 247->1,038; Kagano 90->855; Macuba 58->814),
    Nyagatare (+88%), Kirehe (Nyamugari 248->500; Mpanga 173->393; +50% district).
  * Bimodal seasonality: peaks after the two rains, ~May/June & ~Nov/December.
  * Rainfall drives cases at a ~8-week lag; transmission favoured where temp 18-35 C,
    rain > 80 mm/mo, RH > 60% (report, Climate Surveillance).
  * ITN ownership ~80% but a real ownership->USAGE gap (MIS 2023); IRS ~99.8% of
    targeted structures where sprayed (report, Exec. Summary / Table 1-2).

PILOTS (drive the sector -> cell -> village drill-down): Kirehe (Eastern) &
  Nyamasheke (Western) - both real FY2024 upsurge districts the report investigated.

OUTPUTS (written next to this file, in data/):
  * malaria_surveillance_district.csv   national weekly, 21 districts
  * malaria_surveillance_sector.csv     sector-level weekly, 2 PILOT districts
Run:  python data/generate_dataset.py
"""

import csv
import math
import os
import random
from datetime import date, timedelta

SEED = 42
random.seed(SEED)

# Each district's per-week reference burden is derived from its REAL FY2023-24
# incidence:  base = round(inc2324 * population / CALIB).  CALIB is chosen so the
# recent 52-week window (with the resurgence ramp) lands near the published
# ~72-76 / 1,000, while the FY23-24 window tracks ~45. Detection is scale-invariant
# (proportional control limits), so calibration only affects magnitudes, not alerts.
CALIB = 55000
BASE_SCALE = 0.85

HERE = os.path.dirname(os.path.abspath(__file__))

START = date(2023, 1, 2)      # first Monday of ISO 2023
END = date(2026, 9, 28)       # Monday of the current epi-week (today = 2026-09-30)

# ---------------------------------------------------------------------------
# District reference table  (values from MOPDD Annual Report FY2023-24)
#   province      : administrative province (Kigali = City of Kigali)
#   tier          : burden band derived from inc2324 (high >=60, med >=20, low <20)
#   pop           : population at risk (approx real order of magnitude)
#   inc2324       : REAL malaria incidence / 1,000, FY2023-24 (Figure 27) -> sets burden
#   irs           : IRS household coverage % (Table 1: ~99 blanket, ~20-50 focal, 0 none)
#   own           : % households owning >=1 ITN (MIS 2023 ~80% nationally)
#   use           : % of the population that actually SLEEPS under a net (behaviour)
#   care          : % of fevers seeking care within 24-48h
#   chw           : CHW reporting completeness % (data quality)
# Real prevention GAPS are preserved so the resource-allocation engine has genuine
# targets (e.g. Nyamasheke: no IRS + fisherman net-usage gap; Nyagatare: low nets).
# ---------------------------------------------------------------------------
DISTRICTS = {
    # district      province     tier    pop     inc  irs own use care chw
    "Nyamagabe":  ("Southern",  "high", 340000, 151,  35,  86,  74,  80,  87),  # top burden; focal IRS + LLIN campaign
    "Gisagara":   ("Southern",  "high", 400000, 143,  99,  93,  82,  86,  95),  # blanket IRS; most severe cases nationally (198)
    "Nyamasheke": ("Western",   "high", 400000, 106,   0,  88,  66,  78,  90),  # PILOT: NO IRS, Lake Kivu fishermen (outdoor/night exposure)
    "Gicumbi":    ("Northern",  "high", 400000,  97,  19,  89,  79,  82,  90),  # focal IRS
    "Bugesera":   ("Eastern",   "high", 460000,  74,  99,  92,  81,  84,  92),  # blanket IRS; +21%
    "Nyagatare":  ("Eastern",   "high", 560000,  72,  99,  79,  68,  78,  88),  # IRS yet +88% (biggest rise); low net ownership+use, border/dams
    "Gasabo":     ("Kigali",    "high", 530000,  71,  13,  90,  80,  85,  92),  # focal IRS; -22%
    "Kicukiro":   ("Kigali",    "high", 360000,  69,   0,  91,  82,  88,  93),
    "Nyaruguru":  ("Southern",  "high", 300000,  63,  21,  88,  76,  82,  89),  # focal IRS; -31%
    "Muhanga":    ("Southern",  "high", 350000,  60,   0,  89,  78,  82,  88),
    "Rulindo":    ("Northern",  "med",  290000,  52,   0,  88,  77,  80,  89),  # -20%
    "Karongi":    ("Western",   "med",  340000,  39,   0,  87,  76,  81,  88),
    "Gakenke":    ("Northern",  "med",  340000,  37,   0,  88,  78,  81,  89),  # -30%
    "Kirehe":     ("Eastern",   "med",  420000,  33,  95,  90,  72,  80,  97),  # PILOT: IRS DONE (Sep'23) yet +50% upsurge -> investigate (report's own recommendation)
    "Rusizi":     ("Western",   "med",  400000,  28,  50,  89,  70,  80,  90),  # focal IRS; Lake Kivu; -29%
    "Nyanza":     ("Southern",  "med",  360000,  20,  99,  90,  79,  81,  90),  # blanket IRS; -28%
    "Musanze":    ("Northern",  "med",  400000,  20,   0,  90,  80,  86,  92),  # +43%
    "Kayonza":    ("Eastern",   "low",  460000,  10,  99,  91,  80,  82,  91),  # blanket IRS
    "Huye":       ("Southern",  "low",  380000,   8,  99,  91,  84,  88,  98),  # SUCCESS: IRS done Jun'24, -63%, only 21 severe (1%)
    "Gatsibo":    ("Eastern",   "low",  540000,   7,  99,  90,  82,  83,  90),  # blanket IRS; -25%
    "Ngoma":      ("Eastern",   "low",  390000,   4,  99,  93,  85,  85,  93),  # blanket IRS; lowest incidence nationally
}

# Real sector names for the two PILOT districts (used for the granular drill-down).
# Surge sectors are listed first for readability; injection targets them (Table 24).
SECTORS = {
    "Kirehe": ["Nyamugari", "Mpanga", "Gahara", "Mahama", "Nasho", "Kigarama",
               "Gatore", "Kirehe", "Musaza", "Kigina", "Mushikiri", "Nyarubuye"],
    "Nyamasheke": ["Mahembe", "Kagano", "Macuba", "Kanjongo", "Kirimbi", "Gihombo",
                   "Bushekeri", "Bushenge", "Cyato", "Karambi", "Karengera",
                   "Nyabitekeri", "Rangiro", "Ruharambuga", "Shangi"],
}

# ---------------------------------------------------------------------------
# Seasonal + climate shape functions
# ---------------------------------------------------------------------------
def _gauss(week, center, width):
    """Circular (52-week) Gaussian bump."""
    d = min(abs(week - center), 52 - abs(week - center))
    return math.exp(-(d * d) / (2 * width * width))

def case_season(week):
    """Bimodal case seasonality: peaks ~w24 (June) and ~w50 (December)."""
    return 1.0 + 1.8 * _gauss(week, 24, 4.5) + 1.9 * _gauss(week, 50, 4.0)

def rain_season(week):
    """Rainfall peaks ~8 weeks BEFORE the case peaks: long rains ~w15, short ~w41."""
    base = 12.0
    return base + 62 * _gauss(week, 15, 5.0) + 55 * _gauss(week, 41, 4.5)

def temp_season(week, warm_offset):
    """Highland climate ~17-22 C; lowland (Eastern) districts warmer."""
    return 18.5 + warm_offset + 1.6 * math.sin(2 * math.pi * (week - 6) / 52.0)

# Province -> temperature offset (Eastern lowlands warmest; Northern highlands coolest)
WARM = {"Eastern": 3.5, "Kigali": 1.2, "Western": 1.5, "Southern": 1.0, "Northern": -1.5}

def year_level(d):
    """Year-over-year multiplier encoding the documented resurgence.
    Low before the FY2024-25 jump, ~1.0 during it, easing slightly in 2026."""
    # smooth ramp centred on July 2024 (start of FY2024-25)
    t = (d - date(2024, 7, 1)).days / 365.0
    ramp = 0.60 + 0.42 / (1 + math.exp(-3.2 * t))   # 0.60 -> ~1.02
    if d >= date(2026, 1, 1):
        ramp *= 0.94                                  # slight 2025-26 decline
    return ramp

def epi_weeks():
    """Yield (monday_date, iso_year, iso_week) across the study period."""
    d = START
    while d <= END:
        iy, iw, _ = d.isocalendar()
        yield d, iy, iw
        d += timedelta(days=7)

WEEKS = list(epi_weeks())

# ---------------------------------------------------------------------------
# Anomaly injection (the "emerging outbreak" the demo detects)
#   Mirrors the report's documented FY2024 hotspot investigation (Table 24): a
#   sharp, recent cluster (last ~4 weeks) ahead of the Nov/Dec peak - exactly what
#   an EWS should catch early. Nyamasheke rises to HIGH (Mahembe hardest); Kirehe
#   to WATCH.
# ---------------------------------------------------------------------------
LAST_MONDAY = WEEKS[-1][0]

def outbreak_boost(district, d):
    weeks_ago = (LAST_MONDAY - d).days // 7
    if district == "Nyamasheke":
        return {0: 1.62, 1: 1.46, 2: 1.28, 3: 1.12}.get(weeks_ago, 1.0)   # -> HIGH
    if district == "Kirehe":
        return {0: 1.30, 1: 1.22, 2: 1.09}.get(weeks_ago, 1.0)            # -> WATCH
    return 1.0

# Per-sector recent surge (the real hotspot sectors from Table 24)
_SEC_BOOST = {
    ("Nyamasheke", "Mahembe"): {0: 1.90, 1: 1.65, 2: 1.40, 3: 1.18},   # 247 -> 1,038 (biggest)
    ("Nyamasheke", "Kagano"):  {0: 1.60, 1: 1.40, 2: 1.20},
    ("Nyamasheke", "Macuba"):  {0: 1.50, 1: 1.30, 2: 1.15},
    ("Kirehe", "Nyamugari"):   {0: 1.50, 1: 1.32, 2: 1.15},            # 248 -> 500
    ("Kirehe", "Mpanga"):      {0: 1.40, 1: 1.25, 2: 1.10},            # 173 -> 393
}

def sector_outbreak_boost(district, sector, d):
    weeks_ago = (LAST_MONDAY - d).days // 7
    return _SEC_BOOST.get((district, sector), {}).get(weeks_ago, 1.0)

# ---------------------------------------------------------------------------
# Core generator
# ---------------------------------------------------------------------------
def gen_district_rows():
    rows = []
    for name, (prov, tier, pop, inc, irs, own, use, care, chw) in DISTRICTS.items():
        # per-week reference burden derived from the REAL FY2023-24 incidence
        base = max(3, round(inc * pop / CALIB))
        warm = WARM[prov]
        for d, iy, iw in WEEKS:
            w = iw if iw <= 52 else 52
            season = case_season(w)
            yl = year_level(d)
            boost = outbreak_boost(name, d)
            noise = random.lognormvariate(0, 0.07)   # ~7% CV: realistic for aggregated district counts
            mean_cases = base * BASE_SCALE * season * yl * boost * noise
            confirmed = max(0, int(round(mean_cases)))

            # positivity higher in peak season -> derive testing volume
            positivity = min(0.62, 0.16 + 0.20 * (season - 1) + random.uniform(-0.03, 0.03))
            positivity = max(0.06, positivity)
            # NB: always draw the same number of random values per row (even when
            # unused) so the RNG stays in sync and tuning is reproducible.
            fallback_tested = random.randint(20, 120)
            tested = int(round(confirmed / positivity)) if confirmed else fallback_tested
            suspected = int(round(tested * random.uniform(1.03, 1.15)))
            severe = int(round(confirmed * random.uniform(0.008, 0.02)))
            death_roll = random.random()
            death_frac = random.uniform(0.0004, 0.0011)
            deaths = int(round(confirmed * death_frac)) if (confirmed > 400 and death_roll < 0.35) else 0

            rain = round(rain_season(w) * random.lognormvariate(0, 0.18), 1)
            temp = round(temp_season(w, warm) + random.uniform(-0.6, 0.6), 1)

            # slow prevention drift (behaviour erodes slightly off-season)
            drift = -3 if 26 <= w <= 40 else 0
            rows.append({
                "epi_week": f"{iy}-W{w:02d}",
                "date": d.isoformat(),
                "district": name,
                "province": prov,
                "population_at_risk": pop,
                "suspected_cases": suspected,
                "tested": tested,
                "confirmed_cases": confirmed,
                "severe_cases": severe,
                "deaths": deaths,
                "test_positivity_rate": round(confirmed / tested, 3) if tested else 0,
                "rainfall_mm": rain,
                "temp_avg_c": temp,
                "itn_ownership_pct": own,
                "itn_usage_pct": max(45, use + drift),
                "irs_coverage_pct": irs,
                "careseeking_pct": care,
                "chw_reporting_pct": min(100, chw + random.randint(-2, 2)),
            })
    return rows

def gen_sector_rows(district_rows):
    """Disaggregate PILOT district weekly cases across real sectors (shares + noise),
    then inject the sector-level outbreak so the drill-down explains the district signal."""
    by_key = {(r["district"], r["epi_week"]): r for r in district_rows}
    rows = []
    for district, sector_list in SECTORS.items():
        # fixed baseline shares per sector (sum ~1.0)
        raw = [random.uniform(0.6, 1.6) for _ in sector_list]
        s = sum(raw)
        shares = {sec: v / s for sec, v in zip(sector_list, raw)}
        for d, iy, iw in WEEKS:
            w = iw if iw <= 52 else 52
            drow = by_key[(district, f"{iy}-W{w:02d}")]
            # divide out the DISTRICT-wide boost so the recent surge is FOCAL:
            # only the real hotspot sectors (Table 24) rise, not every sector.
            dcases = drow["confirmed_cases"] / outbreak_boost(district, d)
            for sec in sector_list:
                sboost = sector_outbreak_boost(district, sec, d)
                base_share = shares[sec] * random.lognormvariate(0, 0.10)
                confirmed = max(0, int(round(dcases * base_share * sboost)))
                positivity = max(0.06, min(0.65, drow["test_positivity_rate"] + random.uniform(-0.04, 0.04)))
                fb = random.randint(4, 30)
                tested = int(round(confirmed / positivity)) if confirmed else fb
                rows.append({
                    "epi_week": f"{iy}-W{w:02d}",
                    "date": d.isoformat(),
                    "district": district,
                    "sector": sec,
                    "confirmed_cases": confirmed,
                    "tested": tested,
                    "test_positivity_rate": round(confirmed / tested, 3) if tested else 0,
                    "rainfall_mm": drow["rainfall_mm"],
                    "temp_avg_c": drow["temp_avg_c"],
                    "itn_usage_pct": drow["itn_usage_pct"],
                    "chw_reporting_pct": drow["chw_reporting_pct"],
                })
    return rows

def write_csv(path, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

def main():
    district_rows = gen_district_rows()
    sector_rows = gen_sector_rows(district_rows)
    write_csv(os.path.join(HERE, "malaria_surveillance_district.csv"), district_rows)
    write_csv(os.path.join(HERE, "malaria_surveillance_sector.csv"), sector_rows)

    # summary + a quick calibration read-out (recent 52-wk incidence per district)
    total = sum(r["confirmed_cases"] for r in district_rows)
    y2025 = sum(r["confirmed_cases"] for r in district_rows if "2024-07-01" <= r["date"] < "2025-07-01")
    by_d = {}
    for r in district_rows:
        by_d.setdefault(r["district"], []).append(r)
    print("Dataset generated (seed=%d)" % SEED)
    print("  districts file : %d rows (%d districts x %d weeks)"
          % (len(district_rows), len(DISTRICTS), len(WEEKS)))
    print("  sectors file   : %d rows (%d pilot sectors x %d weeks)"
          % (len(sector_rows), sum(len(v) for v in SECTORS.values()), len(WEEKS)))
    print("  period         : %s -> %s" % (WEEKS[0][0], WEEKS[-1][0]))
    print("  total confirmed: %s" % f"{total:,}")
    print("  FY2024-25 conf : %s (resurgence year)" % f"{y2025:,}")
    tot_pop = sum(v[0]["population_at_risk"] for v in by_d.values())
    tot52 = 0
    for name, rr in sorted(by_d.items(), key=lambda kv: -sum(x["confirmed_cases"] for x in kv[1][-52:])):
        s52 = sum(x["confirmed_cases"] for x in rr[-52:])
        tot52 += s52
        inc = round(1000 * s52 / rr[0]["population_at_risk"], 1)
        print("    %-11s inc/1k (recent 52wk) = %5.1f  (real FY23-24 = %d)"
              % (name, inc, DISTRICTS[name][3]))
    print("  NATIONAL recent-52wk incidence = %.1f / 1,000 (target ~72-76 resurgence)"
          % (1000 * tot52 / tot_pop))

if __name__ == "__main__":
    main()
