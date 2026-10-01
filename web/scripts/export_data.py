"""Export pipeline JSON into the web app and the FastAPI backend.

- Scrubs any "RBC" references to neutral, judge-safe phrasing (per product rule:
  use the data/insights, but do not name RBC anywhere in the product).
- Writes cleaned copies to  web/data/  (bundled by Next.js for SSR)
  and to  backend/data/  (served by the FastAPI API).
- Copies brand assets into web/public/.

Run:  python web/scripts/export_data.py   (from repo root, or anywhere)
"""
import json
import os
import re
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "dashboard", "data")
OUT_WEB = os.path.join(ROOT, "web", "data")
OUT_API = os.path.join(ROOT, "backend", "data")

# Order matters: specific citation strings first, generic catch-all last.
SUBS = [
    (r"RBC\s*/\s*MOPDD", "MOPDD"),
    (r"MOPDD\s*/\s*RBC", "MOPDD"),
    (r"RBC['’]s", "the national malaria programme's"),
    (r"RBC weekly", "national weekly"),
    (r"RBC recommendation", "national programme recommendation"),
    (r"public RBC figures", "public national malaria figures"),
    (r"\bRBC\b", "the national malaria programme"),
]


def scrub(text: str) -> str:
    for pat, rep in SUBS:
        text = re.sub(pat, rep, text)
    text = text.replace("the the ", "the ")
    text = re.sub(r"  +", " ", text)
    return text


def main() -> None:
    os.makedirs(OUT_WEB, exist_ok=True)
    os.makedirs(OUT_API, exist_ok=True)
    total = 0
    for name in sorted(os.listdir(SRC)):
        if not name.endswith(".json"):
            continue
        raw = open(os.path.join(SRC, name), encoding="utf-8").read()
        hits = len(re.findall(r"RBC", raw))
        total += hits
        cleaned = scrub(raw)
        json.loads(cleaned)  # fail loudly if scrubbing broke the JSON
        open(os.path.join(OUT_WEB, name), "w", encoding="utf-8").write(cleaned)
        open(os.path.join(OUT_API, name), "w", encoding="utf-8").write(cleaned)
        print(f"  {name}: {hits} RBC ref(s) scrubbed")
    print(f"TOTAL RBC references scrubbed: {total}")

    pub = os.path.join(ROOT, "web", "public")
    os.makedirs(pub, exist_ok=True)
    for logo in ("logo.png", "logo_full.png"):
        s = os.path.join(ROOT, "dashboard", logo)
        if os.path.exists(s):
            shutil.copy(s, os.path.join(pub, logo))
            print(f"  copied {logo}")


if __name__ == "__main__":
    main()
