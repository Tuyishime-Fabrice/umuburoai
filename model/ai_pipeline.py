"""
ai_pipeline.py  -  Malaria AI Early-Warning + Prevention-Targeting engine
=========================================================================
The analytical core of the RBC Malaria AI EWS prototype. Pure Python standard
library (no pandas / sklearn) so it runs on any Python 3 with zero installs.

WHAT IT DOES  (reads data/*.csv  ->  writes dashboard/data/*.json)

  1. SEASONAL BASELINE  ("what does normal look like this week?")
     Learns a 52-week seasonal shape per district, then rescales it to the
     current level with a 12-week trailing trend so it tracks the resurgence
     instead of flagging the whole year. This is the "expected" line.

  2. ANOMALY DETECTION  ("is this rise abnormal?")
     Control-chart style: residual z-score = (actual - expected) / residual_sd.
     Sustained z (>=2 for >=2 wks) = statistically abnormal, the classic
     epidemic-threshold idea used in real surveillance.

  3. FORECAST  ("where is this going?")
     A ridge-regression model TRAINED on each district's own history, features:
       lag1, lag2, lag4, 4-wk mean, rainfall at 8-wk lag, temperature,
       sin/cos of the epi-week (seasonality). Predicts a 1-4 week outlook.
     (Production upgrade path: gradient boosting / LSTM - see docs/04.)

  4. RISK ENGINE  ("LOW / WATCH / HIGH + why")
     Fuses anomaly z, short-term trend, forecast trajectory, rainfall lead
     signal and prevention gaps into an explainable risk level with drivers.

  5. PREVENTION TARGETING  ("act before the season, not just alert")
     Scores each district's prevention GAP (net ownership, net USAGE behaviour,
     IRS spray-round status, care-seeking) x predicted peak burden -> a ranked
     pre-season resource-allocation plan (which district gets what, and why).

  6. VERIFY-BEFORE-ACT ALERTS
     Every alert pairs a recommended ACTION with a human VERIFICATION step
     first (confirm reporting completeness, cross-check register, check eLMIS
     stock) - AI recommends, people verify, then act.

Run:  python model/ai_pipeline.py
"""

import csv
import json
import math
import os
import random
from collections import defaultdict
from datetime import date, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA_DIR = os.path.join(ROOT, "data")
OUT_DIR = os.path.join(ROOT, "dashboard", "data")
TODAY = date(2026, 9, 30)

PILOTS = ("Kirehe", "Nyamasheke")

# approx district centroids (lat, lng) for the offline map
COORDS = {
    "Nyamagabe": (-2.38, 29.38), "Gisagara": (-2.62, 29.86), "Nyamasheke": (-2.35, 29.13),
    "Gicumbi": (-1.58, 30.10), "Bugesera": (-2.21, 30.12), "Nyagatare": (-1.30, 30.33),
    "Gasabo": (-1.90, 30.13), "Kicukiro": (-1.99, 30.10), "Nyaruguru": (-2.68, 29.55),
    "Muhanga": (-2.08, 29.75), "Rulindo": (-1.75, 29.99), "Karongi": (-2.00, 29.35),
    "Gakenke": (-1.70, 29.78), "Kirehe": (-2.26, 30.71), "Rusizi": (-2.48, 28.90),
    "Nyanza": (-2.35, 29.75), "Musanze": (-1.50, 29.63), "Kayonza": (-1.88, 30.62),
    "Huye": (-2.60, 29.74), "Gatsibo": (-1.58, 30.43), "Ngoma": (-2.15, 30.50),
}

# Role-based access control (demo): who signs in, with what credentials, at what scope.
# NB: DEMO credentials only, shipped client-side so judges can log in. Production
# uses Ministry of Health SSO — passwords are never shipped to the browser.
ROLES = [
    {"id": "super", "label": "Super User — System Administrator", "org": "Malaria AI Platform (Administration)",
     "scope": "national", "admin": True, "districts": "ALL", "avatar": "SU",
     "username": "admin", "password": "admin@123",
     "can_see": ["Everything: national + every district, sector, cell & village", "All alerts, prevention & model",
                 "User accounts & access roles (administration)", "System audit trail (production)"],
     "cannot": ["View patient identifiers — aggregate-only, even as administrator"]},
    {"id": "national", "label": "RBC National Analyst", "org": "Rwanda Biomedical Centre — MOPDD",
     "scope": "national", "districts": "ALL", "avatar": "RBC",
     "username": "rbc.national", "password": "rbc@2026",
     "can_see": ["National risk map & all monitored districts", "Drill into any district → sector → cell → village",
                 "National prevention & resource-allocation plan", "All alerts", "Model, data sources & security"],
     "cannot": ["Write to clinical records (read-only analytics)", "Patient identifiers (aggregate-only)"]},
    {"id": "kirehe", "label": "District Surveillance — Kirehe", "org": "Kirehe District Hospital — Eastern Province",
     "scope": "district", "districts": ["Kirehe"], "avatar": "KR",
     "username": "kirehe.dho", "password": "kirehe@2026",
     "can_see": ["Kirehe district dashboard & forecast", "Kirehe sectors, cells & villages (full drill-down)",
                 "Kirehe alerts with verify-before-act", "Kirehe prevention plan & household coverage"],
     "cannot": ["Other districts' detailed data", "National cross-district allocation", "Patient identifiers"]},
    {"id": "nyamasheke", "label": "District Surveillance — Nyamasheke", "org": "Nyamasheke District Hospital — Western Province",
     "scope": "district", "districts": ["Nyamasheke"], "avatar": "NM",
     "username": "nyamasheke.dho", "password": "nyamasheke@2026",
     "can_see": ["Nyamasheke district dashboard & forecast", "Nyamasheke sectors, cells & villages (full drill-down)",
                 "Nyamasheke alerts with verify-before-act", "Nyamasheke prevention plan & household coverage"],
     "cannot": ["Other districts' detailed data", "National cross-district allocation", "Patient identifiers"]},
    {"id": "sector_mahembe", "label": "Sector Surveillance — Mahembe", "org": "Mahembe Health Centre, Nyamasheke",
     "scope": "sector", "district": "Nyamasheke", "sector": "Mahembe", "avatar": "MH",
     "username": "mahembe.sector", "password": "mahembe@2026",
     "can_see": ["Mahembe sector — all cells & villages", "Household prevention coverage (net use, IRS)",
                 "Sector alerts + verify-before-act", "CHW active-case-finding targets"],
     "cannot": ["District & national aggregates", "Other sectors", "Patient identifiers"]},
    {"id": "cell_mahembe_a", "label": "Cell Surveillance — Mahembe A", "org": "Mahembe A Cell (Akagari), Nyamasheke",
     "scope": "cell", "district": "Nyamasheke", "sector": "Mahembe", "cell": "Mahembe A", "avatar": "CA",
     "username": "mahembe.cell", "password": "cell@2026",
     "can_see": ["Mahembe A cell — all its villages", "Household prevention coverage in the cell",
                 "Cell-level alerts & CHW targets"],
     "cannot": ["Sector / district / national aggregates", "Other cells", "Patient identifiers"]},
    {"id": "village_mahembe_a1", "label": "Village CHW — Mahembe A1", "org": "Mahembe A1 Village (Umudugudu), Nyamasheke",
     "scope": "village", "district": "Nyamasheke", "sector": "Mahembe", "cell": "Mahembe A", "village": "Mahembe A1", "avatar": "V1",
     "username": "mahembe.chw", "password": "chw@2026",
     "can_see": ["Mahembe A1 village household register", "Net ownership vs usage & IRS status",
                 "Active case-finding list for the village"],
     "cannot": ["Any aggregate above the village", "Other villages", "Patient identifiers"]},
]


def build_hierarchy(sectors_out):
    """Synthesise the administrative drill-down BELOW the sector level for the two
    pilot districts: sector -> cell -> village, with a household prevention layer.
    Village counts are tiny/noisy, so detection stays at sector level and cells/
    villages carry a current snapshot for micro-targeted action. Deterministic."""
    rng = random.Random(7)
    cells, villages = [], []

    def local_risk(cases, expected):
        if expected <= 0:
            return "LOW"
        scale = max(1.0, math.sqrt(expected) + 0.14 * expected)
        z = (cases - expected) / scale
        return "HIGH" if z >= 2.0 else ("WATCH" if z >= 1.1 else "LOW")

    for s in sectors_out:
        dist, sec = s["district"], s["sector"]
        sec_cases = max(1, s["cases_latest"])
        ncells = rng.randint(3, 5)
        shares = [rng.uniform(0.6, 1.5) for _ in range(ncells)]
        tot = sum(shares)
        for ci in range(ncells):
            hot = (dist == "Nyamasheke" and sec == "Mahembe" and ci == 0)
            cellname = "%s %s" % (sec, chr(65 + ci))
            base = sec_cases * shares[ci] / tot
            ccases = int(round(base * (1.7 if hot else rng.uniform(0.9, 1.12))))
            cexp = sec_cases / ncells
            crisk = "HIGH" if hot else local_risk(ccases, cexp)
            if crisk == "HIGH":
                spark = [max(0, int(ccases * f)) for f in (0.55, 0.62, 0.7, 0.82, 0.92, 1.0)]
            elif crisk == "WATCH":
                spark = [max(0, int(ccases * f)) for f in (0.78, 0.82, 0.86, 0.9, 0.96, 1.0)]
            else:
                spark = [max(0, int(ccases * f)) for f in (0.98, 1.0, 0.97, 1.02, 0.99, 1.0)]
            cells.append({"district": dist, "sector": sec, "cell": cellname, "cases_latest": ccases,
                          "expected": round(cexp), "risk": crisk, "spark": spark,
                          "positivity": round(min(0.6, max(0.08, s["positivity"] + rng.uniform(-0.05, 0.05))), 2)})
            nv = rng.randint(5, 9)
            vs = [rng.uniform(0.6, 1.5) for _ in range(nv)]
            vtot = sum(vs)
            for vi in range(nv):
                vhot = hot and vi == 0
                vname = "%s%d" % (cellname, vi + 1)
                vbase = ccases * vs[vi] / vtot
                vcases = int(round(vbase * (2.0 if vhot else rng.uniform(0.8, 1.18))))
                vrisk = "HIGH" if vhot else local_risk(vcases, ccases / nv)
                villages.append({"district": dist, "sector": sec, "cell": cellname, "village": vname,
                                 "cases_latest": vcases, "risk": vrisk,
                                 "households": rng.randint(80, 165),
                                 "itn_ownership": rng.randint(85, 95),
                                 "itn_use": 57 if vhot else rng.randint(66, 90),
                                 "irs": "done" if rng.random() < 0.62 else "pending",
                                 "careseeking": rng.randint(70, 90)})
    return {"cells": cells, "villages": villages}

# ---------------------------------------------------------------------------
# small numeric helpers (pure python)
# ---------------------------------------------------------------------------
def mean(xs):
    xs = list(xs)
    return sum(xs) / len(xs) if xs else 0.0

def std(xs):
    xs = list(xs)
    if len(xs) < 2:
        return 0.0
    m = mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))

def clamp(x, lo, hi):
    return max(lo, min(hi, x))

def solve(A, b):
    """Gaussian elimination with partial pivoting for A x = b (A square)."""
    n = len(A)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(M[r][col]))
        if abs(M[piv][col]) < 1e-12:
            continue
        M[col], M[piv] = M[piv], M[col]
        pv = M[col][col]
        for r in range(n):
            if r != col and abs(M[r][col]) > 1e-12:
                f = M[r][col] / pv
                for c in range(col, n + 1):
                    M[r][c] -= f * M[col][c]
    return [M[i][i] and M[i][n] / M[i][i] or 0.0 for i in range(n)]

class Ridge:
    """Standardised ridge regression, trained via the normal equations."""
    def __init__(self, lam=1.0):
        self.lam = lam
        self.mu = self.sd = self.beta = None

    def fit(self, X, y):
        p = len(X[0])
        self.mu = [mean(col) for col in zip(*X)]
        self.sd = [std(col) or 1.0 for col in zip(*X)]
        Z = [[1.0] + [(row[j] - self.mu[j]) / self.sd[j] for j in range(p)] for row in X]
        k = p + 1
        A = [[0.0] * k for _ in range(k)]
        rhs = [0.0] * k
        for zi, yi in zip(Z, y):
            for a in range(k):
                rhs[a] += zi[a] * yi
                for c in range(k):
                    A[a][c] += zi[a] * zi[c]
        for a in range(1, k):            # do not penalise the bias term
            A[a][a] += self.lam
        self.beta = solve(A, rhs)
        return self

    def predict(self, row):
        z = [1.0] + [(row[j] - self.mu[j]) / self.sd[j] for j in range(len(row))]
        return sum(b * v for b, v in zip(self.beta, z))

# ---------------------------------------------------------------------------
# data loading
# ---------------------------------------------------------------------------
NUM = {"population_at_risk", "suspected_cases", "tested", "confirmed_cases",
       "severe_cases", "deaths", "test_positivity_rate", "rainfall_mm",
       "temp_avg_c", "itn_ownership_pct", "itn_usage_pct", "irs_coverage_pct",
       "careseeking_pct", "chw_reporting_pct"}

def load(path):
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        for k, v in r.items():
            if k in NUM:
                r[k] = float(v) if ("." in v or k == "test_positivity_rate") else int(v)
    return rows

def woy(datestr):
    y, m, d = map(int, datestr.split("-"))
    return min(date(y, m, d).isocalendar()[1], 52)

# ---------------------------------------------------------------------------
# seasonal baseline + anomaly z-score for one ordered case series
# ---------------------------------------------------------------------------
def baseline_and_z(cases, weeks):
    n = len(cases)
    overall = mean(cases) or 1.0
    # 52-week seasonal index
    buckets = defaultdict(list)
    for c, w in zip(cases, weeks):
        buckets[w].append(c)
    seas = {w: (mean(buckets[w]) / overall if buckets[w] else 1.0) for w in range(1, 53)}
    # smooth the index a touch (circular 3-week window)
    seas_s = {}
    for w in range(1, 53):
        nb = [seas[((w - 2 + k) % 52) + 1] for k in range(3)]
        seas_s[w] = mean(nb) or 1.0
    deseason = [cases[i] / (seas_s[weeks[i]] or 1.0) for i in range(n)]
    expected, z = [0.0] * n, [0.0] * n
    for i in range(n):
        if i < 12:
            expected[i] = cases[i]
        else:
            # trailing level EXCLUDING the most recent 2 weeks, so a live spike
            # cannot inflate its own expectation (nowcasting-safe baseline).
            end = i - 2 if i >= 14 else i
            level = mean(deseason[max(0, end - 12):end])
            expected[i] = level * seas_s[weeks[i]]
        # count-appropriate control limit: dispersion ~ proportional to expected,
        # with a Poisson-like floor. Avoids one global SD being dominated by the
        # December peak and masking shoulder-season anomalies.
        sd = max(0.13 * expected[i], math.sqrt(max(expected[i], 1.0)), 3.0)
        z[i] = (cases[i] - expected[i]) / sd
    return expected, z, seas_s

# ---------------------------------------------------------------------------
# forecaster
# ---------------------------------------------------------------------------
def build_features(cases, rain, temp, weeks, i):
    return [
        cases[i - 1], cases[i - 2], cases[i - 4],
        mean(cases[i - 4:i]),
        rain[i - 8],
        temp[i],
        math.sin(2 * math.pi * weeks[i] / 52.0),
        math.cos(2 * math.pi * weeks[i] / 52.0),
    ]

def forecast(cases, rain, temp, weeks, seas, horizon=2):
    n = len(cases)
    X, y = [], []
    for i in range(8, n):
        X.append(build_features(cases, rain, temp, weeks, i))
        y.append(cases[i])
    if len(X) < 20:
        return [cases[-1]] * horizon
    model = Ridge(lam=2.0).fit(X, y)
    c = cases[:]; r = rain[:]; t = temp[:]; w = weeks[:]
    preds = []
    last_w = weeks[-1]
    for h in range(1, horizon + 1):
        nw = (last_w + h - 1) % 52 + 1
        # future rainfall/temp: 8-wk-lagged rain is still observed; temp ~ recent seasonal
        r.append(mean([rain[j] for j in range(len(rain)) if weeks[j] == nw]) or rain[-1])
        t.append(mean([temp[j] for j in range(len(temp)) if weeks[j] == nw]) or temp[-1])
        w.append(nw); c.append(0.0)
        idx = len(c) - 1
        row = build_features(c, r, t, w, idx)
        p = max(0.0, model.predict(row))
        c[idx] = p
        preds.append(p)
    return preds

# ---------------------------------------------------------------------------
# prevention gap scoring + resource allocation
# ---------------------------------------------------------------------------
def prevention_gap(rec):
    own, use = rec["itn_ownership_pct"], rec["itn_usage_pct"]
    irs, care, chw = rec["irs_coverage_pct"], rec["careseeking_pct"], rec["chw_reporting_pct"]
    high_burden = rec["tier_high"]
    own_gap = max(0, 95 - own)
    use_gap = max(0, own - use)                 # own nets but don't sleep under them
    irs_gap = max(0, 80 - irs) if high_burden else 0
    care_gap = max(0, 85 - care)
    chw_gap = max(0, 92 - chw)
    score = (0.9 * own_gap + 1.3 * use_gap + 0.7 * irs_gap
             + 0.6 * care_gap + 0.8 * chw_gap)
    return round(score, 1), dict(own_gap=own_gap, use_gap=use_gap, irs_gap=irs_gap,
                                 care_gap=care_gap, chw_gap=chw_gap)

def interventions(rec, gaps):
    out = []
    if gaps["own_gap"] > 10:
        out.append(("ITN mass top-up", "Net ownership %d%% is below the 95%% target." % rec["itn_ownership_pct"]))
    if gaps["use_gap"] > 16:
        out.append(("Behaviour-change campaign (net USAGE)",
                    "Households own nets (%d%%) but only %d%% sleep under them - a %d-pt usage gap."
                    % (rec["itn_ownership_pct"], rec["itn_usage_pct"], gaps["use_gap"])))
    if gaps["irs_gap"] > 20 and rec["tier_high"]:
        out.append(("IRS spray round", "IRS coverage %d%% - spray round overdue for a high-burden district."
                    % rec["irs_coverage_pct"]))
    if gaps["care_gap"] > 8:
        out.append(("Community care-seeking drive", "Care-seeking %d%% - promote early RDT at CHW level."
                    % rec["careseeking_pct"]))
    if gaps["chw_gap"] > 4:
        out.append(("CHW reporting support", "Reporting completeness %d%% - fix blind spots before the peak."
                    % rec["chw_reporting_pct"]))
    out.append(("Pre-position RDTs & ACTs (eLMIS)", "Ensure stock ahead of the forecast peak."))
    return out

# ---------------------------------------------------------------------------
# year-over-year + climate analysis  (+ AI suggestions derived from them)
# ---------------------------------------------------------------------------
def fiscal_year(datestr):
    """Rwanda fiscal year runs Jul->Jun (matches the MOPDD annual report)."""
    y, m, _ = map(int, datestr.split("-"))
    return (y, y + 1) if m >= 7 else (y - 1, y)

def pearson(xs, ys):
    n = len(xs)
    if n < 3:
        return 0.0
    mx, my = mean(xs), mean(ys)
    sx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    sy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if sx == 0 or sy == 0:
        return 0.0
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (sx * sy)

def yoy_series(dates, cases, pop):
    """Confirmed cases + incidence per COMPLETE fiscal year (>=45 wks), with YoY %."""
    agg, wk = defaultdict(int), defaultdict(int)
    for ds, c in zip(dates, cases):
        fy = fiscal_year(ds)
        agg[fy] += c
        wk[fy] += 1
    out = []
    for fy in sorted(agg):
        if wk[fy] < 45:                      # drop partial years at the edges
            continue
        out.append({"fy": "FY%d-%02d" % (fy[0], fy[1] % 100),
                    "cases": agg[fy], "incidence": round(1000 * agg[fy] / pop, 1),
                    "change_pct": None})
    for i in range(1, len(out)):
        prev = out[i - 1]["incidence"] or 1
        out[i]["change_pct"] = round(100 * (out[i]["incidence"] - prev) / prev)
    return out

def climate_analysis(cases, rain, temp, rlead, rain_lead):
    """Quantify the rainfall->cases lag relationship + current transmission signal."""
    lag_x = [rain[i - 8] for i in range(8, len(cases))]
    corr = round(pearson(lag_x, cases[8:]), 2)
    t = temp[-1]
    favourable = (18.0 <= t <= 35.0) and rlead >= 20
    if rain_lead:
        outlook = ("Rain 6-8 weeks ago (%.0f mm/wk) was in the transmission-favourable band "
                   "- expect sustained mosquito pressure into the next 2-4 weeks." % rlead)
    elif favourable:
        outlook = ("Temperature (%.0f C) and recent rain favour transmission; watch the 6-8-week lag."
                   % t)
    else:
        outlook = "Rainfall lead is below the high-risk band - climate pressure easing."
    return {"rain_now": round(rain[-1], 1), "rain_lead_6_8w": round(rlead, 1),
            "temp_c": round(t, 1), "rain_case_corr": corr, "favourable": bool(favourable),
            "favourable_band": "temp 18-35 C · rain > 80 mm/mo · RH > 60%",
            "outlook": outlook}

def seasonal_rain_peak(rain, weeks, cur_w):
    """Nearest UPCOMING seasonal rainfall peak (search the next ~6 months), so the
    'finish prevention before the rains' timing points at the imminent season."""
    seas = defaultdict(list)
    for r, w in zip(rain, weeks):
        seas[w].append(r)
    means = {w: mean(v) for w, v in seas.items() if v}
    best_w, best_k, best_v = cur_w, 0, -1.0
    for k in range(1, 27):
        w = (cur_w + k - 1) % 52 + 1
        if means.get(w, 0.0) > best_v:
            best_v, best_w, best_k = means.get(w, 0.0), w, k
    return best_w, best_k

def district_suggestions(name, rec, yoy, gaps, clim, risk, fc, cases):
    """Turn the trend + climate reading into ranked, explainable recommendations."""
    out = []
    rising_years = sum(1 for y in yoy if y.get("change_pct") and y["change_pct"] > 0)
    latest_change = yoy[-1]["change_pct"] if yoy and yoy[-1].get("change_pct") is not None else 0
    irs, high = rec["irs_coverage_pct"], rec["tier_high"]
    fc_rising = fc[3] > cases[-1] * 1.05
    if risk == "HIGH":
        out.append({"category": "RESPOND", "action": "Verify, then mount an active response now",
                    "why": "%s is flagged HIGH. Confirm CHW reporting + RDT positivity + eLMIS stock, then surge CHW active case-finding and case-management readiness in the flagged sectors." % name})
    if clim["favourable"] and fc_rising:
        out.append({"category": "CLIMATE", "action": "Pre-position ahead of the climate-driven rise",
                    "why": "Forecast keeps rising and the 6-8-week rainfall lead is favourable - pre-position RDTs/ACTs and brief CHWs for the next 2-4 weeks (rain leads cases ~8 wks; local correlation r=%.2f)." % clim["rain_case_corr"]})
    if rising_years >= 2:
        out.append({"category": "INVESTIGATE", "action": "Investigate the multi-year upward trend",
                    "why": "Incidence has risen %d fiscal years running - a structural driver (insecticide resistance, net-use behaviour or environment). Commission a risk-factor investigation, as RBC's report recommends." % rising_years})
    elif latest_change > 20:
        out.append({"category": "INVESTIGATE", "action": "Investigate this year's sharp rise",
                    "why": "Incidence rose %+d%% year-on-year - verify it is not a reporting artefact, then investigate local drivers." % latest_change})
    if irs >= 80 and risk in ("HIGH", "WATCH"):
        out.append({"category": "PREVENTION", "action": "Rising despite IRS - check resistance & outdoor transmission",
                    "why": "IRS coverage is %d%% yet cases are rising abnormally - check insecticide resistance and outdoor/night biting (the 'upsurge despite IRS' the report flags for investigation)." % irs})
    elif high and irs < 50:
        out.append({"category": "PREVENTION", "action": "Evaluate focal IRS for the hotspots",
                    "why": "High-burden district with only %d%% IRS coverage - evaluate focal IRS in the worst sectors ahead of the season." % irs})
    if name in ("Nyamasheke", "Rusizi"):
        out.append({"category": "PREVENTION", "action": "Protect Lake-Kivu occupational groups",
                    "why": "Documented risk factor: fishermen doing night activities on Lake Kivu without protection. Distribute repellents + ensure LLIN access for fishing communities."})
    elif name in ("Nyagatare", "Kayonza", "Kirehe"):
        out.append({"category": "PREVENTION", "action": "Target dam-side & cross-border villages",
                    "why": "Documented risk factor: villages near dams and the Tanzania border. Focus larval-source management and cross-border coordination there."})
    if gaps["use_gap"] > 16:
        out.append({"category": "PREVENTION", "action": "Net-USE behaviour campaign",
                    "why": "Households own %d%% but only %d%% sleep under nets - a %d-pt usage gap." % (rec["itn_ownership_pct"], rec["itn_usage_pct"], gaps["use_gap"])})
    elif gaps["own_gap"] > 10:
        out.append({"category": "PREVENTION", "action": "LLIN top-up distribution",
                    "why": "Net ownership %d%% is below the 95%% target." % rec["itn_ownership_pct"]})
    return out[:5]

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    d_rows = load(os.path.join(DATA_DIR, "malaria_surveillance_district.csv"))
    s_rows = load(os.path.join(DATA_DIR, "malaria_surveillance_sector.csv"))

    by_dist = defaultdict(list)
    for r in d_rows:
        by_dist[r["district"]].append(r)
    for k in by_dist:
        by_dist[k].sort(key=lambda r: r["date"])

    # High-burden districts (real FY2023-24 incidence >= 60 / 1,000, Fig. 27).
    # Drives the IRS-gap term in the prevention engine + the tier_high flag.
    HIGH_BURDEN = {"Nyamagabe", "Gisagara", "Nyamasheke", "Gicumbi", "Bugesera",
                   "Nyagatare", "Gasabo", "Kicukiro", "Nyaruguru", "Muhanga"}

    districts_out, ts_out, prevention_rows, alerts = [], {}, [], []
    nat_cases_latest = 0
    risk_counts = {"HIGH": 0, "WATCH": 0, "LOW": 0}

    for name, rows in by_dist.items():
        cases = [r["confirmed_cases"] for r in rows]
        rain = [r["rainfall_mm"] for r in rows]
        temp = [r["temp_avg_c"] for r in rows]
        weeks = [woy(r["date"]) for r in rows]
        dates = [r["date"] for r in rows]
        last = rows[-1]
        last["tier_high"] = name in HIGH_BURDEN

        expected, z, seas = baseline_and_z(cases, weeks)
        fc = forecast(cases, rain, temp, weeks, seas, horizon=4)   # 1-4 week outlook

        z_latest = z[-1]
        z2 = mean(z[-2:])
        ma4_prev = mean(cases[-5:-1]) or 1.0
        trend_pct = (cases[-1] - ma4_prev) / ma4_prev
        forecast_rising = fc[1] > cases[-1] * 1.05 or fc[3] > cases[-1] * 1.10
        # rainfall lead: rain 6-8 wks ago in the favourable transmission band
        rlead = mean(rain[-8:-5])
        rain_lead = 30 <= rlead <= 75

        gap_score, gaps = prevention_gap(last)

        # ---- risk classification (explainable, purely epidemiological) ----
        # Prevention gaps do NOT change the risk level here - they drive the
        # separate resource-allocation track below, so "risk" always means
        # "is transmission abnormal / rising?".
        drivers = []
        if (z2 >= 2.0 and (trend_pct > 0.10 or forecast_rising)) or z_latest >= 3.0:
            risk = "HIGH"
        elif z2 >= 1.2 or (trend_pct > 0.25 and z2 >= 0.8) or (forecast_rising and rain_lead and z2 >= 1.0):
            risk = "WATCH"
        else:
            risk = "LOW"

        if z2 >= 1.2:
            drivers.append("Cases %+d%% vs expected seasonal baseline (anomaly z=%.1f)"
                           % (round(100 * (cases[-1] - expected[-1]) / (expected[-1] or 1)), z2))
        if trend_pct > 0.12:
            drivers.append("Short-term trend %+d%% vs 4-week average" % round(100 * trend_pct))
        if forecast_rising:
            drivers.append("Forecast rising over 1-4 wks: ~%d then ~%d cases" % (round(fc[0]), round(fc[3])))
        if rain_lead:
            drivers.append("Rainfall 6-8 wks ago favourable for transmission (%.0f mm/wk)" % rlead)
        if gaps["use_gap"] > 16:
            drivers.append("Prevention gap: %d%% own nets but %d%% use them"
                           % (last["itn_ownership_pct"], last["itn_usage_pct"]))
        if gaps["irs_gap"] > 20 and last["tier_high"]:
            drivers.append("IRS coverage only %d%% (spray round overdue)" % last["irs_coverage_pct"])
        if not drivers:
            drivers.append("Within expected seasonal range")

        risk_counts[risk] += 1
        nat_cases_latest += cases[-1]
        inc52 = round(1000 * sum(cases[-52:]) / last["population_at_risk"], 1)

        # year-over-year trend + climate reading + AI suggestions derived from them
        yoy = yoy_series(dates, cases, last["population_at_risk"])
        clim = climate_analysis(cases, rain, temp, rlead, rain_lead)
        sugg = district_suggestions(name, last, yoy, gaps, clim, risk, fc, cases)

        districts_out.append({
            "district": name, "province": last["province"], "risk": risk,
            "lat": COORDS[name][0], "lng": COORDS[name][1],
            "cases_latest": cases[-1], "expected_latest": round(expected[-1]),
            "anomaly_z": round(z2, 2), "trend_pct": round(100 * trend_pct),
            "forecast": [round(x) for x in fc],
            "positivity": round(last["test_positivity_rate"], 2),
            "incidence_per_1000": inc52, "chw_reporting_pct": last["chw_reporting_pct"],
            "population": last["population_at_risk"], "drivers": drivers,
            "prevention_gap": gap_score,
            "rainfall_mm": round(last["rainfall_mm"], 1), "rainfall_lead": round(rlead, 1),
            "temp_avg_c": round(last["temp_avg_c"], 1),
            "climate_signal": bool(rain_lead),
            "yoy": yoy, "climate": clim, "suggestions": sugg,
        })

        # chart timeseries (last 104 weeks)
        k = 104
        ts_out[name] = {
            "weeks": [r["epi_week"] for r in rows[-k:]],
            "actual": cases[-k:],
            "baseline": [round(e) for e in expected[-k:]],
            "forecast_weeks": [f"+{h}w" for h in (1, 2, 3, 4)],
            "forecast": [round(x) for x in fc],
        }

        # prevention + allocation row
        ivs = interventions(last, gaps)
        peak_level = mean([cases[i] for i in range(len(cases)) if weeks[i] in (49, 50, 51)][-3:] or [max(cases[-52:])])
        cur_level = mean(cases[-8:])
        predicted_peak = round(max(cur_level * (max(seas.values()) / (seas[weeks[-1]] or 1)), peak_level))
        avertible = round(predicted_peak * clamp(gap_score / 200.0, 0.05, 0.35))
        prevention_rows.append({
            "district": name, "tier_high": last["tier_high"],
            "itn_ownership_pct": last["itn_ownership_pct"], "itn_usage_pct": last["itn_usage_pct"],
            "irs_coverage_pct": last["irs_coverage_pct"], "careseeking_pct": last["careseeking_pct"],
            "chw_reporting_pct": last["chw_reporting_pct"],
            "prevention_gap": gap_score, "predicted_peak_cases": predicted_peak,
            "vulnerability": round(predicted_peak * (1 + gap_score / 100.0)),
            "est_cases_avertible": avertible,
            "interventions": [{"action": a, "why": w} for a, w in ivs],
        })

        # verify-before-act alert for HIGH / WATCH
        if risk in ("HIGH", "WATCH"):
            alerts.append({
                "level": risk, "scope": "district", "district": name, "sector": None,
                "headline": "%s: %s at district level" % (name, "abnormal rise detected" if risk == "HIGH" else "watch - early signal"),
                "signal": "z=%.1f, %+d%% vs baseline, forecast %d->%d over 4 wks" % (z2, round(100 * (cases[-1] - expected[-1]) / (expected[-1] or 1)), round(fc[0]), round(fc[3])),
                "drivers": drivers,
                "verify_first": [
                    "Confirm CHW reporting completeness (currently %d%%) - rule out a reporting artefact" % last["chw_reporting_pct"],
                    "Cross-check the facility register and RDT positivity (%.0f%%)" % (100 * last["test_positivity_rate"]),
                    "Check RDT & ACT stock for %s in eLMIS" % name,
                ],
                "then_act": ("Deploy CHW surge + confirm case-management stock; consider targeted IRS/larviciding."
                             if risk == "HIGH" else
                             "Notify district health team; pre-position RDTs/ACTs and monitor next 2 weeks."),
                "confidence": "high" if z2 >= 2.5 else "medium",
            })

    # ---- sector drill-down (pilot districts) ----
    by_sec = defaultdict(list)
    for r in s_rows:
        by_sec[(r["district"], r["sector"])].append(r)
    sectors_out = []
    sec_ts = {}
    for (dist, sec), rows in by_sec.items():
        rows.sort(key=lambda r: r["date"])
        cases = [r["confirmed_cases"] for r in rows]
        weeks = [woy(r["date"]) for r in rows]
        expected, z, _ = baseline_and_z(cases, weeks)
        z2 = mean(z[-2:])
        ma4_prev = mean(cases[-5:-1]) or 1.0
        trend_pct = (cases[-1] - ma4_prev) / ma4_prev
        risk = "HIGH" if z2 >= 2.0 else ("WATCH" if z2 >= 1.2 else "LOW")
        sectors_out.append({
            "district": dist, "sector": sec, "risk": risk,
            "cases_latest": cases[-1], "expected_latest": round(expected[-1]),
            "anomaly_z": round(z2, 2), "trend_pct": round(100 * trend_pct),
            "positivity": round(rows[-1]["test_positivity_rate"], 2),
        })
        if dist in PILOTS:
            sec_ts[sec] = {"weeks": [r["epi_week"] for r in rows[-52:]],
                           "actual": cases[-52:], "baseline": [round(e) for e in expected[-52:]]}
        # only raise a SEPARATE alert for genuine sector hotspots (keeps the feed
        # focused); the per-sector risk table above still lists every sector.
        if z2 >= 2.5:
            alerts.append({
                "level": risk, "scope": "sector", "district": dist, "sector": sec,
                "headline": "%s / %s sector: %s" % (dist, sec, "abnormal cluster" if risk == "HIGH" else "watch"),
                "signal": "z=%.1f, %+d%% vs baseline" % (z2, round(100 * trend_pct)),
                "drivers": ["Sector-level cluster driving the %s district signal" % dist],
                "verify_first": ["Confirm with the health centre serving %s" % sec,
                                 "Check for a local reporting change or campaign event"],
                "then_act": "Micro-targeted response: CHW active case finding in %s sector." % sec,
                "confidence": "medium",
            })

    # rank prevention plan by vulnerability
    prevention_rows.sort(key=lambda r: r["vulnerability"], reverse=True)
    for i, r in enumerate(prevention_rows, 1):
        r["priority_rank"] = i

    # order alerts: HIGH first, then WATCH; district before sector
    order = {"HIGH": 0, "WATCH": 1}
    alerts.sort(key=lambda a: (order[a["level"]], a["scope"] == "sector"))

    total_pop = sum(r[-1]["population_at_risk"] for r in [rows for rows in by_dist.values()])
    nat_inc = round(1000 * sum(sum(r["confirmed_cases"] for r in rows[-52:]) for rows in by_dist.values()) / total_pop, 1)
    avg_report = round(mean([d["chw_reporting_pct"] for d in districts_out]), 1)

    # ---- national year-over-year + climate + AI suggestions ----
    nat_agg, nat_wk = defaultdict(int), defaultdict(set)
    for r in d_rows:
        fy = fiscal_year(r["date"]); nat_agg[fy] += r["confirmed_cases"]; nat_wk[fy].add(r["date"])
    nat_yoy = []
    for fy in sorted(nat_agg):
        if len(nat_wk[fy]) < 45:
            continue
        nat_yoy.append({"fy": "FY%d-%02d" % (fy[0], fy[1] % 100), "cases": nat_agg[fy],
                        "incidence": round(1000 * nat_agg[fy] / total_pop, 1), "change_pct": None})
    for i in range(1, len(nat_yoy)):
        prev = nat_yoy[i - 1]["incidence"] or 1
        nat_yoy[i]["change_pct"] = round(100 * (nat_yoy[i]["incidence"] - prev) / prev)

    all_rain = [r["rainfall_mm"] for r in d_rows]
    all_w = [woy(r["date"]) for r in d_rows]
    peak_w, wks_to_peak = seasonal_rain_peak(all_rain, all_w, woy(d_rows[-1]["date"]))
    nat_climate = {"next_peak_week": peak_w, "weeks_to_peak": wks_to_peak,
                   "favourable_band": "temp 18-35 C · rain > 80 mm/mo · RH > 60%",
                   "note": "Rainfall leads malaria cases by ~8 weeks (documented in Rwanda)."}

    nat_sugg = []
    for d in [x for x in districts_out if x["risk"] == "HIGH"]:
        nat_sugg.append({"category": "RESPOND", "action": "Respond now in %s" % d["district"],
                         "why": "Flagged HIGH (%+d%% vs baseline, z=%.1f). Verify reporting + eLMIS stock, then CHW surge in its hotspot sectors." % (d["trend_pct"], d["anomaly_z"])})
    risers = [x for x in districts_out if x["yoy"] and x["yoy"][-1]["change_pct"] not in (None, 0) and x["yoy"][-1]["change_pct"] > 0]
    risers.sort(key=lambda x: -x["yoy"][-1]["change_pct"])
    if risers:
        others = ", ".join(x["district"] for x in risers[1:3])
        nat_sugg.append({"category": "INVESTIGATE", "action": "Investigate the fastest-rising districts",
                         "why": "%s rose %+d%% year-on-year%s. Persistent rises despite prevention need a risk-factor investigation (RBC recommendation)." % (risers[0]["district"], risers[0]["yoy"][-1]["change_pct"], (" (also " + others + ")") if others else "")})
    nat_sugg.append({"category": "CLIMATE", "action": "Time the next prevention round to the rains",
                     "why": "The next major rainfall peak is ~epi-week %d (~%d weeks away). Because rain leads cases by ~8 weeks, plan the next IRS/LLIN round to finish before then; the imminent short-rains rise is already in this week's alerts." % (peak_w, wks_to_peak)})
    nat_sugg.append({"category": "INVESTIGATE", "action": "Track the severe-case & death resurgence",
                     "why": "Nationally severe cases rose ~50%% and deaths ~23%% (report), alongside confirmed artemisinin partial resistance - sustain the MFT rollout and severe-case/death audits."})
    nat_sugg = nat_sugg[:6]

    national = {
        "as_of": TODAY.isoformat(),
        "epi_week": d_rows[-1]["epi_week"],
        "cases_latest_week": nat_cases_latest,
        "incidence_per_1000_annualised": nat_inc,
        "districts_total": len(districts_out),
        "risk_counts": risk_counts,
        "data_completeness_pct": avg_report,
        "active_alerts": len(alerts),
        "context": {
            "national_incidence_fy2023_24": 45,
            "national_incidence_fy2024_25": 76,
            "severe_cases_fy2023_24": 1969,
            "severe_increase_pct": 50,
            "deaths_fy2023_24": 67,
            "deaths_increase_pct": 23,
            "resurgence_note": "National incidence 45 / 1,000 (FY2023-24), then resurged to 76 (FY2024-25); severe cases rose 50% (1,316 -> 1,969) and deaths 23% (51 -> 67). ~15 districts carry ~87% of the burden.",
            "surveillance_gap": "RBC's own report names the gap this tool fills: \"Lack of more granular data (cell, village, and individual level) to inform targeted interventions\" and inadequate decentralized data use for timely response.",
            "source": "RBC / MOPDD Malaria & NTD Annual Report FY2023-24 (primary) + RBC weekly Public Health Bulletins.",
        },
        "total_est_cases_avertible": sum(r["est_cases_avertible"] for r in prevention_rows),
        "yoy": nat_yoy, "climate": nat_climate, "suggestions": nat_sugg,
    }

    meta = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "model": {
            "baseline": "52-week seasonal index rescaled by a 12-week trailing trend",
            "anomaly": "residual z-score control chart (epidemic-threshold style)",
            "forecast": "ridge regression on lags + 8-wk-lag rainfall + temperature + seasonality -> 1-4 week outlook",
            "risk": "explainable fusion of anomaly, trend, forecast, rainfall lead, prevention gap",
            "allocation": "prevention-gap x predicted-peak burden -> ranked interventions",
        },
        "data_status": "PROTOTYPE data calibrated to public RBC figures (see data/sources.md). "
                       "Production reads authorised DHIS2 / RapidSMS / eLMIS feeds.",
        "human_in_the_loop": "Every alert lists a verification step BEFORE any action (verify-before-act).",
    }

    # national aggregate time series for the overview chart (sum across districts)
    k = 104
    week_labels = ts_out["Huye"]["weeks"]
    nat_actual = [0] * k
    nat_base = [0] * k
    for name in ts_out:
        for j in range(k):
            nat_actual[j] += ts_out[name]["actual"][j]
            nat_base[j] += ts_out[name]["baseline"][j]
    nat_fc = [sum(ts_out[n]["forecast"][h] for n in ts_out) for h in range(4)]
    ts_out["National"] = {"weeks": week_labels, "actual": nat_actual,
                          "baseline": nat_base, "forecast_weeks": ["+1w", "+2w", "+3w", "+4w"],
                          "forecast": nat_fc}

    prevention = {"districts": prevention_rows,
                  "national_readiness": round(100 - mean([r["prevention_gap"] for r in prevention_rows]) / 2, 1)}
    sectors = {"sectors": sectors_out, "sector_timeseries": sec_ts}
    hierarchy = build_hierarchy(sectors_out)

    def dump(name, obj):
        with open(os.path.join(OUT_DIR, name), "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))

    dump("national_summary.json", national)
    dump("districts.json", districts_out)
    dump("timeseries.json", ts_out)
    dump("sectors.json", sectors)
    dump("prevention.json", prevention)
    dump("alerts.json", alerts)
    dump("meta.json", meta)
    dump("hierarchy.json", hierarchy)

    # combined bundle the dashboard loads via <script src> (works from file://,
    # so the demo opens with a double-click - no server, no CORS).
    combined = {"national": national, "districts": districts_out, "timeseries": ts_out,
                "sectors": sectors, "prevention": prevention, "alerts": alerts, "meta": meta,
                "hierarchy": hierarchy, "roles": ROLES}
    with open(os.path.join(ROOT, "dashboard", "data.js"), "w", encoding="utf-8") as f:
        f.write("window.EWS_DATA=")
        json.dump(combined, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    print("AI pipeline complete. Wrote 7 JSON files to dashboard/data/")
    print("  National epi-week      :", national["epi_week"])
    print("  Risk mix               :", risk_counts)
    print("  Active alerts          :", len(alerts))
    print("  Top prevention priority:", prevention_rows[0]["district"],
          "(vulnerability %d)" % prevention_rows[0]["vulnerability"])
    print("  Est. cases avertible   :", f"{national['total_est_cases_avertible']:,}")

if __name__ == "__main__":
    main()
