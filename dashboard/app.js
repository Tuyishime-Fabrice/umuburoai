/* Umuburo AI - dashboard app (vanilla JS + Tailwind classes, offline).
   Role-based access + Nation -> District -> Sector -> Cell -> Village drill-down.
   Reads window.EWS_DATA (model/ai_pipeline.py -> data.js). */
(function () {
  "use strict";
  var D = window.EWS_DATA;
  if (!D) { document.body.innerHTML = '<p style="padding:40px">Run <code>python model/ai_pipeline.py</code> first.</p>'; return; }

  var RC = { HIGH: "#d64541", WATCH: "#e0912a", LOW: "#2ea36b" };
  var LEVELS = ["nation", "district", "sector", "cell", "village"];
  var ROLE = null, VIEW = "overview", NAV = { level: "nation" }, SELV = null;
  var DATASTATE = { connected: {}, uploaded: null };

  var fmt = function (n) { return Math.round(n).toLocaleString("en-US"); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); };
  var sign = function (p) { return (p > 0 ? "+" : "") + p + "%"; };
  var tcls = function (p) { return p > 0 ? "text-[#d64541] font-bold" : (p < 0 ? "text-[#2ea36b] font-bold" : "text-slate-500"); };
  var badge = function (r) { return '<span class="risk-' + r + ' inline-flex items-center gap-1.5 font-bold text-[11px] px-2.5 py-0.5 rounded-full uppercase tracking-wide"><span class="w-1.5 h-1.5 rounded-full dot-' + r + '"></span>' + r + '</span>'; };
  var gold = function (t) { return '<div class="text-gold font-bold text-[11px] tracking-widest uppercase mb-2">' + t + '</div>'; };
  function card(inner, cls) { return '<div class="bg-white rounded-xl shadow-card border border-slate-200/70 p-4 ' + (cls || "") + '">' + inner + '</div>'; }
  function kpi(label, value, sub, accent) {
    var base = accent ? 'text-white' : 'text-navy-900';
    var bg = accent ? 'style="background:linear-gradient(135deg,#0e2f4c,#16436b)"' : '';
    return '<div class="rounded-xl border border-slate-200/70 shadow-card p-4 ' + (accent ? '' : 'bg-white') + '" ' + bg + '>'
      + '<div class="text-[11px] font-semibold uppercase tracking-wide ' + (accent ? 'text-navy-100/80' : 'text-slate-500') + '">' + label + '</div>'
      + '<div class="text-[26px] font-extrabold leading-none mt-1 tabnum ' + base + '">' + value + '</div>'
      + '<div class="text-[11.5px] mt-1.5 ' + (accent ? 'text-navy-100/70' : 'text-slate-500') + '">' + sub + '</div></div>';
  }

  /* ---------- SVG line chart ---------- */
  function path(pts) { return pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" "); }
  function lineChart(ts) {
    if (!ts) return '<p class="text-slate-400 text-sm">No time series at this level.</p>';
    var W = 760, H = 290, m = { t: 16, r: 16, b: 34, l: 50 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var wk = ts.weeks, ac = ts.actual, bl = ts.baseline, fc = ts.forecast || [];
    var n = wk.length, total = n + fc.length;
    var xAt = function (i) { return m.l + iw * (total <= 1 ? 0 : i / (total - 1)); };
    var maxV = Math.max.apply(null, ac.concat(bl, fc)) * 1.14 || 1;
    var yAt = function (v) { return m.t + ih - ih * (v / maxV); };
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '">';
    for (var g = 0; g <= 4; g++) { var y = yAt(maxV * g / 4); s += '<line x1="' + m.l + '" y1="' + y + '" x2="' + (W - m.r) + '" y2="' + y + '" stroke="#eef2f6"/><text x="' + (m.l - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="#8a9bab">' + fmt(maxV * g / 4) + '</text>'; }
    if (fc.length) { var fx = xAt(n - 1); s += '<rect x="' + fx + '" y="' + m.t + '" width="' + (W - m.r - fx) + '" height="' + ih + '" fill="#fbeceb" opacity=".5"/><text x="' + ((fx + W - m.r) / 2) + '" y="' + (m.t + 11) + '" text-anchor="middle" font-size="9" fill="#c25c58" font-weight="700">FORECAST</text>'; }
    var step = Math.max(1, Math.floor(n / 6));
    for (var i = 0; i < n; i += step) s += '<text x="' + xAt(i) + '" y="' + (H - 11) + '" text-anchor="middle" font-size="9" fill="#8a9bab">' + wk[i].replace("20", "'") + '</text>';
    s += '<path d="' + path(bl.map(function (v, i) { return [xAt(i), yAt(v)]; })) + '" fill="none" stroke="#2f6db0" stroke-width="2" opacity=".85"/>';
    s += '<path d="' + path(ac.map(function (v, i) { return [xAt(i), yAt(v)]; })) + '" fill="none" stroke="#0e2f4c" stroke-width="2.6"/>';
    if (fc.length) { var fp = [[xAt(n - 1), yAt(ac[n - 1])]]; fc.forEach(function (v, k) { fp.push([xAt(n + k), yAt(v)]); }); s += '<path d="' + path(fp) + '" fill="none" stroke="#d64541" stroke-width="2.4" stroke-dasharray="6 4"/>'; fc.forEach(function (v, k) { s += '<circle cx="' + xAt(n + k) + '" cy="' + yAt(v) + '" r="3.5" fill="#d64541"/>'; }); }
    s += '<circle cx="' + xAt(n - 1) + '" cy="' + yAt(ac[n - 1]) + '" r="4" fill="#0e2f4c" stroke="#fff" stroke-width="1.5"/></svg>';
    s += '<div class="flex flex-wrap gap-4 mt-1 text-[11.5px] text-slate-500">'
      + '<span class="flex items-center gap-1.5"><span class="inline-block w-4 h-[3px] bg-navy-900"></span>Actual</span>'
      + '<span class="flex items-center gap-1.5"><span class="inline-block w-4 h-[3px]" style="background:#2f6db0"></span>Expected baseline</span>'
      + '<span class="flex items-center gap-1.5"><span class="inline-block w-4 h-[3px]" style="background:repeating-linear-gradient(90deg,#d64541 0 4px,transparent 4px 7px)"></span>AI forecast (1–4 wks)</span></div>';
    return s;
  }
  function sparkline(arr, risk) {
    var W = 120, H = 30, mx = Math.max.apply(null, arr) || 1;
    var pts = arr.map(function (v, i) { return [i / (arr.length - 1) * W, H - (v / mx) * (H - 4) - 2]; });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="110" height="28"><path d="' + path(pts) + '" fill="none" stroke="' + RC[risk] + '" stroke-width="2"/><circle cx="' + pts[pts.length - 1][0] + '" cy="' + pts[pts.length - 1][1] + '" r="2.6" fill="' + RC[risk] + '"/></svg>';
  }

  /* ---------- map ---------- */
  function riskMap(ds) {
    var BB = { latN: -1.02, latS: -2.88, lngW: 28.80, lngE: 30.98 }, W = 520, H = 420, pad = 26;
    var proj = function (lat, lng) { return [pad + (lng - BB.lngW) / (BB.lngE - BB.lngW) * (W - 2 * pad), pad + (BB.latN - lat) / (BB.latN - BB.latS) * (H - 2 * pad)]; };
    var maxc = Math.max.apply(null, ds.map(function (d) { return d.cases_latest; })) || 1;
    var s = '<svg class="map" viewBox="0 0 ' + W + ' ' + H + '"><rect x="8" y="8" width="' + (W - 16) + '" height="' + (H - 16) + '" rx="18" fill="#f3f7fb" stroke="#e3e9f0"/>';
    ds.slice().sort(function (a, b) { var o = { LOW: 0, WATCH: 1, HIGH: 2 }; return o[a.risk] - o[b.risk]; }).forEach(function (d) {
      var p = proj(d.lat, d.lng), r = 7 + Math.sqrt(d.cases_latest / maxc) * 22, c = RC[d.risk];
      if (d.risk !== "LOW") s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (r + 7) + '" fill="' + c + '" opacity=".16"><animate attributeName="r" values="' + (r + 3) + ';' + (r + 11) + ';' + (r + 3) + '" dur="2.4s" repeatCount="indefinite"/></circle>';
      s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + r + '" fill="' + c + '" opacity=".85" stroke="#fff" stroke-width="1.5" class="cursor-pointer"><title>' + d.district + ' — ' + d.risk + '</title></circle>';
      if (d.risk !== "LOW") s += '<text x="' + p[0] + '" y="' + (p[1] - r - 4) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="#152633">' + d.district + '</text>';
    });
    s += '</svg><div class="flex flex-wrap gap-3 mt-1 text-[11.5px] text-slate-500"><span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full" style="background:#d64541"></span>High</span><span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full" style="background:#e0912a"></span>Watch</span><span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full" style="background:#2ea36b"></span>Low</span><span class="text-slate-400">size = weekly cases</span></div>';
    return s;
  }

  /* ---------- climate + drivers ---------- */
  function climatePanel(d) {
    var band = d.climate_signal;
    return gold("Climate driver (rainfall leads cases ~8 wks)")
      + '<div class="grid grid-cols-3 gap-3 text-center">'
      + '<div><div class="text-[22px] font-extrabold tabnum">' + d.rainfall_mm + '</div><div class="text-[10.5px] text-slate-500">rain mm/wk (now)</div></div>'
      + '<div><div class="text-[22px] font-extrabold tabnum ' + (band ? 'text-[#c9801f]' : '') + '">' + d.rainfall_lead + '</div><div class="text-[10.5px] text-slate-500">rain 6–8 wks ago</div></div>'
      + '<div><div class="text-[22px] font-extrabold tabnum">' + d.temp_avg_c + '°</div><div class="text-[10.5px] text-slate-500">avg temp</div></div></div>'
      + '<div class="mt-3 text-[12px] px-3 py-2 rounded-lg ' + (band ? 'bg-[#fbf1df] text-[#8a5a12]' : 'bg-slate-50 text-slate-500') + '">'
      + (band ? '⚠ Rainfall 6–8 weeks ago was in the transmission-favourable band — mosquito pressure building toward the peak.' : 'Rainfall lead indicator not in the high-risk band.') + '</div>';
  }
  function driversList(arr) { return '<ul class="mt-1 space-y-1.5">' + arr.map(function (x) { return '<li class="text-[13px] pl-4 relative"><span class="absolute left-0 text-gold font-bold">›</span>' + esc(x) + '</li>'; }).join("") + '</ul>'; }

  /* ---------- alert card ---------- */
  function alertCard(a) {
    var loc = a.sector ? (a.district + " / " + a.sector + " sector") : (a.district + " district");
    return '<div class="bg-white rounded-xl shadow-card border border-slate-200/70 border-l-4 p-4" style="border-left-color:' + RC[a.level] + '">'
      + '<div class="flex items-center justify-between gap-2 flex-wrap"><h4 class="font-bold text-[15px]">' + loc + '</h4>' + badge(a.level) + '</div>'
      + '<div class="text-[12px] text-slate-500 tabnum my-2">' + esc(a.signal) + '</div>'
      + '<div class="text-[12px] font-semibold">Why flagged</div><ul class="mt-1 mb-2 space-y-1">' + a.drivers.map(function (d) { return '<li class="text-[12.5px] pl-4 relative"><span class="absolute left-0 text-gold">›</span>' + esc(d) + '</li>'; }).join("") + '</ul>'
      + '<div class="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-3 my-2"><div class="text-[10.5px] font-bold uppercase tracking-wide text-navy-600 mb-1">1 · Verify first (human-in-the-loop)</div><ul class="space-y-1 pl-4 list-disc">' + a.verify_first.map(function (v) { return '<li class="text-[12.5px]">' + esc(v) + '</li>'; }).join("") + '</ul></div>'
      + '<div class="rounded-lg p-3 bg-[#e6f5ee] border border-[#bfe6d2]"><div class="text-[10.5px] font-bold uppercase tracking-wide text-[#1c7a4f] mb-0.5">2 · Then act</div><div class="text-[13px]">' + esc(a.then_act) + '</div></div>'
      + '<div class="text-[11px] text-slate-400 mt-2">Model confidence: <b>' + a.confidence + '</b></div></div>';
  }

  /* ---------- CHW community reporting (bottom-up loop, per-viewer localStorage) ---------- */
  function getReports() { try { return JSON.parse(localStorage.getItem("chw_reports") || "[]"); } catch (e) { return []; } }
  function addReport(r) { try { var a = getReports(); a.unshift(r); localStorage.setItem("chw_reports", JSON.stringify(a.slice(0, 50))); } catch (e) { } }
  function reportPanel(village) {
    var reps = getReports().filter(function (r) { return r.village === village; });
    return card(gold("Community reporting (CHW → health centre)")
      + '<p class="text-[12px] text-slate-500 mb-2">Report a suspected or unusual increase in your village. Reports flow up to the health centre for <b>verification</b>, complementing the AI\'s top-down alerts.</p>'
      + '<textarea id="rep-note" rows="2" class="w-full border border-slate-300 rounded-lg p-2 text-[13px] outline-none focus:border-gold focus:ring-2 focus:ring-gold/30" placeholder="e.g. 5 febrile children this week near the wetland"></textarea>'
      + '<button data-act="report" data-village="' + esc(village) + '" class="mt-2 w-full bg-navy-800 hover:bg-navy-700 text-white text-[13px] font-semibold rounded-lg py-2 transition">Report unusual increase</button>'
      + (reps.length ? '<div class="mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Reported from this village</div>' + reps.slice(0, 5).map(function (r) { return '<div class="text-[12px] mt-1 p-2 bg-slate-50 rounded-lg border border-slate-100">' + esc(r.note || "(no note)") + ' <span class="text-slate-400">— ' + esc(r.when) + '</span></div>'; }).join("") : ''));
  }

  /* ---------- scope helpers ---------- */
  function roleDistrict() { return (ROLE.districts && ROLE.districts !== "ALL") ? ROLE.districts[0] : ROLE.district; }
  function scopeDistricts() {
    if (ROLE.scope === "national") return D.districts;
    var dn = roleDistrict();
    return D.districts.filter(function (d) { return d.district === dn; });
  }
  function scopeAlerts() {
    if (ROLE.scope === "national") return D.alerts;
    var dn = roleDistrict();
    return D.alerts.filter(function (a) {
      if (a.district !== dn) return false;
      if (!ROLE.sector) return true;                       // district role: all its alerts
      return a.sector === ROLE.sector || a.scope === "district";
    });
  }
  function baseLevel() { return { national: "nation", district: "district", sector: "sector", cell: "cell", village: "village" }[ROLE.scope]; }
  function initNav() { return { level: baseLevel(), district: roleDistrict(), sector: ROLE.sector, cell: ROLE.cell, village: ROLE.village }; }

  /* ---------- children of a nav node ---------- */
  function childrenOf(nav) {
    if (nav.level === "nation") return { kind: "district", rows: scopeDistricts() };
    if (nav.level === "district") return { kind: "sector", rows: D.sectors.sectors.filter(function (s) { return s.district === nav.district; }) };
    if (nav.level === "sector") return { kind: "cell", rows: D.hierarchy.cells.filter(function (c) { return c.district === nav.district && c.sector === nav.sector; }) };
    if (nav.level === "cell") return { kind: "village", rows: D.hierarchy.villages.filter(function (v) { return v.district === nav.district && v.sector === nav.sector && v.cell === nav.cell; }) };
    return { kind: null, rows: [] };
  }
  function districtObj(name) { return D.districts.filter(function (d) { return d.district === name; })[0]; }
  function sectorObj(dist, sec) { return D.sectors.sectors.filter(function (s) { return s.district === dist && s.sector === sec; })[0]; }

  /* ---------- plain-language summary → voice note & report ---------- */
  function summaryText() {
    var n = D.national;
    if (NAV.level === "nation" || !NAV.district) {
      var high = D.districts.filter(function (d) { return d.risk === "HIGH"; }).map(function (d) { return d.district; });
      var topN = (n.suggestions && n.suggestions[0]) ? n.suggestions[0].action : "";
      return "National malaria overview for epidemiological week " + n.epi_week + ". Annualised incidence is about " + n.incidence_per_1000_annualised + " per one thousand. "
        + (high.length ? high.length + " district" + (high.length > 1 ? "s are" : " is") + " at high risk: " + high.join(", ") + ". " : "No districts are at high risk right now. ")
        + "There are " + n.active_alerts + " active alerts. Nationally, malaria incidence rose from 45 to 76 per one thousand between the last two fiscal years, and about fifteen districts carry most of the burden. "
        + "On climate: the next major rainfall peak is around epidemiological week " + n.climate.next_peak_week + ", and because rainfall leads cases by about eight weeks, the next prevention round should finish before then. "
        + (topN ? "Top suggestion: " + topN + "." : "");
    }
    var d = districtObj(NAV.district); if (!d) return "";
    var trend = d.trend_pct > 0 ? ("up " + d.trend_pct + " percent") : (d.trend_pct < 0 ? ("down " + Math.abs(d.trend_pct) + " percent") : "flat");
    var rl = { HIGH: "high risk — an abnormal rise", WATCH: "watch — an early signal", LOW: "low — within the normal range for this season" }[d.risk];
    var t = d.district + " district, epidemiological week " + n.epi_week + ". Risk level: " + rl + ". "
      + "This week there are about " + fmt(d.cases_latest) + " confirmed cases, against an expected " + fmt(d.expected_latest) + ". The trend is " + trend + " versus the four-week average. "
      + "The forecast for the next one to four weeks is about " + fmt(d.forecast[0]) + " rising to " + fmt(d.forecast[3]) + " cases. "
      + "Main drivers: " + d.drivers.join("; ") + ". "
      + (d.climate ? "Climate signal: " + d.climate.outlook + " " : "")
      + (d.suggestions && d.suggestions[0] ? "Top suggestion: " + d.suggestions[0].action + ". " : "")
      + (d.risk === "HIGH" ? "Remember to verify the signal with the health centre and district team before you act." : "Recommended: continue routine monitoring and keep prevention coverage up.");
    return t;
  }
  function speakSummary() {
    if (!("speechSynthesis" in window)) { alert("Voice narration is not supported in this browser."); return; }
    var s = window.speechSynthesis;
    if (s.speaking || s.pending) { s.cancel(); return; }         // toggle: click again to stop
    var u = new SpeechSynthesisUtterance(summaryText());
    u.rate = 0.98; u.pitch = 1.0; u.lang = "en-US";
    s.cancel(); s.speak(u);
  }
  function openReport() {
    var d = NAV.district ? districtObj(NAV.district) : null;
    var title = d ? (d.district + " District — Malaria Early-Warning Report") : "National Malaria Early-Warning Report";
    var rows = "";
    if (d) {
      rows = [["Risk level", d.risk], ["Cases this week", fmt(d.cases_latest)], ["Expected (baseline)", fmt(d.expected_latest)],
        ["Anomaly z-score", d.anomaly_z], ["Trend vs 4-wk avg", sign(d.trend_pct)],
        ["Forecast (1→4 wk)", fmt(d.forecast[0]) + " → " + fmt(d.forecast[3])], ["Test positivity", Math.round(d.positivity * 100) + "%"],
        ["Incidence /1,000", d.incidence_per_1000], ["CHW reporting", d.chw_reporting_pct + "%"]]
        .map(function (r) { return "<tr><td>" + r[0] + "</td><td><b>" + r[1] + "</b></td></tr>"; }).join("");
    }
    var drivers = d ? ("<h3>Why this level</h3><ul>" + d.drivers.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>") : "";
    // year-on-year + climate + AI suggestions (the analysis this report is built to convey)
    var yoy = d ? d.yoy : D.national.yoy;
    var sugg = d ? d.suggestions : D.national.suggestions;
    var yoyH = (yoy && yoy.length) ? ("<h3>Year-on-year incidence (per 1,000)</h3><table>" + yoy.map(function (y) { return "<tr><td>" + y.fy + "</td><td><b>" + y.incidence + "</b>" + (y.change_pct != null ? (" <span class='muted'>(" + sign(y.change_pct) + " vs prior year)</span>") : "") + "</td></tr>"; }).join("") + "</table>") : "";
    var climH;
    if (d && d.climate) { var cc = d.climate; climH = "<h3>Climate &amp; weather signal</h3><div class='sum'>" + esc(cc.outlook) + "<br><span class='muted'>Rain 6–8 wks ago " + cc.rain_lead_6_8w + " mm/wk · avg temp " + cc.temp_c + "°C · rain→cases correlation " + cc.rain_case_corr + " at an 8-week lag · favourable band " + esc(cc.favourable_band) + "</span></div>"; }
    else { var nc = D.national.climate; climH = "<h3>Climate &amp; weather signal</h3><div class='sum'>" + esc(nc.note) + " Next major rainfall peak ≈ epi-week " + nc.next_peak_week + " (~" + nc.weeks_to_peak + " weeks away) — plan the next IRS/LLIN round to finish before then. <span class='muted'>Favourable band " + esc(nc.favourable_band) + "</span></div>"; }
    var suggH = (sugg && sugg.length) ? ("<h3>AI suggestions — verify first, then act</h3><ul>" + sugg.map(function (s) { return "<li><b>[" + esc(s.category) + "] " + esc(s.action) + "</b> — " + esc(s.why) + "</li>"; }).join("") + "</ul>") : "";
    var html = '<!doctype html><html><head><meta charset="utf-8"><title>' + title + '</title>'
      + '<style>body{font-family:Segoe UI,Arial,sans-serif;color:#152633;max-width:760px;margin:32px auto;padding:0 20px}'
      + 'h1{color:#0e2f4c;border-bottom:3px solid #d8a534;padding-bottom:8px;font-size:22px}h3{color:#16436b;margin-top:22px}'
      + 'table{border-collapse:collapse;width:100%;margin-top:8px}td{padding:7px 10px;border-bottom:1px solid #e3e9f0;font-size:14px}'
      + '.tag{display:inline-block;background:#d8a534;color:#0e2f4c;font-weight:800;font-size:11px;padding:3px 8px;border-radius:4px}'
      + '.muted{color:#5f7488;font-size:12px}.sum{background:#f4f6f9;border:1px solid #e3e9f0;border-radius:8px;padding:14px;font-size:14px;line-height:1.6}'
      + '@media print{.noprint{display:none}}</style></head><body>'
      + '<div class="tag">UMUBURO AI · RBC</div><h1>' + title + '</h1>'
      + '<div class="muted">Generated ' + new Date().toLocaleString() + ' · Epi week ' + D.national.epi_week + ' · Prototype — demo data, not official RBC statistics</div>'
      + '<h3>Summary</h3><div class="sum">' + esc(summaryText()) + '</div>'
      + (rows ? "<h3>Key indicators</h3><table>" + rows + "</table>" : "")
      + drivers + yoyH + climH + suggH
      + '<p class="muted" style="margin-top:24px">Umuburo AI — AI for a Malaria-Free Tomorrow · AI recommends · people verify · then act.</p>'
      + '<button class="noprint" onclick="window.print()" style="margin-top:16px;background:#0e2f4c;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-weight:700;cursor:pointer">Print / Save as PDF</button>'
      + '</body></html>';
    var w = window.open("", "_blank");
    if (!w) { alert("Please allow pop-ups to open the report."); return; }
    w.document.write(html); w.document.close();
  }
  function actionBar() {
    return '<div class="flex flex-wrap gap-2 mb-4">'
      + '<button data-act="listen" class="text-[13px] font-semibold bg-white border border-slate-300 rounded-lg px-3.5 py-2 hover:border-gold transition">&#128266; Listen (voice note)</button>'
      + '<button data-act="genreport" class="text-[13px] font-semibold bg-white border border-slate-300 rounded-lg px-3.5 py-2 hover:border-gold transition">&#128196; Generate report</button></div>';
  }

  /* ================= VIEWS ================= */
  function riskKey() {
    return '<div class="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-600 mb-4">'
      + '<span class="flex items-center gap-1.5">' + badge("HIGH") + ' rising abnormally — act now</span>'
      + '<span class="flex items-center gap-1.5">' + badge("WATCH") + ' early signal — keep watch</span>'
      + '<span class="flex items-center gap-1.5">' + badge("LOW") + ' normal for the season</span></div>';
  }
  function situationCard(high, watch) {
    if (high.length) {
      var d0 = high[0];
      return '<div class="rounded-xl mb-4 overflow-hidden shadow-card border border-[#f3c9c6]">'
        + '<div class="bg-[#d64541] text-white px-4 py-3 flex items-center justify-between flex-wrap gap-2"><div class="flex items-center gap-2"><span class="text-2xl">⚠</span><b class="text-[16px]">Action needed today</b></div>'
        + '<button data-act="drill" data-level="district" data-district="' + d0.district + '" class="bg-white text-[#d64541] font-bold text-[13px] rounded-lg px-4 py-2">See ' + d0.district + ' →</button></div>'
        + '<div class="bg-white px-4 py-3 text-[14px] text-slate-700"><b>' + d0.district + '</b> is rising <b>abnormally</b> — about <b>' + sign(d0.trend_pct) + '</b> above its normal level for this time of year, and the forecast keeps climbing, weeks before the usual Nov/Dec peak.' + (watch.length ? ' <b>' + watch.length + '</b> more district(s) on watch.' : '') + ' Open the alert, verify it, then act.</div></div>';
    }
    if (watch.length) {
      return '<div class="rounded-xl mb-4 p-4 shadow-card border border-[#f0d9b3] bg-[#fbf1df] text-[#8a5a12] text-[14px]"><b>Keep watch.</b> ' + watch.length + ' district(s) show an early signal (' + watch.map(function (d) { return d.district; }).join(", ") + '). No abnormal outbreak yet — monitor over the coming weeks.</div>';
    }
    return '<div class="rounded-xl mb-4 p-4 shadow-card border border-[#bfe6d2] bg-[#e6f5ee] text-[#1c7a4f] text-[14px]"><b>All clear.</b> No abnormal malaria rises detected right now across monitored districts.</div>';
  }

  function renderOverview() {
    if (ROLE.scope !== "national") { NAV = initNav(); return renderDrill(); }
    var n = D.national, ds = D.districts;
    var high = ds.filter(function (d) { return d.risk === "HIGH"; }), watch = ds.filter(function (d) { return d.risk === "WATCH"; });
    var k = '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">'
      + kpi("National incidence", n.incidence_per_1000_annualised, "per 1,000 / yr", true)
      + kpi("Cases this week", fmt(n.cases_latest_week), n.epi_week)
      + kpi("Active alerts", n.active_alerts, "verify-before-act")
      + kpi("Districts HIGH", n.risk_counts.HIGH, high.map(function (d) { return d.district; }).join(", ") || "none")
      + kpi("Districts WATCH", n.risk_counts.WATCH, watch.map(function (d) { return d.district; }).join(", ") || "none")
      + kpi("Data completeness", n.data_completeness_pct + "%", "CHW reporting") + '</div>';
    var feed = scopeAlerts().slice(0, 4).map(function (a) { return alertCard(a); }).join("");
    return situationCard(high, watch) + riskKey() + k
      + '<div class="flex gap-2.5 items-start p-3 rounded-xl mb-4 bg-navy-50 border border-navy-100 text-navy-700 text-[12.5px]"><span>ⓘ</span><div>' + esc(n.context.resurgence_note) + '</div></div>'
      + '<div class="grid lg:grid-cols-2 gap-4 items-start">'
      + card(gold("District risk map") + '<div data-act="drill" data-level="nation" class="cursor-default">' + riskMap(ds) + '</div>')
      + '<div>' + gold("Live alert feed") + '<div class="space-y-3">' + feed + '</div><p class="text-[11.5px] text-slate-400 mt-2">Full detail in the Alerts tab →</p></div>'
      + '</div>'
      + card(gold("National cases — anomaly &amp; 1–4 week forecast") + lineChart(D.timeseries.National), "mt-4");
  }

  function crumbBar() {
    var b = LEVELS.indexOf(baseLevel()), c = LEVELS.indexOf(NAV.level);
    var labels = { nation: "Rwanda (National)", district: NAV.district, sector: NAV.sector + " sector", cell: NAV.cell + " cell", village: NAV.village };
    var parts = [];
    for (var i = b; i <= c; i++) {
      var lv = LEVELS[i], last = (i === c);
      parts.push(last ? '<span class="font-bold text-navy-900">' + esc(labels[lv]) + '</span>'
        : '<span class="crumb text-navy-600" data-act="crumb" data-level="' + lv + '">' + esc(labels[lv]) + '</span>');
    }
    return '<div class="text-[13px] mb-3 flex items-center gap-1.5 flex-wrap">' + parts.join('<span class="text-slate-300">▸</span>') + '</div>';
  }

  function renderDrill() {
    // village leaf (e.g., a village CHW's home view) — no children, show household detail + actions
    if (NAV.level === "village") {
      var vv = SELV || D.hierarchy.villages.filter(function (x) { return x.district === NAV.district && x.sector === NAV.sector && x.cell === NAV.cell && x.village === NAV.village; })[0];
      var act = card(gold("What to do here") + driversList([
        vv && vv.itn_use < 65 ? "Run a net-use behaviour campaign — households own nets but too few sleep under them." : "Maintain net-use messaging at household visits.",
        vv && vv.irs === "pending" ? "Flag this village for the next IRS spray round (currently pending)." : "IRS done — verify coverage during visits.",
        "Active case finding: test febrile household members with RDTs; report positives via RapidSMS.",
        "Confirm the signal with the health centre before escalating (verify-before-act)."]));
      return crumbBar() + '<div class="grid lg:grid-cols-2 gap-4 items-start">' + villageCard(vv) + act + '</div>'
        + '<div class="mt-4">' + reportPanel(vv.village) + '</div>';
    }
    var ch = childrenOf(NAV), kind = ch.kind, rows = ch.rows;
    var head = crumbBar();
    // node detail
    var detail = "", chart = "";
    if (NAV.level === "nation") {
      detail = card(gold("National summary") + '<div class="grid grid-cols-2 gap-2 text-[13px]"><div class="flex justify-between border-b border-slate-100 py-1"><span>Incidence /1k</span><b>' + D.national.incidence_per_1000_annualised + '</b></div><div class="flex justify-between border-b border-slate-100 py-1"><span>HIGH</span><b>' + D.national.risk_counts.HIGH + '</b></div><div class="flex justify-between border-b border-slate-100 py-1"><span>WATCH</span><b>' + D.national.risk_counts.WATCH + '</b></div><div class="flex justify-between border-b border-slate-100 py-1"><span>Alerts</span><b>' + D.national.active_alerts + '</b></div></div>');
      chart = card(gold("National cases — anomaly &amp; forecast") + lineChart(D.timeseries.National));
    } else if (NAV.level === "district") {
      var d = districtObj(NAV.district);
      detail = card(gold(NAV.district + " · " + d.province + " Province") + '<div class="flex items-center justify-between mb-2">' + badge(d.risk) + '<span class="' + tcls(d.trend_pct) + ' text-[13px]">' + sign(d.trend_pct) + ' vs 4-wk avg</span></div>'
        + '<div class="grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px]"><div class="flex justify-between border-b border-slate-100 py-1"><span>Cases</span><b>' + fmt(d.cases_latest) + '</b></div><div class="flex justify-between border-b border-slate-100 py-1"><span>Expected</span><b>' + fmt(d.expected_latest) + '</b></div><div class="flex justify-between border-b border-slate-100 py-1"><span title="How far above the normal level for this week — 2 or more means abnormal.">Above normal (z) ⓘ</span><b>' + d.anomaly_z + '</b></div><div class="flex justify-between border-b border-slate-100 py-1"><span>Forecast (1→4 wk)</span><b>' + fmt(d.forecast[0]) + '→' + fmt(d.forecast[3]) + '</b></div><div class="flex justify-between border-b border-slate-100 py-1"><span>Positivity</span><b>' + Math.round(d.positivity * 100) + '%</b></div><div class="flex justify-between border-b border-slate-100 py-1"><span>Reporting</span><b>' + d.chw_reporting_pct + '%</b></div></div>'
        + '<div class="text-[12px] font-semibold mt-3">Why this level</div>' + driversList(d.drivers))
        + card(climatePanel(d), "mt-4");
      chart = card(gold(NAV.district + " — cases vs expected &amp; forecast") + lineChart(D.timeseries[NAV.district]));
    } else if (NAV.level === "sector") {
      var s = sectorObj(NAV.district, NAV.sector);
      var sts = D.sectors.sector_timeseries[NAV.sector];
      detail = card(gold(NAV.sector + " sector · " + NAV.district) + '<div class="flex items-center justify-between mb-2">' + badge(s.risk) + '<span class="' + tcls(s.trend_pct) + ' text-[13px]">' + sign(s.trend_pct) + '</span></div>'
        + '<div class="grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px]"><div class="flex justify-between border-b border-slate-100 py-1"><span>Cases</span><b>' + fmt(s.cases_latest) + '</b></div><div class="flex justify-between border-b border-slate-100 py-1"><span>Expected</span><b>' + fmt(s.expected_latest) + '</b></div><div class="flex justify-between border-b border-slate-100 py-1"><span title="How far above the normal level for this week — 2 or more means abnormal.">Above normal (z) ⓘ</span><b>' + s.anomaly_z + '</b></div><div class="flex justify-between border-b border-slate-100 py-1"><span>Positivity</span><b>' + Math.round(s.positivity * 100) + '%</b></div></div>'
        + '<p class="text-[12px] text-slate-500 mt-3">Drill into cells to find the exact cluster driving this sector, then villages for household action.</p>');
      chart = sts ? card(gold(NAV.sector + " — cases vs expected") + lineChart(sts)) : "";
    } else if (NAV.level === "cell") {
      var c = D.hierarchy.cells.filter(function (x) { return x.district === NAV.district && x.sector === NAV.sector && x.cell === NAV.cell; })[0];
      detail = card(gold(NAV.cell + " cell") + '<div class="flex items-center justify-between mb-2">' + badge(c.risk) + sparkline(c.spark, c.risk) + '</div>'
        + '<div class="grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px]"><div class="flex justify-between border-b border-slate-100 py-1"><span>Cases</span><b>' + fmt(c.cases_latest) + '</b></div><div class="flex justify-between border-b border-slate-100 py-1"><span>Expected</span><b>' + fmt(c.expected) + '</b></div><div class="flex justify-between border-b border-slate-100 py-1"><span>Positivity</span><b>' + Math.round(c.positivity * 100) + '%</b></div></div>'
        + '<p class="text-[12px] text-slate-500 mt-3">Drill into villages for household-level prevention targeting.</p>');
    } else if (NAV.level === "village") {
      var v = SELV || childrenOf({ level: "cell", district: NAV.district, sector: NAV.sector, cell: NAV.cell }).rows[0];
      detail = villageCard(v);
    }
    // children table
    var tbl = childrenTable(kind, rows);
    var actions = (NAV.level === "nation" || NAV.level === "district") ? actionBar() : "";
    var grid = '<div class="grid lg:grid-cols-5 gap-4 items-start"><div class="lg:col-span-3">' + tbl + '</div><div class="lg:col-span-2 space-y-4">' + detail + '</div></div>';
    return head + actions + grid + (chart ? '<div class="mt-4">' + chart + '</div>' : "");
  }

  function villageCard(v) {
    if (!v) return card("<p class='text-slate-400'>Select a village.</p>");
    var gapV = v.itn_ownership - v.itn_use, low = v.itn_use < 65;
    return card(gold(v.village + " · village") + '<div class="flex items-center justify-between mb-2">' + badge(v.risk) + '<span class="text-[12px] text-slate-500">' + v.households + ' households</span></div>'
      + '<div class="grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px]"><div class="flex justify-between border-b border-slate-100 py-1"><span>Cases (wk)</span><b>' + v.cases_latest + '</b></div><div class="flex justify-between border-b border-slate-100 py-1"><span>Care-seeking</span><b>' + v.careseeking + '%</b></div><div class="flex justify-between border-b border-slate-100 py-1"><span>Net ownership</span><b>' + v.itn_ownership + '%</b></div><div class="flex justify-between border-b border-slate-100 py-1"><span>Net <u>usage</u></span><b class="' + (low ? 'text-[#d64541]' : '') + '">' + v.itn_use + '%</b></div><div class="flex justify-between border-b border-slate-100 py-1"><span>IRS spray</span><b class="' + (v.irs === 'pending' ? 'text-[#c9801f]' : 'text-[#2ea36b]') + '">' + v.irs + '</b></div></div>'
      + (low ? '<div class="mt-3 text-[12px] px-3 py-2 rounded-lg bg-[#fbe9e8] text-[#7f2420]">⚠ Behaviour gap: households own nets (' + v.itn_ownership + '%) but only ' + v.itn_use + '% sleep under them → CHW net-use campaign + active case finding here.</div>'
        : '<div class="mt-3 text-[12px] px-3 py-2 rounded-lg bg-[#e6f5ee] text-[#1c7a4f]">Prevention coverage adequate; maintain CHW surveillance.</div>'));
  }

  function childrenTable(kind, rows) {
    if (!kind || !rows.length) return card('<p class="text-slate-400 text-sm">Sector/cell/village drill-down is available for the pilot districts (Kirehe, Nyamasheke).</p>');
    rows = rows.slice().sort(function (a, b) { var o = { HIGH: 0, WATCH: 1, LOW: 2 }; return (o[a.risk] - o[b.risk]) || (b.cases_latest - a.cases_latest); });
    var cols, body, title, deeper = (kind !== "village");
    if (kind === "district") {
      title = "Districts"; cols = ["District", "Province", "Risk", "Cases", "z", "Trend", "Fcst +4w", "Inc/1k"];
      body = rows.map(function (d) { return row(deeper, { level: "district", district: d.district }, ['<b>' + d.district + '</b>', '<span class="text-slate-500 text-[12px]">' + d.province + '</span>', badge(d.risk), fmt(d.cases_latest), d.anomaly_z, '<span class="' + tcls(d.trend_pct) + '">' + sign(d.trend_pct) + '</span>', fmt(d.forecast[3]), d.incidence_per_1000]); }).join("");
    } else if (kind === "sector") {
      title = "Sectors"; cols = ["Sector", "Risk", "Cases", "Expected", "z", "Trend"];
      body = rows.map(function (s) { return row(deeper, { level: "sector", district: s.district, sector: s.sector }, ['<b>' + s.sector + '</b>', badge(s.risk), fmt(s.cases_latest), fmt(s.expected_latest), s.anomaly_z, '<span class="' + tcls(s.trend_pct) + '">' + sign(s.trend_pct) + '</span>']); }).join("");
    } else if (kind === "cell") {
      title = "Cells"; cols = ["Cell", "Risk", "Cases", "Expected", "Trend"];
      body = rows.map(function (c) { return row(deeper, { level: "cell", district: c.district, sector: c.sector, cell: c.cell }, ['<b>' + c.cell + '</b>', badge(c.risk), fmt(c.cases_latest), fmt(c.expected), sparkline(c.spark, c.risk)]); }).join("");
    } else {
      title = "Villages"; cols = ["Village", "Risk", "Cases", "Households", "Net use", "IRS"];
      body = rows.map(function (v) { return '<tr class="cursor-pointer hover:bg-slate-50" data-act="village" data-district="' + v.district + '" data-sector="' + v.sector + '" data-cell="' + v.cell + '" data-village="' + v.village + '"><td class="py-2 px-2.5 border-b border-slate-100"><b>' + v.village + '</b></td><td class="py-2 px-2.5 border-b border-slate-100">' + badge(v.risk) + '</td><td class="py-2 px-2.5 border-b border-slate-100 text-right tabnum">' + v.cases_latest + '</td><td class="py-2 px-2.5 border-b border-slate-100 text-right tabnum">' + v.households + '</td><td class="py-2 px-2.5 border-b border-slate-100 text-right tabnum ' + (v.itn_use < 65 ? 'text-[#d64541] font-bold' : '') + '">' + v.itn_use + '%</td><td class="py-2 px-2.5 border-b border-slate-100 text-[12px]">' + v.irs + '</td></tr>'; }).join("");
    }
    var th = cols.map(function (c, i) { return '<th class="text-' + (i > 1 ? 'right' : 'left') + ' py-2 px-2.5 border-b-2 border-slate-200 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">' + c + '</th>'; }).join("");
    return card(gold(title + (deeper ? " · click a row to drill down" : " · click for household detail")) + '<div class="overflow-auto max-h-[560px]"><table class="w-full text-[13px]"><thead class="sticky top-0 bg-white"><tr>' + th + '</tr></thead><tbody>' + body + '</tbody></table></div>');
  }
  function row(clickable, nav, cells) {
    var attrs = clickable ? ' class="cursor-pointer hover:bg-slate-50" data-act="drill" data-level="' + nav.level + '" data-district="' + (nav.district || "") + '" data-sector="' + (nav.sector || "") + '" data-cell="' + (nav.cell || "") + '"' : '';
    return '<tr' + attrs + '>' + cells.map(function (c, i) { return '<td class="py-2 px-2.5 border-b border-slate-100 ' + (i > 1 ? 'text-right tabnum' : '') + '">' + c + '</td>'; }).join("") + '</tr>';
  }

  function renderPrevention() {
    if (ROLE.scope === "sector" || ROLE.scope === "cell" || ROLE.scope === "village") return renderHousehold();
    var ds = ROLE.scope === "national" ? D.prevention.districts : D.prevention.districts.filter(function (r) { return r.district === roleDistrict(); });
    var totalAvert = ds.reduce(function (s, r) { return s + r.est_cases_avertible; }, 0);
    var rowsH = ds.map(function (r) {
      var ivs = r.interventions.map(function (i) { var w = /USAGE|top-up|IRS/.test(i.action); return '<span class="inline-block ' + (w ? 'bg-[#fbf1df] border-[#f0d9b3] text-[#8a5a12]' : 'bg-slate-50 border-slate-200') + ' border rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold mr-1 mb-1" title="' + esc(i.why) + '">' + i.action + '</span>'; }).join("");
      return '<tr><td class="py-2 px-2.5 border-b border-slate-100 text-center"><b>' + r.priority_rank + '</b></td><td class="py-2 px-2.5 border-b border-slate-100"><b>' + r.district + '</b>' + (r.tier_high ? ' <span class="text-slate-400 text-[11px]">high-burden</span>' : '') + '</td><td class="py-2 px-2.5 border-b border-slate-100 text-right tabnum">' + r.prevention_gap.toFixed(0) + '</td><td class="py-2 px-2.5 border-b border-slate-100 text-right tabnum">' + fmt(r.predicted_peak_cases) + '</td><td class="py-2 px-2.5 border-b border-slate-100 text-right tabnum"><b>' + fmt(r.vulnerability) + '</b></td><td class="py-2 px-2.5 border-b border-slate-100 text-right tabnum text-[#1c7a4f] font-bold">~' + fmt(r.est_cases_avertible) + '</td><td class="py-2 px-2.5 border-b border-slate-100">' + ivs + '</td></tr>'; }).join("");
    var cov = ds.slice().sort(function (a, b) { return (b.itn_ownership_pct - b.itn_usage_pct) - (a.itn_ownership_pct - a.itn_usage_pct); }).map(function (r) {
      var gapv = r.itn_ownership_pct - r.itn_usage_pct;
      return '<div class="grid grid-cols-[110px_1fr] gap-2.5 items-center my-1.5"><div class="text-[12.5px] font-semibold">' + r.district + '</div><div class="relative h-[22px] bg-slate-50 rounded-md border border-slate-200 overflow-hidden"><div class="absolute top-0 left-0 h-full" style="width:' + r.itn_ownership_pct + '%;background:#cfe0f2"></div><div class="absolute top-0 left-0 h-full rounded-l-md" style="width:' + r.itn_usage_pct + '%;background:#2f6db0"></div><span class="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-bold">' + r.itn_usage_pct + '% use / ' + r.itn_ownership_pct + '% own' + (gapv >= 18 ? ' <span class="text-[#d64541]">▲' + gapv + 'pt</span>' : '') + '</span></div></div>'; }).join("");
    var head = '<div class="flex gap-3 items-start p-3.5 rounded-xl mb-4 bg-navy-50 border border-navy-100 text-navy-700 text-[13px]"><span class="text-lg">🛡</span><div><b>Beyond alerts → action.</b> Ranks where to spend prevention effort <i>before</i> the season by combining predicted peak burden with prevention gaps (nets owned vs <i>used</i>, IRS status, care-seeking). Weak areas get help first.</div></div>';
    var krow = '<div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">'
      + kpi("Prevention readiness", D.prevention.national_readiness + "/100", "composite index", true)
      + kpi("Est. cases avertible", "~" + fmt(totalAvert), "this peak, if acted on")
      + kpi("Top priority", ds[0].district, "vuln " + fmt(ds[0].vulnerability) + " · " + ds[0].interventions[0].action) + '</div>';
    return head + krow
      + card(gold("Pre-season resource-allocation plan (ranked by vulnerability)") + '<div class="overflow-auto"><table class="w-full text-[13px]"><thead><tr>' + ["#", "District", "Gap", "Predicted peak", "Vulnerability", "Avertible", "Recommended interventions"].map(function (c, i) { return '<th class="text-' + (i >= 2 && i <= 5 ? "right" : "left") + ' py-2 px-2.5 border-b-2 border-slate-200 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">' + c + '</th>'; }).join("") + '</tr></thead><tbody>' + rowsH + '</tbody></table></div><p class="text-[11.5px] text-slate-400 mt-2">Vulnerability = predicted peak × (1 + prevention gap). “Avertible” is an illustrative planning estimate.</p>')
      + card(gold("Net ownership vs. actual usage — the behaviour gap") + '<div class="flex gap-3 text-[11.5px] text-slate-500 mb-2"><span class="flex items-center gap-1.5"><span class="inline-block w-4 h-3 rounded" style="background:#cfe0f2"></span>Own a net</span><span class="flex items-center gap-1.5"><span class="inline-block w-4 h-3 rounded" style="background:#2f6db0"></span>Actually use it</span></div>' + cov, "mt-4");
  }

  function renderHousehold() {
    var dn = roleDistrict();
    var vs = D.hierarchy.villages.filter(function (v) {
      return v.district === dn && (!ROLE.sector || v.sector === ROLE.sector) && (!ROLE.cell || v.cell === ROLE.cell) && (!ROLE.village || v.village === ROLE.village);
    });
    var scopeName = ROLE.village ? (ROLE.village + " village") : (ROLE.cell ? (ROLE.cell + " cell") : (ROLE.sector + " sector"));
    vs.sort(function (a, b) { return a.itn_use - b.itn_use; });
    var lowN = vs.filter(function (v) { return v.itn_use < 65; }).length, hh = vs.reduce(function (s, v) { return s + v.households; }, 0);
    var rowsH = vs.map(function (v) { return '<tr class="cursor-pointer hover:bg-slate-50" data-act="village" data-district="' + v.district + '" data-sector="' + v.sector + '" data-cell="' + v.cell + '" data-village="' + v.village + '"><td class="py-2 px-2.5 border-b border-slate-100"><b>' + v.village + '</b> <span class="text-slate-400 text-[11px]">' + v.cell + '</span></td><td class="py-2 px-2.5 border-b border-slate-100">' + badge(v.risk) + '</td><td class="py-2 px-2.5 border-b border-slate-100 text-right tabnum">' + v.households + '</td><td class="py-2 px-2.5 border-b border-slate-100 text-right tabnum">' + v.itn_ownership + '%</td><td class="py-2 px-2.5 border-b border-slate-100 text-right tabnum ' + (v.itn_use < 65 ? 'text-[#d64541] font-bold' : '') + '">' + v.itn_use + '%</td><td class="py-2 px-2.5 border-b border-slate-100 text-[12px] ' + (v.irs === 'pending' ? 'text-[#c9801f]' : 'text-[#2ea36b]') + '">' + v.irs + '</td></tr>'; }).join("");
    return '<div class="flex gap-3 items-start p-3.5 rounded-xl mb-4 bg-navy-50 border border-navy-100 text-navy-700 text-[13px]"><span class="text-lg">🏠</span><div><b>Household prevention — ' + scopeName + '.</b> Know which villages own nets, which actually <i>use</i> them, and where IRS is still pending. Target CHW campaigns where the usage gap is largest.</div></div>'
      + '<div class="grid grid-cols-3 gap-3 mb-4">' + kpi("Villages", vs.length, "in scope", true) + kpi("Households", fmt(hh), "monitored") + kpi("Low net-use villages", lowN, "usage < 65% → campaign") + '</div>'
      + card(gold("Village household prevention register · sorted by net usage") + '<div class="overflow-auto max-h-[560px]"><table class="w-full text-[13px]"><thead class="sticky top-0 bg-white"><tr>' + ["Village", "Risk", "Households", "Net own", "Net use", "IRS"].map(function (c, i) { return '<th class="text-' + (i > 1 ? "right" : "left") + ' py-2 px-2.5 border-b-2 border-slate-200 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">' + c + '</th>'; }).join("") + '</tr></thead><tbody>' + rowsH + '</tbody></table></div>');
  }

  function renderAlerts() {
    var al = scopeAlerts();
    return '<div class="flex gap-3 items-start p-3.5 rounded-xl mb-4 bg-navy-50 border border-navy-100 text-navy-700 text-[13px]"><span class="text-lg">🤝</span><div><b>Verify-before-act.</b> The AI never triggers a response on its own. Each alert pairs the signal with a verification step a health officer completes first, then a recommended action. <b>AI recommends · people verify · then act.</b></div></div>'
      + (al.length ? '<div class="grid md:grid-cols-2 gap-4">' + al.map(function (a) { return alertCard(a); }).join("") + '</div>' : card('<p class="text-slate-400">No active alerts in your scope.</p>'));
  }

  function renderAccess() {
    var cards = D.roles.map(function (r) {
      var me = r.id === ROLE.id;
      return '<div class="bg-white rounded-xl shadow-card border ' + (me ? 'border-gold ring-2 ring-gold/30' : 'border-slate-200/70') + ' p-4">'
        + '<div class="flex items-center gap-3 mb-2"><span class="w-9 h-9 rounded-full bg-navy-800 text-white grid place-items-center text-[11px] font-extrabold">' + r.avatar + '</span><div><div class="font-bold text-[14px]">' + r.label + (me ? ' <span class="text-gold text-[11px]">· you</span>' : '') + '</div><div class="text-[11.5px] text-slate-500">' + r.org + '</div></div></div>'
        + '<div class="text-[11px] font-bold uppercase tracking-wide text-[#1c7a4f] mt-2">Can access</div><ul class="mt-1 space-y-1">' + r.can_see.map(function (x) { return '<li class="text-[12.5px] pl-4 relative"><span class="absolute left-0 text-[#2ea36b]">✓</span>' + esc(x) + '</li>'; }).join("") + '</ul>'
        + '<div class="text-[11px] font-bold uppercase tracking-wide text-[#a23b36] mt-2">Restricted</div><ul class="mt-1 space-y-1">' + r.cannot.map(function (x) { return '<li class="text-[12.5px] pl-4 relative"><span class="absolute left-0 text-[#d64541]">✕</span>' + esc(x) + '</li>'; }).join("") + '</ul></div>';
    }).join("");
    var groups = [
      ["District malaria surveillance & response teams", "Primary users", "Use the dashboard, analyse forecasts & risk maps, investigate AI alerts, coordinate local response.", "Kirehe / Nyamasheke District Surveillance"],
      ["RBC / MOPDD", "National users", "Monitor risk across districts, compare trends & forecasts, spot emerging hotspots, support national planning.", "RBC National Analyst + Super User"],
      ["Community Health Workers (CHWs)", "Community users", "Receive alerts for their area, report suspected/unusual increases, support targeted community response.", "Sector / Cell / Village roles"],
    ];
    var gcards = groups.map(function (g) {
      return '<div class="bg-white rounded-xl shadow-card border border-slate-200/70 p-4"><div class="text-gold font-bold text-[11px] tracking-widest uppercase">' + g[1] + '</div><div class="font-bold text-[14px] mt-0.5">' + g[0] + '</div><p class="text-[12.5px] text-slate-600 mt-1.5">' + g[2] + '</p><div class="text-[11px] text-navy-600 mt-2 font-semibold">→ ' + g[3] + '</div></div>';
    }).join("");
    return '<div class="flex gap-3 items-start p-3.5 rounded-xl mb-4 bg-navy-50 border border-navy-100 text-navy-700 text-[13px]"><span class="text-lg">🔐</span><div><b>Role-based access control.</b> Three user groups, seven accounts across every level. Every user sees only the scope they are authorised for. Data is aggregate-only (no patient identifiers); production uses Ministry of Health SSO, encryption in transit &amp; at rest, and a full audit trail.</div></div>'
      + '<div class="grid md:grid-cols-3 gap-4 mb-4">' + gcards + '</div>'
      + gold("The seven accounts") + '<div class="grid md:grid-cols-2 gap-4">' + cards + '</div>';
  }

  function renderModel() {
    var m = D.meta;
    var mods = [["Seasonal baseline", m.model.baseline], ["Anomaly detection", m.model.anomaly], ["Forecast", m.model.forecast], ["Risk engine", m.model.risk], ["Resource allocation", m.model.allocation], ["Human-in-the-loop", m.human_in_the_loop]];
    var srcs = [["RBC Malaria &amp; NTD annual reports", "incidence, burden, surveillance gaps"], ["RBC weekly epi bulletins", "week-by-week district cases"], ["HMIS / DHIS2 (production)", "routine facility reporting"], ["IDSR", "integrated disease surveillance &amp; response signals"], ["RapidSMS &amp; SISCom", "real-time CHW reporting"], ["eLMIS", "RDT &amp; ACT stock"], ["NASA/NOAA climate", "rainfall &amp; temp (8-wk lead)"]];
    return '<div class="grid md:grid-cols-2 gap-4">' + mods.map(function (x, i) { return card('<div class="text-gold font-bold text-[11px] tracking-widest uppercase mb-1">' + (i + 1) + ' · ' + x[0] + '</div><p class="text-[13px] text-slate-600">' + esc(x[1]) + '</p>'); }).join("") + '</div>'
      + card(gold("Data sources") + '<div class="grid md:grid-cols-2 gap-x-6 gap-y-1.5">' + srcs.map(function (s) { return '<div class="text-[12.5px]"><b>' + s[0] + '</b> — <span class="text-slate-500">' + s[1] + '</span></div>'; }).join("") + '</div>', "mt-4")
      + card(gold("Data security &amp; privacy") + driversList(["Aggregate-first / PII-free — counts by district/sector/cell/village, no patient identifiers.", "Encryption in transit &amp; at rest; role-based access (see Access &amp; Permissions).", "Runs inside the MoH/RBC environment — no personal data leaves authorised systems.", "Full audit log of every alert, verification and action.", "Aligned with Rwanda Law No. 058/2021 on personal data protection."]), "mt-4")
      + '<div class="mt-4 rounded-xl p-3.5 bg-[#fbf1df] border border-[#f0d9b3] text-[#7a531a] text-[12.5px]"><b>Prototype note.</b> ' + esc(m.data_status) + ' Figures are calibrated to public RBC numbers — not official RBC statistics.</div>';
  }

  function renderAccounts() {
    var rows = D.roles.map(function (r) {
      var scopeTag = r.scope.charAt(0).toUpperCase() + r.scope.slice(1) + (r.admin ? " (admin)" : "");
      return '<tr><td class="py-2 px-2.5 border-b border-slate-100"><b>' + r.label + '</b><div class="text-[11px] text-slate-500">' + r.org + '</div></td>'
        + '<td class="py-2 px-2.5 border-b border-slate-100">' + scopeTag + '</td>'
        + '<td class="py-2 px-2.5 border-b border-slate-100" style="font-family:monospace">' + r.username + '</td>'
        + '<td class="py-2 px-2.5 border-b border-slate-100" style="font-family:monospace">' + r.password + '</td></tr>';
    }).join("");
    // access requests submitted from the login page (demo: this browser's localStorage)
    var reqs = []; try { reqs = JSON.parse(localStorage.getItem("access_requests") || "[]"); } catch (e) { }
    var reqCard;
    if (reqs.length) {
      var rr = reqs.map(function (q) {
        return '<tr><td class="py-2 px-2.5 border-b border-slate-100"><b>' + esc(q.name || "—") + '</b></td>'
          + '<td class="py-2 px-2.5 border-b border-slate-100">' + esc(q.org || "—") + '</td>'
          + '<td class="py-2 px-2.5 border-b border-slate-100">' + esc(q.level || "—") + '</td>'
          + '<td class="py-2 px-2.5 border-b border-slate-100 text-slate-500">' + esc(q.reason || "") + '</td>'
          + '<td class="py-2 px-2.5 border-b border-slate-100 text-slate-400 whitespace-nowrap">' + esc(q.when || "") + '</td>'
          + '<td class="py-2 px-2.5 border-b border-slate-100"><span class="rb WATCH inline-flex items-center gap-1.5 font-bold text-[11px] px-2.5 py-0.5 rounded-full uppercase"><span class="w-1.5 h-1.5 rounded-full dot-WATCH"></span>Pending</span></td></tr>';
      }).join("");
      reqCard = card(gold("Access requests (" + reqs.length + ") — awaiting your review")
        + '<div class="overflow-auto"><table class="w-full text-[13px]"><thead><tr>' + ["Name", "Organisation", "Level requested", "Reason", "When", "Status"].map(function (c) { return '<th class="text-left py-2 px-2.5 border-b-2 border-slate-200 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">' + c + '</th>'; }).join("") + '</tr></thead><tbody>' + rr + '</tbody></table></div>'
        + '<div class="hint text-[11.5px] text-slate-400 mt-2">Submitted from the login page for the Umuburo AI administrator to review. Approve by provisioning the role in the accounts table above; once approved the requester gets access.</div>', "mt-4");
    } else {
      reqCard = card(gold("Access requests") + '<p class="text-slate-400 text-sm">No pending access requests. New requests from the login page appear here for you to review.</p>', "mt-4");
    }
    return '<div class="flex gap-3 items-start p-3.5 rounded-xl mb-4 bg-navy-50 border border-navy-100 text-navy-700 text-[13px]"><span class="text-lg">👤</span><div><b>User accounts &amp; access roles (administration).</b> Seven roles spanning every surveillance level — national, district, sector, cell and village. Access requests from the login page arrive here for the Super User to review. In production these are provisioned via Ministry of Health SSO; passwords are never stored in the client.</div></div>'
      + card(gold("Accounts — all surveillance levels") + '<div class="overflow-auto"><table class="w-full text-[13px]"><thead><tr>' + ["Role", "Scope", "Username", "Password (demo)"].map(function (c) { return '<th class="text-left py-2 px-2.5 border-b-2 border-slate-200 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">' + c + '</th>'; }).join("") + '</tr></thead><tbody>' + rows + '</tbody></table></div>')
      + reqCard;
  }

  /* ---------- Data intake (connect systems · upload · what's needed) ---------- */
  function renderData() {
    var srcs = [
      { id: "dhis2", name: "DHIS2 / HMIS", desc: "Routine facility malaria reporting (cases, tests)" },
      { id: "idsr", name: "IDSR", desc: "Integrated Disease Surveillance &amp; Response signals" },
      { id: "rapidsms", name: "RapidSMS / SISCom", desc: "Real-time CHW case reports from villages" },
      { id: "elmis", name: "eLMIS", desc: "RDT &amp; ACT stock — for verify-before-act" },
      { id: "climate", name: "NASA POWER climate", desc: "Rainfall &amp; temperature — 8-week lead predictor" }
    ];
    var conn = DATASTATE.connected, nConn = srcs.filter(function (s) { return conn[s.id]; }).length;
    var srcCards = srcs.map(function (s) {
      var on = !!conn[s.id];
      return '<div class="border rounded-xl p-4 ' + (on ? 'border-[#bfe6d2] bg-[#f2faf6]' : 'border-slate-200 bg-white') + '">'
        + '<div class="flex items-start justify-between gap-2"><div><div class="font-bold text-[13.5px]">' + s.name + '</div><div class="text-[12px] text-slate-500 mt-0.5">' + s.desc + '</div></div>'
        + (on ? '<span class="text-[11px] font-bold text-[#1c7a4f] whitespace-nowrap">&#10003; Connected</span>' : '') + '</div>'
        + '<button data-act="connect" data-src="' + s.id + '" class="mt-3 w-full ' + (on ? 'border border-slate-300 text-slate-600' : 'bg-navy-800 text-white') + ' font-semibold rounded-lg py-2 text-[13px] transition hover:opacity-90">' + (on ? 'Disconnect' : 'Connect (read-only)') + '</button></div>';
    }).join("");
    var up = DATASTATE.uploaded;
    var upResult = up ? ('<div class="mt-3 rounded-lg px-3 py-3 text-[13px] ' + (up.missing.length ? 'bg-[#fbf1df] text-[#8a5a12] border border-[#f0d9b3]' : 'bg-[#e6f5ee] text-[#1c7a4f] border border-[#bfe6d2]') + '"><b>' + esc(up.name) + '</b> — ' + fmt(up.rows) + ' rows, ' + up.cols + ' columns detected. ' + (up.missing.length ? 'Missing required columns: <b>' + esc(up.missing.join(", ")) + '</b>.' : 'All required columns present &#10003; — ready to run.') + '</div>') : '';
    var fields = [
      ["epi_week", "Required", "ISO week — e.g. 2026-W40"],
      ["district", "Required", "District name (add sector / cell / village for full drill-down)"],
      ["confirmed_cases", "Required", "Confirmed malaria cases that week"],
      ["tested", "Required", "Number tested — gives test positivity"],
      ["rainfall_mm", "Required", "Weekly rainfall (mm) — the 8-week lead predictor"],
      ["temp_avg_c", "Required", "Average temperature (°C)"],
      ["population_at_risk", "Recommended", "For incidence per 1,000"],
      ["itn_ownership_pct / itn_usage_pct", "Optional", "Net ownership vs. usage — the prevention gap"],
      ["irs_coverage_pct", "Optional", "IRS spray coverage"],
      ["chw_reporting_pct", "Optional", "Reporting completeness — data quality"]
    ];
    var frows = fields.map(function (f) {
      var tag = f[1] === "Required" ? "text-[#d64541]" : (f[1] === "Recommended" ? "text-[#c9801f]" : "text-slate-400");
      return '<tr><td class="py-2 px-2.5 border-b border-slate-100" style="font-family:monospace;font-size:12.5px">' + f[0] + '</td><td class="py-2 px-2.5 border-b border-slate-100 font-semibold ' + tag + '">' + f[1] + '</td><td class="py-2 px-2.5 border-b border-slate-100 text-slate-600">' + f[2] + '</td></tr>';
    }).join("");
    return '<div class="flex gap-3 items-start p-3.5 rounded-xl mb-4 bg-navy-50 border border-navy-100 text-navy-700 text-[13px]"><span class="text-lg">⤓</span><div><b>Data intake.</b> Connect your systems, upload a dataset, and see exactly what Umuburo AI needs. It reads data <b>read-only</b> and never writes back; aggregate counts only — no patient identifiers.</div></div>'
      + '<div class="flex gap-3 items-start p-3.5 rounded-xl mb-4 bg-[#fbf7ec] border border-[#f0d9b3] text-[#7a531a] text-[12.5px]"><span class="text-lg">&#10003;</span><div><b>Grounded in real RBC data.</b> RBC Public Health Bulletin, Epi Week 39/2025: <i>“simple malaria cases surpassed the epidemic thresholds… a deep investigation is needed.”</i> Umuburo AI automates that weekly threshold check — earlier, down to the village, with a 1–4 week forecast.</div></div>'
      + '<div class="grid lg:grid-cols-2 gap-4 items-start">'
      + card(gold("1 · Connect data sources") + '<div class="flex items-center justify-between mb-3 gap-2 flex-wrap"><span class="text-[12.5px] text-slate-500">' + nConn + ' of ' + srcs.length + ' systems connected</span><button data-act="connect-all" class="text-[12px] font-bold bg-gold text-navy-900 rounded-lg px-3 py-1.5">Connect all systems</button></div><div class="grid sm:grid-cols-2 gap-3">' + srcCards + '</div>')
      + card(gold("2 · Upload a dataset (CSV)") + '<label class="block border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-gold transition"><input type="file" id="data-file" accept=".csv,text/csv" class="hidden"><div class="text-3xl mb-1 text-slate-400">⤓</div><div class="font-semibold text-navy-900">Choose a CSV file to upload</div><div class="text-[12px] text-slate-500 mt-1">Weekly surveillance export — district or sector level</div></label>' + upResult + '<p class="text-[11.5px] text-slate-400 mt-3">Tip: a ready sample ships at <span style="font-family:monospace">data/malaria_surveillance_district.csv</span>.</p>')
      + '</div>'
      + card(gold("3 · What Umuburo AI needs exactly") + '<div class="overflow-auto"><table class="w-full text-[13px]"><thead><tr>' + ["Column", "Need", "Description"].map(function (c) { return '<th class="text-left py-2 px-2.5 border-b-2 border-slate-200 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">' + c + '</th>'; }).join("") + '</tr></thead><tbody>' + frows + '</tbody></table></div>', "mt-4")
      + '<div class="mt-4 flex flex-col sm:flex-row gap-3 sm:items-center justify-between bg-white rounded-xl shadow-card border border-slate-200 p-5"><div><div class="font-bold text-[15px]">Ready to run</div><div class="text-slate-500 text-[13px]">' + (nConn ? nConn + ' source(s) connected. ' : '') + (up ? 'Dataset uploaded. ' : '') + 'Run the AI on the connected / uploaded data.</div></div><button data-act="run" class="bg-gold hover:brightness-95 text-navy-900 font-extrabold text-[15px] rounded-xl px-6 py-3 shadow whitespace-nowrap">▶  Run analysis</button></div>';
  }

  /* ---------- Home (comfortable landing after login) ---------- */
  function scopeLabel() {
    if (ROLE.scope === "national") return "national view";
    if (ROLE.village) return ROLE.village + " village";
    if (ROLE.cell) return ROLE.cell + " cell";
    if (ROLE.sector) return ROLE.sector + " sector";
    return roleDistrict() + " district";
  }
  /* ---------- Climate & Trends (year-over-year + climate + AI suggestions) ---------- */
  var SUG_COL = { RESPOND: "#d64541", CLIMATE: "#c9801f", INVESTIGATE: "#7a5cf0", PREVENTION: "#2f6db0", "CASE-MGMT": "#1c7a4f" };
  function yoyBars(yoy) {
    if (!yoy || !yoy.length) return '<p class="text-slate-400 text-sm">Not enough complete years yet.</p>';
    var max = Math.max.apply(null, yoy.map(function (y) { return y.incidence; })) * 1.28 || 1;
    var n = yoy.length, W = 380, H = 190, bw = 70, gap = (W - n * bw) / (n + 1);
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="w-full" style="max-height:210px">';
    yoy.forEach(function (y, i) {
      var h = (y.incidence / max) * (H - 52), x = gap + i * (bw + gap), yy = H - 30 - h;
      var col = (y.change_pct == null) ? "#2f6db0" : (y.change_pct > 0 ? "#d64541" : "#2ea36b");
      s += '<rect x="' + x + '" y="' + yy + '" width="' + bw + '" height="' + Math.max(2, h) + '" rx="5" fill="' + col + '"/>';
      s += '<text x="' + (x + bw / 2) + '" y="' + (yy - 8) + '" text-anchor="middle" font-size="14" font-weight="800" fill="#152633">' + y.incidence + '</text>';
      if (y.change_pct != null) s += '<text x="' + (x + bw / 2) + '" y="' + (yy - 24) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="' + col + '">' + (y.change_pct > 0 ? "▲+" : (y.change_pct < 0 ? "▼" : "")) + y.change_pct + '%</text>';
      s += '<text x="' + (x + bw / 2) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11" fill="#5b6b7a">' + y.fy + '</text>';
    });
    s += '</svg><div class="text-[11px] text-slate-400 mt-1">Bars = malaria incidence / 1,000 / year, per fiscal year (Jul–Jun). Red = rose, green = fell.</div>';
    return s;
  }
  function moversTable() {
    var ds = D.districts.filter(function (d) { return d.yoy && d.yoy.length && d.yoy[d.yoy.length - 1].change_pct != null; })
      .map(function (d) { return { name: d.district, chg: d.yoy[d.yoy.length - 1].change_pct, risk: d.risk }; });
    var ris = ds.slice().sort(function (a, b) { return b.chg - a.chg; }).slice(0, 5);
    var fal = ds.slice().sort(function (a, b) { return a.chg - b.chg; }).slice(0, 5);
    function tbl(rows, label) {
      return '<div><div class="text-[12px] font-bold mb-1.5">' + label + '</div>' + rows.map(function (r) {
        return '<div class="flex items-center justify-between text-[12.5px] border-b border-slate-100 py-1"><span class="flex items-center gap-1.5">' + r.name + ' ' + badge(r.risk) + '</span><b class="' + tcls(r.chg) + '">' + sign(r.chg) + '</b></div>';
      }).join("") + '</div>';
    }
    return '<div class="grid grid-cols-2 gap-5">' + tbl(ris, "Rising fastest (year-on-year)") + tbl(fal, "Falling fastest (year-on-year)") + '</div>';
  }
  function climateCardsDistrict(c) {
    return gold("Climate & weather signal")
      + '<div class="grid grid-cols-3 gap-3 text-center">'
      + '<div><div class="text-[21px] font-extrabold tabnum ' + (c.favourable ? "text-[#c9801f]" : "") + '">' + c.rain_lead_6_8w + '</div><div class="text-[10.5px] text-slate-500">rain 6–8 wks ago (mm/wk)</div></div>'
      + '<div><div class="text-[21px] font-extrabold tabnum">' + c.temp_c + '°</div><div class="text-[10.5px] text-slate-500">avg temp</div></div>'
      + '<div><div class="text-[21px] font-extrabold tabnum">' + c.rain_case_corr + '</div><div class="text-[10.5px] text-slate-500">rain→cases corr (8-wk lag)</div></div></div>'
      + '<div class="mt-3 text-[12.5px] px-3 py-2 rounded-lg ' + (c.favourable ? "bg-[#fbf1df] text-[#8a5a12] border border-[#f0d9b3]" : "bg-slate-50 text-slate-500") + '">' + (c.favourable ? "⚠ " : "") + esc(c.outlook) + '</div>'
      + '<div class="text-[11px] text-slate-400 mt-1.5">Transmission-favourable band: ' + esc(c.favourable_band) + '</div>';
  }
  function suggestionList(arr) {
    if (!arr || !arr.length) return '<p class="text-slate-400 text-sm">No specific suggestions — within the expected range.</p>';
    return arr.map(function (s) {
      var col = SUG_COL[s.category] || "#5b6b7a";
      return '<div class="bg-white rounded-xl shadow-card border border-slate-200/70 border-l-4 p-3.5" style="border-left-color:' + col + '">'
        + '<div class="flex items-center gap-2 mb-1 flex-wrap"><span class="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style="color:' + col + ';background:' + col + '1a">' + esc(s.category) + '</span><b class="text-[14px]">' + esc(s.action) + '</b></div>'
        + '<p class="text-[12.5px] text-slate-600">' + esc(s.why) + '</p></div>';
    }).join("");
  }
  function renderAnalysis() {
    var isNat = ROLE.scope === "national";
    var d = isNat ? null : scopeDistricts()[0];
    var yoy = isNat ? D.national.yoy : (d ? d.yoy : []);
    var sugg = isNat ? D.national.suggestions : (d ? d.suggestions : []);
    var title = isNat ? "Rwanda (monitored districts)" : (d ? d.district + " district" : "");
    var yoyCard = card(gold("Year-on-year malaria incidence — " + title) + yoyBars(yoy)
      + '<p class="text-[12px] text-slate-500 mt-2">' + esc(D.national.context.resurgence_note) + '</p>');
    var climCard;
    if (isNat) {
      var c = D.national.climate;
      climCard = card(gold("Climate & weather signal")
        + '<p class="text-[13px] text-slate-600">' + esc(c.note) + ' Transmission is favoured at <b>' + esc(c.favourable_band) + '</b>.</p>'
        + '<div class="mt-3 rounded-lg px-3 py-2.5 bg-[#fbf1df] text-[#8a5a12] text-[13px] border border-[#f0d9b3]">⏳ Next major rainfall peak ≈ <b>epi-week ' + c.next_peak_week + '</b> (~' + c.weeks_to_peak + ' week' + (c.weeks_to_peak === 1 ? "" : "s") + ' away). Because rain leads cases by ~8 weeks, plan the next IRS/LLIN round to finish <b>before</b> then. The imminent short-rains rise is already captured in this week\'s alerts.</div>');
    } else {
      climCard = card(d ? climateCardsDistrict(d.climate) : "");
    }
    var movers = isNat ? '<div class="mt-4">' + card(gold("Biggest year-on-year movers by district") + moversTable()) + '</div>' : "";
    var suggCard = '<div class="mt-4">' + gold("AI suggestions — after analysing climate & trends")
      + '<p class="text-[12px] text-slate-500 mb-3">What Umuburo AI recommends from the year-on-year trend and the climate signal. As always: <b>verify first, then act</b>.</p>'
      + '<div class="grid md:grid-cols-2 gap-3 items-start">' + suggestionList(sugg) + '</div></div>';
    return actionBar() + '<div class="grid lg:grid-cols-2 gap-4 items-start">' + yoyCard + climCard + '</div>' + movers + suggCard;
  }

  function tileDesc(id) {
    return { overview: "Risk map, key numbers & the 1–4 week forecast", data: "Connect systems, upload data & see what's needed", drill: "Drill from district down to the village",
      analysis: "Year-on-year trends, climate signal & AI suggestions",
      prevention: "Where to send nets, IRS, RDTs & CHWs first", alerts: "Verify-before-act alerts with the evidence",
      access: "Roles & who can see what", model: "How the AI works, data sources & security", accounts: "Manage user accounts (admin)" }[id] || "";
  }
  function destView() { return (ROLE.scope === "national" || ROLE.scope === "district") ? "overview" : "drill"; }
  function renderHome() {
    var high = D.districts.filter(function (d) { return d.risk === "HIGH"; }).length;
    var watch = D.districts.filter(function (d) { return d.risk === "WATCH"; }).length;
    var status = high ? ('<span class="inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1"><span class="w-2 h-2 rounded-full bg-[#ff6b6b]"></span>' + high + ' district(s) need attention</span>')
      : (watch ? '<span class="inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1"><span class="w-2 h-2 rounded-full bg-[#f1c40f]"></span>' + watch + ' on watch</span>'
        : '<span class="inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1"><span class="w-2 h-2 rounded-full bg-emerald-400"></span>all clear</span>');
    var hero = '<div class="rounded-2xl overflow-hidden shadow-card mb-5" style="background:radial-gradient(900px 420px at 12% -30%,#16436b,#0e2f4c 70%)">'
      + '<div class="p-6 md:p-8 text-white flex flex-col md:flex-row md:items-center gap-5">'
      + '<img src="logo.png" alt="logo" class="w-20 h-20 rounded-full ring-2 ring-gold/50 shrink-0">'
      + '<div class="flex-1"><div class="text-gold font-bold text-[11.5px] tracking-widest uppercase mb-1">RBC · Rwanda Biomedical Centre</div>'
      + '<h2 class="text-2xl md:text-[27px] font-extrabold leading-tight">Welcome, ' + esc(ROLE.label) + '</h2>'
      + '<p class="text-navy-100/85 text-[13.5px] mt-1.5 max-w-2xl">You are signed in for the <b>' + esc(scopeLabel()) + '</b>. This system forecasts where malaria is likely to rise over the next <b>1–4 weeks</b>, explains why, and shows what to do — <b>you verify, then act</b>.</p>'
      + '<div class="mt-3 text-[12px] text-navy-100/80">Right now: ' + status + '</div></div></div></div>';
    var runCard = '<div class="rounded-2xl bg-white shadow-card border border-slate-200 p-5 md:p-6 mb-5 flex flex-col md:flex-row md:items-center gap-4">'
      + '<div class="flex-1"><h3 class="font-bold text-lg">Run the early-warning analysis</h3>'
      + '<p class="text-slate-500 text-[13.5px] mt-1 max-w-2xl">Reads the latest surveillance &amp; climate data and runs the AI: seasonal baseline → anomaly detection → 1–4 week forecast → risk &amp; prevention plan.</p></div>'
      + '<button data-act="run" class="bg-gold hover:brightness-95 active:brightness-90 text-navy-900 font-extrabold text-[15px] rounded-xl px-7 py-3.5 shadow-lg whitespace-nowrap transition">▶  Run the solution</button></div>';
    var items = NAVDEF[ROLE.scope].filter(function (it) { return it[0] !== "home"; });
    if (ROLE.admin) items = items.concat([["accounts", "User Accounts", "👤"]]);
    var tiles = items.map(function (it) {
      return '<button data-act="view" data-view="' + it[0] + '" class="text-left bg-white rounded-xl shadow-card border border-slate-200 p-4 hover:border-gold hover:-translate-y-0.5 transition">'
        + '<div class="text-[22px] mb-1.5">' + it[2] + '</div><div class="font-bold text-[14px] text-navy-900">' + it[1] + '</div>'
        + '<div class="text-slate-500 text-[12px] mt-0.5">' + tileDesc(it[0]) + '</div></button>';
    }).join("");
    return hero + runCard + '<div class="text-gold font-bold text-[11px] tracking-widest uppercase mb-2">Go to</div><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">' + tiles + '</div>';
  }
  function runSolution() {
    var steps = ["Connecting to DHIS2 / IDSR / eLMIS (read-only)…", "Loading weekly surveillance + climate data…",
      "Computing the seasonal baseline…", "Detecting anomalies (control chart)…",
      "Forecasting the next 1–4 weeks…", "Scoring risk &amp; prevention allocation…", "Preparing verify-before-act alerts…"];
    var c = document.getElementById("content");
    c.innerHTML = '<div class="max-w-lg mx-auto mt-8 md:mt-14 fadein"><div class="bg-white rounded-2xl shadow-card border border-slate-200 p-6 text-center">'
      + '<img src="logo.png" alt="logo" class="w-16 h-16 rounded-full mx-auto ring-2 ring-gold/40 mb-3">'
      + '<h3 class="font-bold text-lg">Running the early-warning analysis…</h3>'
      + '<p class="text-slate-500 text-[13px] mb-4">Reading surveillance &amp; climate data and running the AI models.</p>'
      + '<div class="h-2 rounded-full bg-slate-100 overflow-hidden mb-4"><div id="run-bar" class="h-full bg-gold" style="width:0%;transition:width .3s"></div></div>'
      + '<ul id="run-steps" class="text-left space-y-1.5 text-[13px]">'
      + steps.map(function (s, idx) { return '<li id="rs' + idx + '" class="flex items-center gap-2 text-slate-400"><span class="run-ic w-4 text-center">○</span><span>' + s + '</span></li>'; }).join("")
      + '</ul></div></div>';
    var i = 0;
    (function tick() {
      if (i > 0) { var p = document.getElementById("rs" + (i - 1)); if (p) { p.className = "flex items-center gap-2 text-slate-700"; var ic = p.querySelector(".run-ic"); ic.textContent = "✓"; ic.className = "run-ic w-4 text-center text-[#2ea36b] font-bold"; } }
      if (i < steps.length) {
        var cur = document.getElementById("rs" + i); if (cur) { cur.className = "flex items-center gap-2 text-navy-900 font-semibold"; cur.querySelector(".run-ic").textContent = "◐"; }
        var bar = document.getElementById("run-bar"); if (bar) bar.style.width = Math.round((i + 1) / steps.length * 100) + "%";
        i++; setTimeout(tick, 360);
      } else {
        setTimeout(function () { VIEW = destView(); if (VIEW === "drill") NAV = initNav(); mount(); }, 420);
      }
    })();
  }

  /* ================= shell ================= */
  var VIEWS = { home: renderHome, overview: renderOverview, data: renderData, drill: renderDrill, analysis: renderAnalysis, prevention: renderPrevention, alerts: renderAlerts, access: renderAccess, model: renderModel, accounts: renderAccounts };
  var NAVDEF = {
    national: [["home", "Home", "⌂"], ["overview", "Overview", "▦"], ["data", "Data intake", "⤓"], ["drill", "Early Warning", "◈"], ["analysis", "Climate & Trends", "🌦"], ["prevention", "Prevention & Resources", "🛡"], ["alerts", "Alerts", "⚠"], ["access", "Access & Permissions", "🔐"], ["model", "Model & Data", "▤"]],
    district: [["home", "Home", "⌂"], ["overview", "District Overview", "▦"], ["data", "Data intake", "⤓"], ["drill", "Early Warning", "◈"], ["analysis", "Climate & Trends", "🌦"], ["prevention", "Prevention", "🛡"], ["alerts", "Alerts", "⚠"], ["access", "Access & Permissions", "🔐"]],
    sector: [["home", "Home", "⌂"], ["drill", "Cells & Villages", "◈"], ["prevention", "Household Prevention", "🏠"], ["alerts", "Alerts", "⚠"], ["access", "Access & Permissions", "🔐"]],
    cell: [["home", "Home", "⌂"], ["drill", "Cell & Villages", "◈"], ["prevention", "Household Prevention", "🏠"], ["alerts", "Alerts", "⚠"], ["access", "Access & Permissions", "🔐"]],
    village: [["home", "Home", "⌂"], ["drill", "My Village", "◈"], ["prevention", "Household Prevention", "🏠"], ["alerts", "Alerts", "⚠"], ["access", "Access & Permissions", "🔐"]]
  };
  function buildSidebar() {
    var items = NAVDEF[ROLE.scope].slice();
    if (ROLE.admin) { var mi = 0; while (mi < items.length && items[mi][0] !== "model") mi++; items.splice(mi, 0, ["accounts", "User Accounts", "👤"]); }   // admin-only, before Model & Data
    document.getElementById("sidebar").innerHTML = items.map(function (it) {
      return '<button data-act="view" data-view="' + it[0] + '" class="navitem ' + (it[0] === VIEW ? "active" : "") + ' w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13.5px] font-semibold text-navy-100 hover:bg-white/10 transition text-left"><span class="w-5 text-center opacity-90">' + it[2] + '</span>' + it[1] + '</button>';
    }).join("") + '<div class="pt-4 mt-4 border-t border-white/10 text-[10.5px] text-navy-100/50 leading-relaxed px-3">AI recommends · people verify · then act.<br>Prototype — not official RBC data.</div>';
  }
  // Plain-language description for every dashboard (shown as a header on each view).
  var HEADERS = {
    overview: ["Overview", "Umuburo AI — malaria risk across Rwanda now, with the 1–4 week forecast."],
    data: ["Data intake", "Umuburo AI — connect your systems, upload data, and see exactly what's needed."],
    drill: ["Early warning — explore areas", "Umuburo AI — drill from national down to the village to see where malaria is rising."],
    analysis: ["Climate & trends", "Umuburo AI — year-on-year patterns, the climate/weather signal, and what to do about them."],
    prevention: ["Prevention & resources", "Umuburo AI — where to send nets, IRS, RDTs & CHWs before the peak."],
    alerts: ["Alerts", "Umuburo AI — abnormal rises to verify first, then act on (verify-before-act)."],
    access: ["Access & permissions", "Umuburo AI — role-based access: who can see what."],
    model: ["Model & data", "Umuburo AI — how it works, its data sources & safeguards."],
    accounts: ["User accounts", "Umuburo AI — all roles and access levels (administrator)."]
  };
  function viewHeader() {
    var h = HEADERS[VIEW]; if (!h) return "";
    return '<div class="mb-4"><h2 class="text-[20px] font-extrabold text-navy-900 leading-tight">' + h[0] + '</h2><p class="text-slate-500 text-[13px] mt-0.5">' + h[1] + '</p></div>';
  }
  function mount() {
    document.getElementById("content").innerHTML = '<div class="fadein">' + viewHeader() + VIEWS[VIEW]() + '</div>';
    Array.prototype.forEach.call(document.querySelectorAll(".navitem"), function (b) { b.classList.toggle("active", b.getAttribute("data-view") === VIEW); });
    window.scrollTo(0, 0);
  }
  function setView(v) { VIEW = v; if (v === "drill") { NAV = initNav(); SELV = null; } mount(); }

  function showPanel(id) {
    ["choice-panel", "signin-panel", "request-panel"].forEach(function (p) { var el = document.getElementById(p); if (el) el.classList.toggle("hidden", p !== id); });
    var err = document.getElementById("f-error"); if (err) err.classList.add("hidden");
  }
  function login(id) {
    ROLE = D.roles.filter(function (r) { return r.id === id; })[0];
    VIEW = NAVDEF[ROLE.scope][0][0];
    NAV = initNav(); SELV = null;
    document.getElementById("login").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    document.getElementById("tb-role").textContent = ROLE.label;
    document.getElementById("tb-scope").textContent = ROLE.org;
    document.getElementById("tb-avatar").textContent = ROLE.avatar;
    document.getElementById("tb-week").textContent = D.national.epi_week;
    buildSidebar(); mount();
  }
  function logout() { document.getElementById("app").classList.add("hidden"); document.getElementById("login").classList.remove("hidden"); showPanel("choice-panel"); bgAnim(); }

  // ---- login: demo accounts list + credential form ----
  // Pre-fill a default account so testing is one click (Login -> Sign in).
  (function () {
    var d = D.roles.filter(function (x) { return x.id === "rbc.national"; })[0] || D.roles[0];
    var u = document.getElementById("f-user"), p = document.getElementById("f-pass");
    if (u) u.value = d.username; if (p) p.value = d.password;
  })();

  /* ---------- animated AI/network background on the login page ---------- */
  function bgAnim() {
    var cv = document.getElementById("bg-canvas");
    var ctx = cv && cv.getContext && cv.getContext("2d");
    if (!ctx) return;
    var W, H, pts;
    function init() {
      W = cv.width = cv.offsetWidth; H = cv.height = cv.offsetHeight;
      var n = Math.max(28, Math.min(80, Math.floor(W / 20)));
      pts = []; for (var i = 0; i < n; i++) pts.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .45, vy: (Math.random() - .5) * .45 });
    }
    function frame() {
      var lg = document.getElementById("login"); if (!lg || lg.classList.contains("hidden")) return;  // stop after login
      ctx.clearRect(0, 0, W, H);
      var i, j;
      for (i = 0; i < pts.length; i++) { var p = pts[i]; p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1; }
      for (i = 0; i < pts.length; i++) for (j = i + 1; j < pts.length; j++) {
        var a = pts[i], b = pts[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < 16900) { var o = 1 - Math.sqrt(d2) / 130; ctx.strokeStyle = "rgba(216,165,52," + (o * 0.22) + ")"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      }
      for (i = 0; i < pts.length; i++) { ctx.fillStyle = "rgba(207,224,242,0.55)"; ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 1.8, 0, 6.283); ctx.fill(); }
      requestAnimationFrame(frame);
    }
    init(); if (!bgAnim._resize) { window.addEventListener("resize", function () { if (pts) init(); }); bgAnim._resize = true; }
    requestAnimationFrame(frame);
  }
  bgAnim();
  function tryLogin() {
    var u = (document.getElementById("f-user").value || "").trim();
    var p = (document.getElementById("f-pass").value || "");
    var r = D.roles.filter(function (x) { return x.username === u && x.password === p; })[0];
    var err = document.getElementById("f-error");
    if (!r) { err.textContent = "Invalid username or password. Tip: click a demo account below to autofill."; err.classList.remove("hidden"); return; }
    err.classList.add("hidden"); login(r.id);
  }
  document.getElementById("login-form").addEventListener("submit", function (e) { e.preventDefault(); tryLogin(); });
  document.getElementById("f-toggle").addEventListener("click", function () {
    var pw = document.getElementById("f-pass"); var show = pw.type === "password"; pw.type = show ? "text" : "password"; this.textContent = show ? "HIDE" : "SHOW";
  });
  // Request access (demo — stored locally; production routes to RBC/MoH)
  function saveRequest(r) { try { var a = JSON.parse(localStorage.getItem("access_requests") || "[]"); a.unshift(r); localStorage.setItem("access_requests", JSON.stringify(a.slice(0, 50))); } catch (e) { } }
  var rform = document.getElementById("request-form");
  if (rform) rform.addEventListener("submit", function (e) {
    e.preventDefault();
    saveRequest({ name: (document.getElementById("rq-name").value || "").trim(), org: (document.getElementById("rq-org").value || "").trim(),
      level: document.getElementById("rq-level").value, reason: (document.getElementById("rq-reason").value || "").trim(), when: new Date().toLocaleString() });
    rform.classList.add("hidden"); document.getElementById("request-done").classList.remove("hidden");
  });
  // CSV upload parsing for Data intake (client-side, demo)
  document.addEventListener("change", function (e) {
    if (!e.target || e.target.id !== "data-file") return;
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      var lines = String(rd.result).split(/\r?\n/).filter(function (l) { return l.trim(); });
      var headers = (lines[0] || "").split(",").map(function (h) { return h.trim(); });
      var required = ["epi_week", "district", "confirmed_cases", "tested", "rainfall_mm", "temp_avg_c"];
      var missing = required.filter(function (r) { return headers.indexOf(r) < 0; });
      DATASTATE.uploaded = { name: f.name, rows: Math.max(0, lines.length - 1), cols: headers.length, missing: missing };
      if (VIEW === "data") mount();
    };
    rd.readAsText(f);
  });

  // event delegation
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]"); if (!t) return;
    var act = t.getAttribute("data-act");
    if (act === "show-login") { showPanel("signin-panel"); }
    else if (act === "show-request") { showPanel("request-panel"); }
    else if (act === "show-choice") { showPanel("choice-panel"); }
    else if (act === "run") runSolution();
    else if (act === "connect") { var s = t.getAttribute("data-src"); DATASTATE.connected[s] = !DATASTATE.connected[s]; mount(); }
    else if (act === "connect-all") { ["dhis2", "idsr", "rapidsms", "elmis", "climate"].forEach(function (s) { DATASTATE.connected[s] = true; }); mount(); }
    else if (act === "listen") speakSummary();
    else if (act === "genreport") openReport();
    else if (act === "view") setView(t.getAttribute("data-view"));
    else if (act === "drill") { NAV = { level: t.getAttribute("data-level"), district: t.getAttribute("data-district") || undefined, sector: t.getAttribute("data-sector") || undefined, cell: t.getAttribute("data-cell") || undefined }; if (VIEW !== "drill") VIEW = "drill"; mount(); }
    else if (act === "crumb") { var lv = t.getAttribute("data-level"); var keep = { level: lv }; if (LEVELS.indexOf(lv) >= 1) keep.district = NAV.district; if (LEVELS.indexOf(lv) >= 2) keep.sector = NAV.sector; if (LEVELS.indexOf(lv) >= 3) keep.cell = NAV.cell; NAV = keep; mount(); }
    else if (act === "village") { NAV = { level: "village", district: t.getAttribute("data-district"), sector: t.getAttribute("data-sector"), cell: t.getAttribute("data-cell"), village: t.getAttribute("data-village") }; SELV = D.hierarchy.villages.filter(function (v) { return v.village === NAV.village && v.cell === NAV.cell && v.district === NAV.district; })[0]; if (VIEW !== "drill") VIEW = "drill"; mount(); }
    else if (act === "report") { var el = document.getElementById("rep-note"); addReport({ village: t.getAttribute("data-village"), note: (el && el.value || "").trim(), when: new Date().toLocaleString() }); mount(); }
  });
  document.getElementById("btn-logout").addEventListener("click", logout);

  // test hook (headless): expose render fns
  window.__EWS_TEST__ = { setRole: function (id) { ROLE = D.roles.filter(function (r) { return r.id === id; })[0]; NAV = initNav(); SELV = null; }, VIEWS: VIEWS, NAVDEF: NAVDEF, isAdmin: function () { return !!ROLE.admin; }, drillTo: function (nav) { NAV = nav; SELV = null; } };
})();
