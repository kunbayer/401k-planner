import { useEffect, useMemo, useState } from "react";

const LIMIT_402G = 24500;
const LIMIT_415C = 72000;
const LIMIT_401A17 = 360000;
const CATCHUP_50 = 8000;
const CATCHUP_60_63 = 11250;
const YEAR_END = new Date(2026, 11, 31);

const fmt = (n) => (n == null || Number.isNaN(n) ? "-" : "$" + Math.round(n).toLocaleString());
const fmt2 = (n) =>
  n == null || Number.isNaN(n)
    ? "-"
    : "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseDate = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const fmtDate = (d) => d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const toISO = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

function buildFuturePayDates(lastPay) {
  const dates = [];
  let d = addDays(lastPay, 14);
  while (d <= YEAR_END) {
    dates.push(new Date(d));
    d = addDays(d, 14);
  }
  return dates;
}

function buildEvents(lastPayDate, paycheckGross, sti, ltis) {
  const payDates = buildFuturePayDates(lastPayDate);
  const events = payDates.map((d) => ({ date: d, type: "Regular", gross: paycheckGross }));

  if (sti && sti.amount > 0 && sti.date) {
    const sd = parseDate(sti.date);
    if (sd > lastPayDate && sd <= YEAR_END) {
      events.push({ date: sd, type: "STI", gross: sti.amount });
    }
  }

  ltis.forEach((l, i) => {
    if (l.amount > 0 && l.date) {
      const ld = parseDate(l.date);
      if (ld > lastPayDate && ld <= YEAR_END) {
        events.push({ date: ld, type: `LTI${ltis.length > 1 ? " #" + (i + 1) : ""}`, gross: l.amount });
      }
    }
  });

  events.sort((a, b) => a.date - b.date);
  return events;
}

function simulate({ events, regRates, bonusRates, ytd, spillOn, catchupAmount, matchStrategy }) {
  const limit402g = LIMIT_402G + (catchupAmount || 0);
  const ms = matchStrategy || DEFAULTS.matchStrategy;

  let cumPreRoth = ytd.preTax + ytd.roth;
  let cumAfterTax = ytd.afterTax;
  let cumMatch = ytd.match;
  let cumRetirement = ytd.retirement;
  let cumAdditional = ytd.additional;
  let cumNonElective = cumRetirement + cumAdditional;
  let cumComp = ytd.comp;

  let cum415 = cumPreRoth + cumAfterTax + cumMatch + cumNonElective;

  const caps = { d402g: null, d415c: null, dMatchStop: null, d401a17: null };
  const rows = [];

  for (const ev of events) {
    const rates = ev.type === "Regular" ? regRates : bonusRates;

    const compRoom = Math.max(0, LIMIT_401A17 - cumComp);
    const eligibleGross = Math.min(ev.gross, compRoom);
    const ineligibleGross = ev.gross - eligibleGross;
    if (compRoom === 0 && !caps.d401a17) caps.d401a17 = ev.date;
    if (eligibleGross < ev.gross && !caps.d401a17) caps.d401a17 = ev.date;

    const intendedPre = ev.gross * (rates.preTax / 100);
    const intendedRoth = ev.gross * (rates.roth / 100);
    const intendedAfterTax = ev.gross * (rates.afterTax / 100);

    const room402g = Math.max(0, limit402g - cumPreRoth);
    let actualPre;
    let actualRoth;
    let overflow;
    const intendedElective = intendedPre + intendedRoth;

    if (intendedElective <= room402g + 1e-9) {
      actualPre = intendedPre;
      actualRoth = intendedRoth;
      overflow = 0;
    } else {
      if (intendedElective > 0) {
        actualPre = intendedPre * (room402g / intendedElective);
        actualRoth = intendedRoth * (room402g / intendedElective);
      } else {
        actualPre = 0;
        actualRoth = 0;
      }
      overflow = intendedElective - room402g;
      if (!caps.d402g) caps.d402g = ev.date;
    }

    if (cumPreRoth + actualPre + actualRoth >= limit402g - 0.01 && !caps.d402g) caps.d402g = ev.date;

    const spillAmount = spillOn ? overflow : 0;
    let actualAfterTax = intendedAfterTax + spillAmount;

    const intendedElectiveRate = ev.gross > 0 ? intendedElective / ev.gross : 0;
    const tier1Threshold = ms.tier1Rate / 100;
    const tier2Threshold = (ms.tier1Rate + ms.tier2Rate) / 100;
    const matchRate =
      Math.min(intendedElectiveRate, tier1Threshold) * (ms.tier1Match / 100) +
      Math.max(0, Math.min(intendedElectiveRate - tier1Threshold, ms.tier2Rate / 100)) * (ms.tier2Match / 100);
    let match = eligibleGross * matchRate;

    let retirement = eligibleGross * (ms.retirement / 100);
    let additional = eligibleGross * (ms.additional / 100);
    
    const actualElective = actualPre + actualRoth + actualAfterTax;
    if (actualElective < 1e-6) {
      match = 0;
      retirement = 0;
      additional = 0;
    }
    
    let nonElective = retirement + additional;

    const room415c = Math.max(0, LIMIT_415C - cum415);
    const total = actualPre + actualRoth + actualAfterTax + match + nonElective;
    let matchStoppedThisRow = false;

    if (total > room415c + 1e-9) {
      let overby = total - room415c;

      const cutAT = Math.min(actualAfterTax, overby);
      actualAfterTax -= cutAT;
      overby -= cutAT;

      if (overby > 0) {
        const cut = Math.min(nonElective, overby);
        nonElective -= cut;
        overby -= cut;
      }

      if (overby > 0) {
        const cut = Math.min(match, overby);
        match -= cut;
        overby -= cut;
        matchStoppedThisRow = true;
      }

      if (overby > 0) {
        const cutPre = Math.min(actualPre, overby);
        actualPre -= cutPre;
        overby -= cutPre;
      }

      if (overby > 0) {
        const cutR = Math.min(actualRoth, overby);
        actualRoth -= cutR;
      }

      if (!caps.d415c) caps.d415c = ev.date;
    }

    cumPreRoth += actualPre + actualRoth;
    cumAfterTax += actualAfterTax;
    cumMatch += match;
    cumRetirement += retirement;
    cumAdditional += additional;
    cumNonElective += nonElective;
    cumComp += ev.gross;
    cum415 = cumPreRoth + cumAfterTax + cumMatch + cumNonElective;

    const zeroMatchFromHere = cum415 >= LIMIT_415C - 0.01;
    if (zeroMatchFromHere && !caps.dMatchStop) caps.dMatchStop = ev.date;
    if (matchStoppedThisRow && match < 1e-6 && !caps.dMatchStop) caps.dMatchStop = ev.date;

    const notes = [];
    if (overflow > 0) notes.push({ t: "402(g) cap hit", c: "warn" });
    if (spillAmount > 0) notes.push({ t: "Spillover -> after-tax", c: "warn" });
    if (matchStoppedThisRow) notes.push({ t: "Match truncated", c: "bad" });
    if (cum415 >= LIMIT_415C - 0.01) notes.push({ t: "415(c) hit", c: "bad" });
    if (ineligibleGross > 0) notes.push({ t: "Comp cap (401(a)(17))", c: "warn" });

    rows.push({
      date: ev.date,
      type: ev.type,
      gross: ev.gross,
      eligibleGross,
      preTax: actualPre,
      roth: actualRoth,
      afterTax: actualAfterTax,
      match,
      retirement,
      additional,
      cum402g: cumPreRoth,
      cum415,
      notes,
    });
  }

  const totals = rows.reduce(
    (a, r) => ({
      gross: a.gross + r.gross,
      preTax: a.preTax + r.preTax,
      roth: a.roth + r.roth,
      afterTax: a.afterTax + r.afterTax,
      match: a.match + r.match,
      retirement: a.retirement + r.retirement,
      additional: a.additional + r.additional,
    }),
    { gross: 0, preTax: 0, roth: 0, afterTax: 0, match: 0, retirement: 0, additional: 0 }
  );

  return {
    rows,
    caps,
    totals,
    finalState: { cumPreRoth, cumAfterTax, cumMatch, cumRetirement, cumAdditional, cumNonElective, cumComp, cum415, limit402g },
  };
}

function NumInput({ label, value, onChange, step, min, suffix, hint }) {
  return (
    <div>
      <label>
        {label}
        {suffix ? <span style={{ color: "#999", marginLeft: 4 }}>({suffix})</span> : null}
      </label>
      <input
        type="number"
        step={step || "0.01"}
        min={min ?? 0}
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      />
      {hint ? <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{hint}</div> : null}
    </div>
  );
}

function PercentageSliderInput({ label, value, onChange, step, max, hint, otherPcts }) {
  const safeValue = value == null ? 0 : value;
  const otherTotal = (otherPcts || []).reduce((sum, v) => sum + (v == null ? 0 : v), 0);
  const maxAllowed = Math.min(max || 50, 50 - otherTotal);
  const isCapped = safeValue >= maxAllowed;

  return (
    <div>
      <label>{label}</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="range"
          min="0"
          max={maxAllowed}
          step={step || "0.5"}
          value={safeValue}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <input
          type="number"
          step={step || "0.5"}
          min="0"
          max={maxAllowed}
          value={safeValue}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          style={{ width: 60 }}
        />
        <span style={{ color: "#999", minWidth: 20 }}>%</span>
      </div>
      {isCapped && otherTotal > 0 ? (
        <div style={{ fontSize: 11, color: "#d9534f", marginTop: 4 }}>
          Capped at {maxAllowed.toFixed(1)}% (total limit is 50%)
        </div>
      ) : hint ? (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{hint}</div>
      ) : null}
    </div>
  );
}

function DateInput({ label, value, onChange }) {
  return (
    <div>
      <label>{label}</label>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

const STORAGE_KEY = "bayer401kPlanner.v2";
const DEFAULTS = {
  lastPayDate: "2026-04-17",
  paycheckGross: 5000,
  sti: { amount: 0, date: "2026-03-13" },
  ltis: [{ amount: 0, date: "2026-06-05" }],
  ytd: { preTax: 0, roth: 0, afterTax: 0, match: 0, retirement: 0, additional: 0, comp: 0 },
  regRates: { preTax: 6, roth: 0, afterTax: 0 },
  bonusRates: { preTax: 6, roth: 0, afterTax: 0 },
  spillOn: true,
  catchup: "none",
  matchStrategy: {
    tier1Rate: 3,
    tier1Match: 100,
    tier2Rate: 4,
    tier2Match: 50,
    retirement: 5,
    additional: 1,
  },
};

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return null;
  }
}

function saveState(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore storage errors
  }
}

function App() {
  const saved = loadSaved() || DEFAULTS;
  const [lastPayDate, setLastPayDate] = useState(saved.lastPayDate);
  const [paycheckGross, setPaycheckGross] = useState(saved.paycheckGross);
  const [sti, setSti] = useState(saved.sti);
  const [ltis, setLtis] = useState(saved.ltis);
  const [ytd, setYtd] = useState(saved.ytd);
  const [regRates, setRegRates] = useState(saved.regRates);
  const [bonusRates, setBonusRates] = useState(saved.bonusRates);
  const [spillOn, setSpillOn] = useState(saved.spillOn);
  const [catchup, setCatchup] = useState(saved.catchup);
  const [matchStrategy, setMatchStrategy] = useState(saved.matchStrategy);
  const [savedAt, setSavedAt] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [helpTab, setHelpTab] = useState("getting-started");

  useEffect(() => {
    saveState({ lastPayDate, paycheckGross, sti, ltis, ytd, regRates, bonusRates, spillOn, catchup, matchStrategy });
    setSavedAt(new Date());
  }, [lastPayDate, paycheckGross, sti, ltis, ytd, regRates, bonusRates, spillOn, catchup, matchStrategy]);

  const resetAll = () => {
    if (!window.confirm("Reset all inputs to defaults and clear saved data?")) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
    setLastPayDate(DEFAULTS.lastPayDate);
    setPaycheckGross(DEFAULTS.paycheckGross);
    setSti(DEFAULTS.sti);
    setLtis(DEFAULTS.ltis);
    setYtd(DEFAULTS.ytd);
    setRegRates(DEFAULTS.regRates);
    setBonusRates(DEFAULTS.bonusRates);
    setSpillOn(DEFAULTS.spillOn);
    setCatchup(DEFAULTS.catchup);
    setMatchStrategy(DEFAULTS.matchStrategy);
  };

  const exportJson = () => {
    const state = { lastPayDate, paycheckGross, sti, ltis, ytd, regRates, bonusRates, spillOn, catchup, matchStrategy };
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `401k-planner-${toISO(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const obj = JSON.parse(ev.target.result);
        if (obj.lastPayDate) setLastPayDate(obj.lastPayDate);
        if (obj.paycheckGross != null) setPaycheckGross(obj.paycheckGross);
        else if (obj.annualBase != null) setPaycheckGross(obj.annualBase / 26);
        if (obj.sti) setSti(obj.sti);
        if (obj.ltis) setLtis(obj.ltis);
        if (obj.ytd) {
          const ytdObj = obj.ytd;
          if (ytdObj.nonElective != null && ytdObj.retirement == null && ytdObj.additional == null) {
            ytdObj.retirement = ytdObj.nonElective * 0.833;
            ytdObj.additional = ytdObj.nonElective * 0.167;
            delete ytdObj.nonElective;
          }
          setYtd(ytdObj);
        }
        if (obj.regRates) setRegRates(obj.regRates);
        if (obj.bonusRates) setBonusRates(obj.bonusRates);
        if (typeof obj.spillOn === "boolean") setSpillOn(obj.spillOn);
        if (obj.catchup) setCatchup(obj.catchup);
      } catch (err) {
        window.alert("Could not parse file: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const catchupAmount = catchup === "c50" ? CATCHUP_50 : catchup === "c60" ? CATCHUP_60_63 : 0;

  const sim = useMemo(() => {
    const lpd = parseDate(lastPayDate);
    const events = buildEvents(
      lpd,
      Number(paycheckGross) || 0,
      {
        amount: Number(sti.amount) || 0,
        date: sti.date,
      },
      ltis.map((l) => ({ amount: Number(l.amount) || 0, date: l.date }))
    );

    const ytdNum = {
      preTax: Number(ytd.preTax) || 0,
      roth: Number(ytd.roth) || 0,
      afterTax: Number(ytd.afterTax) || 0,
      match: Number(ytd.match) || 0,
      retirement: Number(ytd.retirement) || 0,
      additional: Number(ytd.additional) || 0,
      comp: Number(ytd.comp) || 0,
    };

    const userSim = simulate({
      events,
      regRates: {
        preTax: Number(regRates.preTax) || 0,
        roth: Number(regRates.roth) || 0,
        afterTax: Number(regRates.afterTax) || 0,
      },
      bonusRates: {
        preTax: Number(bonusRates.preTax) || 0,
        roth: Number(bonusRates.roth) || 0,
        afterTax: Number(bonusRates.afterTax) || 0,
      },
      ytd: ytdNum,
      spillOn,
      catchupAmount,
      matchStrategy,
    });

    const remainingElectiveLimit = Math.max(0, LIMIT_402G + catchupAmount - (ytdNum.preTax + ytdNum.roth));
    const remainingGross = events.reduce((s, e) => s + e.gross, 0);

    let idealRate = 0.07;
    if (remainingGross > 0) {
      const sevenPctTotal = 0.07 * remainingGross;
      if (sevenPctTotal <= remainingElectiveLimit) {
        idealRate = 0.07;
      } else if (remainingElectiveLimit <= 0) {
        idealRate = 0;
      } else {
        idealRate = remainingElectiveLimit / remainingGross;
      }
    }

    const idealPct = idealRate * 100;
    const idealSim = simulate({
      events,
      regRates: { preTax: idealPct, roth: 0, afterTax: 0 },
      bonusRates: { preTax: idealPct, roth: 0, afterTax: 0 },
      ytd: ytdNum,
      spillOn: true,
      catchupAmount,
      matchStrategy,
    });

    const maxMatchSim = simulate({
      events,
      regRates: { preTax: 7, roth: 0, afterTax: 0 },
      bonusRates: { preTax: 7, roth: 0, afterTax: 0 },
      ytd: ytdNum,
      spillOn: true,
      catchupAmount,
      matchStrategy,
    });

    const maxPossibleMatch = Math.max(maxMatchSim.finalState.cumMatch, userSim.finalState.cumMatch);
    const matchGap = Math.max(0, maxPossibleMatch - userSim.finalState.cumMatch);
    const userFutureElective = userSim.totals.preTax + userSim.totals.roth;
    const unused402g = Math.max(0, LIMIT_402G + catchupAmount - (ytdNum.preTax + ytdNum.roth + userFutureElective));
    const unused415c = Math.max(0, LIMIT_415C - userSim.finalState.cum415);

    return {
      ...userSim,
      idealSim,
      idealPct,
      maxPossibleMatch,
      matchGap,
      unused402g,
      unused415c,
    };
  }, [lastPayDate, paycheckGross, sti, ltis, ytd, regRates, bonusRates, spillOn, catchupAmount, matchStrategy]);

  const addLti = () => setLtis([...ltis, { amount: 0, date: "2026-09-01" }]);
  const rmLti = (i) => setLtis(ltis.filter((_, idx) => idx !== i));
  const upLti = (i, field, v) => setLtis(ltis.map((l, idx) => (idx === i ? { ...l, [field]: v } : l)));

  const regPctSum = (Number(regRates.preTax) || 0) + (Number(regRates.roth) || 0) + (Number(regRates.afterTax) || 0);
  const bonusPctSum =
    (Number(bonusRates.preTax) || 0) + (Number(bonusRates.roth) || 0) + (Number(bonusRates.afterTax) || 0);

  return (
    <div className="app">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1>401(k) Contribution Planner - 2026</h1>
          <div className="sub">
            Configure your Bayer plan match strategy below (default: 100% match on first 3%, 50% on next 4%, plus 5% + 1% non-elective). Match continues past 402(g) and stops only at 415(c).
          </div>
        </div>
        <div className="flex" style={{ gap: 6, flexWrap: "wrap" }}>
          <span className="pill" title="Inputs auto-saved to this browser">
            {savedAt ? `Auto-saved ${savedAt.toLocaleTimeString()}` : "Saved"}
          </span>
          <button onClick={exportJson} title="Download inputs as JSON">
            Export
          </button>
          <button 
            onClick={() => window.open("https://github.com/kunbayer/401k-planner/raw/main/401k-planner-standalone.html", "_blank")}
            title="Download standalone HTML for offline use - no server access needed"
            style={{ background: "#28a745", color: "#fff" }}
          >
            📥 Download Standalone
          </button>
          <label style={{ margin: 0 }}>
            <span
              style={{
                display: "inline-block",
                border: "1px solid var(--border)",
                background: "#fff",
                padding: "6px 12px",
                borderRadius: 6,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Import
            </span>
            <input type="file" accept="application/json" onChange={importJson} style={{ display: "none" }} />
          </label>
          <button className="danger ghost" onClick={resetAll} title="Clear saved data and reset defaults">
            Reset
          </button>
          <button onClick={() => setShowHelp(true)} title="Learn about 401(k) terms and limits">
            Help
          </button>
        </div>
      </div>

      <div style={{ background: "#e7f3ff", border: "1px solid #bee5eb", borderRadius: 6, padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "#004085", lineHeight: 1.6 }}>
          <strong>Disclaimer:</strong> This tool is for educational purposes only and does not constitute financial, tax, or investment advice. 
          Please consult with a qualified financial advisor or tax professional before making any decisions regarding your 401(k) contributions.
          Results are estimates based on 2026 IRS limits.
        </div>
      </div>

      <div style={{ background: "#f0f8e7", border: "1px solid #c3e6cb", borderRadius: 6, padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "#155724", lineHeight: 1.6 }}>
          <strong>🔒 Privacy & Data:</strong> <strong>No data is sent to any server.</strong> All your inputs are stored only in your browser's local storage on your device. 
          You have full control: use "Export" to download your data, or clear everything with "Reset". 
          For maximum privacy, <a href="#" style={{ color: "#155724", fontWeight: "bold" }} onClick={(e) => { e.preventDefault(); alert("Download the standalone HTML file from the app to run locally with zero server access."); }}>
            download the standalone version
          </a> and run it completely offline.
        </div>
      </div>

      {showHelp && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "white", borderRadius: 8, maxWidth: 700, maxHeight: "85vh", overflow: "auto", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>Help & Getting Started</h2>
              <button onClick={() => setShowHelp(false)} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#999" }}>
                ✕
              </button>
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 20, borderBottom: "1px solid #ddd" }}>
              <button
                onClick={() => setHelpTab("getting-started")}
                style={{
                  background: helpTab === "getting-started" ? "#007bff" : "#f5f5f5",
                  color: helpTab === "getting-started" ? "white" : "#333",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "4px 4px 0 0",
                  cursor: "pointer",
                  fontWeight: helpTab === "getting-started" ? "bold" : "normal",
                }}
              >
                Getting Started
              </button>
              <button
                onClick={() => setHelpTab("terms")}
                style={{
                  background: helpTab === "terms" ? "#007bff" : "#f5f5f5",
                  color: helpTab === "terms" ? "white" : "#333",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "4px 4px 0 0",
                  cursor: "pointer",
                  fontWeight: helpTab === "terms" ? "bold" : "normal",
                }}
              >
                Terms & Limits
              </button>
              <button
                onClick={() => setHelpTab("privacy")}
                style={{
                  background: helpTab === "privacy" ? "#007bff" : "#f5f5f5",
                  color: helpTab === "privacy" ? "white" : "#333",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "4px 4px 0 0",
                  cursor: "pointer",
                  fontWeight: helpTab === "privacy" ? "bold" : "normal",
                }}
              >
                🔒 Privacy & Offline
              </button>
            </div>

            {helpTab === "getting-started" && (
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                <h3 style={{ marginTop: 0 }}>Step-by-Step Guide</h3>
                
                <div style={{ background: "#f9f9f9", padding: 12, borderRadius: 4, marginBottom: 16 }}>
                  <strong>💡 Tip:</strong> This is easiest if you have your recent pay slip handy. It will take about 5 minutes.
                </div>

                <div style={{ marginBottom: 16 }}>
                  <h4>Step 1: Enter Your Pay Schedule</h4>
                  <ul>
                    <li>Find your <strong>Last Paycheck Date</strong> (look for the date on your most recent pay slip)</li>
                    <li>Enter your <strong>Regular Paycheck Gross</strong> — this is your gross pay before taxes (usually labeled as "Gross" on the pay slip)</li>
                    <li>The tool assumes biweekly pay and projects to Dec 31, 2026</li>
                  </ul>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <h4>Step 2: Add Bonuses (Optional)</h4>
                  <ul>
                    <li>If you expect an STI (short-term incentive), enter the amount and expected pay date</li>
                    <li>For LTIs (long-term incentives), click "+ Add LTI" for each one</li>
                    <li>If you don't know the exact amounts, you can skip this for now and see base projections</li>
                  </ul>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <h4>Step 3: Enter Your YTD (Year-to-Date) Totals</h4>
                  <ul>
                    <li>Look at your most recent pay slip for your YTD amounts:
                      <ul>
                        <li><strong>YTD employee pre-tax</strong> — usually shows "Pre-tax" or "Traditional" YTD</li>
                        <li><strong>YTD employee Roth</strong> — if you contribute to Roth</li>
                        <li><strong>YTD employee after-tax</strong> — if you have after-tax contributions</li>
                        <li><strong>YTD company match</strong> — employer match received so far</li>
                        <li><strong>YTD company 5% retirement</strong> — base employer contribution</li>
                        <li><strong>YTD company 1% additional</strong> — only if your plan includes this</li>
                      </ul>
                    </li>
                  </ul>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <h4>Step 4: Set Your Contribution Strategy</h4>
                  <ul>
                    <li>Under "Company Match Strategy", verify the match structure matches your plan (usually already set correctly)</li>
                    <li>Under "Contribution Rates", set your desired <strong>Pre-tax %</strong> using the slider or number box
                      <ul>
                        <li><strong>Tip:</strong> If you want to maximize employer match, aim for at least 7% (3% for 100% match + 4% for 50% match)</li>
                      </ul>
                    </li>
                    <li>You can also contribute to Roth or After-tax if desired (combined limit: 50%)</li>
                    <li>Use the sliders for easy adjustment — watch the projections update in real-time</li>
                  </ul>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <h4>Step 5: Review Your Projections</h4>
                  <ul>
                    <li>Scroll down to "Key Dates & Caps" to see when you'll hit the various IRS limits</li>
                    <li>Look at the "Per-Paycheck Projection" table to see contribution amounts over time</li>
                    <li>Check "Money Left on the Table" at the top to see if you're capturing all employer match</li>
                  </ul>
                </div>

                <div style={{ background: "#e7f3ff", padding: 12, borderRadius: 4 }}>
                  <strong>Next Steps:</strong> Adjust your contribution percentage and watch how it affects the cap dates and match capture. Most employees find their sweet spot between 7-15% to balance take-home pay with employer benefits.
                </div>
              </div>
            )}

            {helpTab === "terms" && (
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                <h3 style={{ marginTop: 0 }}>2026 IRS Limits</h3>
                <ul>
                  <li><strong>402(g) Elective Deferral Cap:</strong> $24,500 (max pre-tax + Roth combined)</li>
                  <li><strong>415(c) Total Additions Cap:</strong> $72,000 (employee + employer combined)</li>
                  <li><strong>401(a)(17) Compensation Cap:</strong> $360,000 (max compensation counted for match/non-elective)</li>
                  <li><strong>Catch-up Age 50+:</strong> +$8,000 (total $32,500)</li>
                  <li><strong>Catch-up Age 60-63:</strong> +$11,250 (total $35,750)</li>
                </ul>

                <h3>Key Terms</h3>
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <strong>402(g) - Elective Deferral Cap:</strong>
                    <p>The maximum amount of pre-tax and Roth contributions <strong>you can make</strong> to your 401(k) in a calendar year ($24,500 in 2026). Employer contributions (match, 5%, 1%) do NOT count toward this limit. When you hit this limit, no more employee deferrals can be made for the rest of the year.</p>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <strong>415(c) - Total Additions Cap:</strong>
                    <p>The maximum <strong>combined total</strong> that can go into your 401(k) account in one year ($72,000 in 2026). This includes: your employee deferrals (pre-tax, Roth, after-tax) + employer match + employer's 5% retirement contribution + employer's 1% additional contribution. Once reached, no more contributions (from you or your employer) can be added.</p>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <strong>401(a)(17) - Compensation Cap:</strong>
                    <p>The maximum compensation that counts toward calculating your employer match and non-elective contributions. High earners may have some compensation above this limit not counted for match calculations.</p>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <strong>Employer Match:</strong>
                    <p>Free money your employer contributes based on your deferrals. Bayer's plan: 100% match on first 3% + 50% match on next 4% of your deferrals.</p>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <strong>5% Retirement Contribution:</strong>
                    <p>A base company contribution equal to 5% of eligible compensation, regardless of whether you contribute.</p>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <strong>1% Additional Contribution:</strong>
                    <p>A job-level-based company contribution. Not all employees receive this—check your plan documents.</p>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <strong>Spillover:</strong>
                    <p>When enabled, excess pre-tax/Roth contributions that would exceed the 402(g) cap ($24,500) are automatically redirected to after-tax contributions, allowing you to defer more total money. After-tax contributions do NOT count toward the 402(g) limit but DO count toward the 415(c) total cap.</p>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <strong>After-Tax Contributions:</strong>
                    <p>Employee contributions that are made with post-tax dollars. They don't reduce your taxable income like pre-tax contributions do, but can receive spillover funds when you exceed the 402(g) limit. They count toward the 415(c) total cap but not the 402(g) limit.</p>
                  </div>
                  <div>
                    <strong>YTD (Year-to-Date):</strong>
                    <p>Your total contributions and employer additions since the start of 2026 through your last paycheck. This is the starting point for the projection.</p>
                  </div>
                </div>
              </div>
            )}

            {helpTab === "privacy" && (
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                <h3 style={{ marginTop: 0 }}>🔒 Privacy & Data Security</h3>
                
                <div style={{ background: "#d4edda", border: "1px solid #c3e6cb", borderRadius: 4, padding: 12, marginBottom: 16 }}>
                  <strong style={{ color: "#155724" }}>✓ No data sent to any server</strong>
                  <p style={{ margin: "8px 0 0 0", color: "#155724" }}>
                    All your inputs, projections, and settings are stored ONLY in your browser's local storage. Nothing is transmitted to external servers or logged.
                  </p>
                </div>

                <h3>Where Your Data is Stored</h3>
                <ul style={{ paddingLeft: 20 }}>
                  <li><strong>Browser Local Storage:</strong> Your current session data persists in your browser (auto-save on every change)</li>
                  <li><strong>Your Device Only:</strong> Local storage is device-specific and browser-specific (different browsers ≠ shared data)</li>
                  <li><strong>Never Uploaded:</strong> No automatic backups, no cloud sync, no telemetry</li>
                </ul>

                <h3>Download Standalone Version for Maximum Privacy</h3>
                <p>
                  If you prefer <strong>zero server access</strong>, download the standalone HTML file. It contains the entire app in a single file with no external dependencies. 
                  Simply save it and open it in any browser—works offline with the same full functionality.
                </p>
                <p style={{ fontSize: 12, color: "#666" }}>
                  <strong>How to use:</strong> Click "📥 Download Standalone" button at the top, save the file to your computer, then double-click to open it locally. 
                  Your data stays 100% on your device.
                </p>

                <h3>Data You Control</h3>
                <ul style={{ paddingLeft: 20 }}>
                  <li><strong>Export:</strong> Download your inputs as JSON at any time</li>
                  <li><strong>Import:</strong> Re-upload your exported settings to restore them</li>
                  <li><strong>Reset:</strong> Clear all data from your browser with one click</li>
                  <li><strong>Delete via Browser:</strong> Clear site data in browser settings (Settings → Privacy → Clear browsing data)</li>
                </ul>

                <h3>GitHub Repository</h3>
                <p>
                  The full source code is open-source on GitHub: <a href="https://github.com/kunbayer/401k-planner" target="_blank" rel="noopener noreferrer" style={{ color: "#007bff" }}>
                    kunbayer/401k-planner
                  </a>. You can review the code to verify no data is sent anywhere.
                </p>
              </div>
            )}

            <div style={{ marginTop: 20, textAlign: "right" }}>
              <button onClick={() => setShowHelp(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <MoneyOnTableCard
        matchGap={sim.matchGap}
        idealPct={sim.idealPct}
        userMatch={sim.finalState.cumMatch}
        idealMatch={sim.maxPossibleMatch}
        unused402g={sim.unused402g}
        unused415c={sim.unused415c}
        userElectivePct={(Number(regRates.preTax) || 0) + (Number(regRates.roth) || 0)}
      />

      <div className="card">
        <h2>Pay Schedule & Compensation</h2>
        <div className="grid grid-3">
          <DateInput label="Last paycheck date" value={lastPayDate} onChange={setLastPayDate} />
          <div>
            <label>Pay frequency</label>
            <input type="text" value="Biweekly (every 14 days)" readOnly style={{ background: "#fafbfc" }} />
          </div>
          <NumInput
            label="Regular paycheck gross"
            value={paycheckGross}
            onChange={setPaycheckGross}
            step="10"
            suffix="$"
            hint="Gross per biweekly paycheck (before taxes/deductions)"
          />
        </div>

        <div className="divider" />
        <h2>STI (short-term incentive)</h2>
        <div className="grid grid-2">
          <NumInput label="Amount" value={sti.amount} onChange={(v) => setSti({ ...sti, amount: v })} step="100" suffix="$" />
          <DateInput label="Pay date" value={sti.date} onChange={(v) => setSti({ ...sti, date: v })} />
        </div>

        <div className="divider" />
        <div className="flex" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>
            LTIs (long-term incentives) <span className="hdr-sub">- add as many as needed</span>
          </h2>
          <button onClick={addLti}>+ Add LTI</button>
        </div>
        <div className="stack">
          {ltis.map((l, i) => (
            <div key={i} className="row">
              <NumInput
                label={`LTI #${i + 1} amount`}
                value={l.amount}
                onChange={(v) => upLti(i, "amount", v)}
                step="100"
                suffix="$"
              />
              <DateInput label="Pay date" value={l.date} onChange={(v) => upLti(i, "date", v)} />
              <div className="rm" style={{ paddingBottom: 2 }}>
                <button className="danger ghost" onClick={() => rmLti(i)} disabled={ltis.length === 1}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>
          YTD as of last paycheck <span className="hdr-sub">(used as the starting point - not recalculated)</span>
        </h2>
        <div className="grid grid-3">
          <NumInput label="YTD employee pre-tax" value={ytd.preTax} onChange={(v) => setYtd({ ...ytd, preTax: v })} step="10" suffix="$" />
          <NumInput label="YTD employee Roth" value={ytd.roth} onChange={(v) => setYtd({ ...ytd, roth: v })} step="10" suffix="$" />
          <NumInput
            label="YTD employee after-tax"
            value={ytd.afterTax}
            onChange={(v) => setYtd({ ...ytd, afterTax: v })}
            step="10"
            suffix="$"
          />
          <NumInput label="YTD company match" value={ytd.match} onChange={(v) => setYtd({ ...ytd, match: v })} step="10" suffix="$" />
          <NumInput
            label="YTD company 5% retirement"
            value={ytd.retirement}
            onChange={(v) => setYtd({ ...ytd, retirement: v })}
            step="10"
            suffix="$"
          />
          <NumInput
            label="YTD company 1% additional"
            value={ytd.additional}
            onChange={(v) => setYtd({ ...ytd, additional: v })}
            step="10"
            suffix="$"
          />
          <NumInput
            label="YTD eligible comp paid"
            value={ytd.comp}
            onChange={(v) => setYtd({ ...ytd, comp: v })}
            step="1000"
            suffix="$"
            hint="For 401(a)(17) tracking"
          />
        </div>
      </div>

      <div className="card">
        <h2>Company Match Strategy</h2>
        <div className="grid grid-3">
          <NumInput
            label="Tier 1: Match threshold %"
            value={matchStrategy.tier1Rate}
            onChange={(v) => setMatchStrategy({ ...matchStrategy, tier1Rate: v })}
            step="0.5"
            hint="Employee deferral % for first tier match"
          />
          <NumInput
            label="Tier 1: Match %"
            value={matchStrategy.tier1Match}
            onChange={(v) => setMatchStrategy({ ...matchStrategy, tier1Match: v })}
            step="5"
            hint="Employer match % on tier 1"
          />
          <div></div>
          <NumInput
            label="Tier 2: Additional threshold %"
            value={matchStrategy.tier2Rate}
            onChange={(v) => setMatchStrategy({ ...matchStrategy, tier2Rate: v })}
            step="0.5"
            hint="Additional deferral % for second tier match"
          />
          <NumInput
            label="Tier 2: Match %"
            value={matchStrategy.tier2Match}
            onChange={(v) => setMatchStrategy({ ...matchStrategy, tier2Match: v })}
            step="5"
            hint="Employer match % on tier 2"
          />
          <div></div>
          <NumInput
            label="Retirement auto contribution %"
            value={matchStrategy.retirement}
            onChange={(v) => setMatchStrategy({ ...matchStrategy, retirement: v })}
            step="0.5"
            hint="Base company retirement contribution"
          />
          <NumInput
            label="Additional contribution %"
            value={matchStrategy.additional}
            onChange={(v) => setMatchStrategy({ ...matchStrategy, additional: v })}
            step="0.5"
            hint="Job level-based company contribution"
          />
        </div>
      </div>

      <div className="card">
        <h2>
          Contribution Rates - Regular Paychecks <span className="hdr-sub">total: {regPctSum.toFixed(1)}% (max 50%)</span>
        </h2>
        <div className="grid grid-3">
          <PercentageSliderInput
            label="Pre-tax %"
            value={regRates.preTax}
            onChange={(v) => setRegRates({ ...regRates, preTax: v })}
            step="0.5"
            otherPcts={[regRates.roth, regRates.afterTax]}
          />
          <PercentageSliderInput
            label="Roth %"
            value={regRates.roth}
            onChange={(v) => setRegRates({ ...regRates, roth: v })}
            step="0.5"
            otherPcts={[regRates.preTax, regRates.afterTax]}
          />
          <PercentageSliderInput
            label="After-tax %"
            value={regRates.afterTax}
            onChange={(v) => setRegRates({ ...regRates, afterTax: v })}
            step="0.5"
            otherPcts={[regRates.preTax, regRates.roth]}
          />
        </div>

        <div className="divider" />
        <h2>
          Contribution Rates - Bonuses (STI + all LTIs) <span className="hdr-sub">total: {bonusPctSum.toFixed(1)}% (max 50%)</span>
        </h2>
        <div className="grid grid-3">
          <PercentageSliderInput
            label="Pre-tax %"
            value={bonusRates.preTax}
            onChange={(v) => setBonusRates({ ...bonusRates, preTax: v })}
            step="0.5"
            otherPcts={[bonusRates.roth, bonusRates.afterTax]}
          />
          <PercentageSliderInput
            label="Roth %"
            value={bonusRates.roth}
            onChange={(v) => setBonusRates({ ...bonusRates, roth: v })}
            step="0.5"
            otherPcts={[bonusRates.preTax, bonusRates.afterTax]}
          />
          <PercentageSliderInput
            label="After-tax %"
            value={bonusRates.afterTax}
            onChange={(v) => setBonusRates({ ...bonusRates, afterTax: v })}
            step="0.5"
            otherPcts={[bonusRates.preTax, bonusRates.roth]}
          />
        </div>

        <div className="divider" />
        <div className="grid grid-2">
          <div className="toggle">
            <input id="spill" type="checkbox" checked={spillOn} onChange={(e) => setSpillOn(e.target.checked)} />
            <label htmlFor="spill" style={{ margin: 0 }}>
              Spill pre-tax/Roth into after-tax once 402(g) cap is hit
            </label>
          </div>
          <div>
            <label>Catch-up contribution</label>
            <select value={catchup} onChange={(e) => setCatchup(e.target.value)}>
              <option value="none">None (under 50)</option>
              <option value="c50">Age 50+ (+$8,000)</option>
              <option value="c60">Age 60-63 (+$11,250)</option>
            </select>
          </div>
        </div>
        {regPctSum > 50 && (
          <div style={{ marginTop: 12, padding: 8, background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 4, color: "#856404", fontSize: 12 }}>
            ⚠️ Regular paycheck contributions exceed 50% limit. Current: {regPctSum.toFixed(1)}%. Please adjust.
          </div>
        )}
        {bonusPctSum > 50 && (
          <div style={{ marginTop: 12, padding: 8, background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 4, color: "#856404", fontSize: 12 }}>
            ⚠️ Bonus contributions exceed 50% limit. Current: {bonusPctSum.toFixed(1)}%. Please adjust.
          </div>
        )}
      </div>

      <div className="card">
        <h2>Key Dates & Caps</h2>
        <div className="caps">
          <CapCard
            title="402(g) Elective Deferral"
            limit={sim.finalState.limit402g}
            hitDate={sim.caps.d402g}
            finalAmount={sim.finalState.cumPreRoth}
            hint={spillOn ? "Spillover ON: overflow routed to after-tax" : "Spillover OFF: pre-tax/Roth stops at cap"}
          />
          <CapCard
            title="415(c) Total Additions"
            limit={LIMIT_415C}
            hitDate={sim.caps.d415c}
            finalAmount={sim.finalState.cum415}
            hint="Employee + company combined"
          />
          <CapCard
            title="Employer Match Stops"
            limit={null}
            hitDate={sim.caps.dMatchStop}
            finalAmount={sim.finalState.cumMatch}
            hint="First pay where match is truncated to $0"
            mode="matchStop"
          />
        </div>

        <div className="divider" />
        <div className="grid grid-4" style={{ fontSize: 13 }}>
          <div className="kv">
            <span>Year-end employee total</span>
            <span>{fmt(sim.totals.preTax + sim.totals.roth + sim.totals.afterTax + ytd.preTax + ytd.roth + ytd.afterTax)}</span>
          </div>
          <div className="kv">
            <span>Year-end company match</span>
            <span>{fmt(sim.finalState.cumMatch)}</span>
          </div>
          <div className="kv">
            <span>Year-end company 5%</span>
            <span>{fmt(sim.finalState.cumRetirement)}</span>
          </div>
          <div className="kv">
            <span>Year-end company 1% (add)</span>
            <span>{fmt(sim.finalState.cumAdditional)}</span>
          </div>
          <div className="kv">
            <span>Year-end 415(c) total</span>
            <span>
              {fmt(sim.finalState.cum415)} / {fmt(LIMIT_415C)}
            </span>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>
          Per-Paycheck Projection <span className="hdr-sub">({sim.rows.length} events from {lastPayDate} to 2026-12-31)</span>
        </h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pay Date</th>
                <th>Type</th>
                <th>Gross</th>
                <th>EE Pre-tax</th>
                <th>EE Roth</th>
                <th>EE After-tax</th>
                <th>ER Match</th>
                <th>ER 5%</th>
                <th>ER 1% (add)</th>
                <th>Cum. 402(g)</th>
                <th>Cum. 415(c)</th>
                <th style={{ textAlign: "left" }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {sim.rows.map((r, i) => (
                <tr key={i}>
                  <td>{fmtDate(r.date)}</td>
                  <td>{r.type}</td>
                  <td>{fmt(r.gross)}</td>
                  <td>{fmt2(r.preTax)}</td>
                  <td>{fmt2(r.roth)}</td>
                  <td>{fmt2(r.afterTax)}</td>
                  <td>{fmt2(r.match)}</td>
                  <td>{fmt2(r.retirement)}</td>
                  <td>{fmt2(r.additional)}</td>
                  <td>{fmt(r.cum402g)}</td>
                  <td>{fmt(r.cum415)}</td>
                  <td style={{ textAlign: "left" }}>
                    {r.notes.map((n, j) => (
                      <span key={j} className={`chip ${n.c}`}>
                        {n.t}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
              <tr className="totals">
                <td colSpan={2}>Totals (projected)</td>
                <td>{fmt(sim.totals.gross)}</td>
                <td>{fmt(sim.totals.preTax)}</td>
                <td>{fmt(sim.totals.roth)}</td>
                <td>{fmt(sim.totals.afterTax)}</td>
                <td>{fmt(sim.totals.match)}</td>
                <td>{fmt(sim.totals.retirement)}</td>
                <td>{fmt(sim.totals.additional)}</td>
                <td colSpan={3}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginTop: 16 }}>
        Estimator only. Verify with plan administrator. See Help tab for 2026 IRS limits and term definitions. Source: IRS.gov COLA table.
      </div>
    </div>
  );
}

function MoneyOnTableCard({ matchGap, idealPct, userMatch, idealMatch, unused402g, unused415c, userElectivePct }) {
  const threshold = 1;
  const leaving = matchGap > threshold;
  const overshooting = matchGap < -threshold;
  const capturing = !leaving && !overshooting;

  let tone;
  let headline;
  let detail;

  if (leaving) {
    tone = "bad";
    headline = fmt(matchGap);
    detail =
      userElectivePct < 7
        ? `Your elective rate is ${userElectivePct.toFixed(1)}% - below 7% needed for the full employer match. Bump elective to at least 7.0% to capture it.`
        : `You're hitting 402(g) or 415(c) too early and losing match on remaining paychecks. Lower your elective rate toward ${idealPct.toFixed(1)}% (with spillover ON) to smooth deferrals across the year.`;
  } else if (capturing) {
    tone = "good";
    headline = "$0";
    detail = `You're capturing the full employer match of ${fmt(userMatch)}. Nice.`;
  } else {
    tone = "good";
    headline = "$0";
    detail = "Match optimized.";
  }

  return (
    <div className={`moneycard ${tone}`}>
      <div className="moneycard-left">
        <div className="moneycard-title">
          Money left on the table <span className="hdr-sub">(unclaimed employer match)</span>
        </div>
        <div className={`moneycard-value ${tone}`}>{headline}</div>
        <div className="moneycard-detail">{detail}</div>
      </div>
      <div className="moneycard-right">
        <div className="kv">
          <span>Your projected match</span>
          <span>{fmt(userMatch)}</span>
        </div>
        <div className="kv">
          <span>Max possible match</span>
          <span>{fmt(idealMatch)}</span>
        </div>
        <div className="kv">
          <span>Unused 402(g) room</span>
          <span>{fmt(unused402g)}</span>
        </div>
        <div className="kv">
          <span>Unused 415(c) room</span>
          <span>{fmt(unused415c)}</span>
        </div>
      </div>
    </div>
  );
}

function CapCard({ title, limit, hitDate, finalAmount, hint, mode }) {
  let state = "safe";
  if (hitDate) state = "hit";
  else if (limit && finalAmount / limit > 0.9) state = "near";

  let value;
  if (hitDate) {
    value = fmtDate(hitDate);
  } else if (mode === "matchStop") {
    value = "Not reached in 2026";
  } else {
    value = "Not reached in 2026";
  }

  return (
    <div className={`capcard ${state}`}>
      <div className="title">{title}</div>
      <div className="value">{value}</div>
      <div className="hint">{hint}</div>
      <div style={{ marginTop: 8, fontSize: 12 }}>
        Year-end projected: <b>{fmt(finalAmount)}</b>
        {limit ? <> / {fmt(limit)}</> : null}
      </div>
    </div>
  );
}

export default App;
