"""
fetch_climate.py  -  Retrieve REAL climate data (open, no API key) for a pilot
district from NASA POWER, proving the pipeline can ingest live climate.

NASA POWER is a free open climate dataset (rainfall PRECTOTCORR, temperature T2M).
Rainfall drives malaria transmission with a ~8-week lag, so climate is a core
predictor in the forecaster (model/ai_pipeline.py).

Usage:  python data/fetch_climate.py            # defaults to Huye
Writes: data/climate_huye_nasa.json  and prints a short summary.

Note: works when the machine is online. The AI pipeline itself runs fully offline
on the calibrated dataset; this script demonstrates the production data source.
"""
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))

# pilot district centroids (lat, lng)
POINTS = {"Huye": (-2.60, 29.74), "Kirehe": (-2.26, 30.71)}


def fetch(district="Huye", start=2024, end=2025, timeout=45):
    lat, lng = POINTS[district]
    url = ("https://power.larc.nasa.gov/api/temporal/monthly/point"
           "?parameters=PRECTOTCORR,T2M&community=AG"
           "&longitude=%s&latitude=%s&start=%d&end=%d&format=JSON"
           % (lng, lat, start, end))
    with urllib.request.urlopen(url, timeout=timeout) as r:
        data = json.load(r)
    out = os.path.join(HERE, "climate_%s_nasa.json" % district.lower())
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f)
    p = data["properties"]["parameter"]
    rain, temp = p["PRECTOTCORR"], p["T2M"]
    months = [k for k in rain if k != "ANN"]
    print("NASA POWER climate retrieved for %s (%.2f, %.2f) -> %s"
          % (district, lat, lng, os.path.basename(out)))
    print("  %d months; sample:" % len(months))
    for k in months[:6]:
        print("    %s  rain=%.1f mm/day  temp=%.1f C" % (k, rain[k], temp[k]))
    return out


if __name__ == "__main__":
    d = sys.argv[1] if len(sys.argv) > 1 else "Huye"
    try:
        fetch(d)
    except Exception as e:
        print("Climate fetch failed (offline?):", e)
        print("The AI pipeline still runs fully on the calibrated local dataset.")
