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

function simulate({ events, regRates, bonusRates, ytd, spillOn, catchupAmount }) {
  const limit402g = LIMIT_402G + (catchupAmount || 0);

  let cumPreRoth = ytd.preTax + ytd.roth;
  let cumAfterTax = ytd.afterTax;
  let cumMatch = ytd.match;
  let cumNonElective = ytd.nonElective;
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
    const matchRate =
      Math.min(intendedElectiveRate, 0.03) * 1.0 + Math.max(0, Math.min(intendedElectiveRate - 0.03, 0.04)) * 0.5;
    let match = eligibleGross * matchRate;

    let nonElective = eligibleGross * 0.06;

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
      nonElective,
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
      nonElective: a.nonElective + r.nonElective,
    }),
    { gross: 0, preTax: 0, roth: 0, afterTax: 0, match: 0, nonElective: 0 }
  );

  return {
    rows,
    caps,
    totals,
    finalState: { cumPreRoth, cumAfterTax, cumMatch, cumNonElective, cumComp, cum415, limit402g },
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
  ytd: { preTax: 0, roth: 0, afterTax: 0, match: 0, nonElective: 0, comp: 0 },
  regRates: { preTax: 6, roth: 0, afterTax: 0 },
  bonusRates: { preTax: 6, roth: 0, afterTax: 0 },
  spillOn: true,
  catchup: "none",
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
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    saveState({ lastPayDate, paycheckGross, sti, ltis, ytd, regRates, bonusRates, spillOn, catchup });
    setSavedAt(new Date());
  }, [lastPayDate, paycheckGross, sti, ltis, ytd, regRates, bonusRates, spillOn, catchup]);

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
  };

  const exportJson = () => {
    const state = { lastPayDate, paycheckGross, sti, ltis, ytd, regRates, bonusRates, spillOn, catchup };
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
        if (obj.ytd) setYtd(obj.ytd);
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
      nonElective: Number(ytd.nonElective) || 0,
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
    });

    const maxMatchSim = simulate({
      events,
      regRates: { preTax: 7, roth: 0, afterTax: 0 },
      bonusRates: { preTax: 7, roth: 0, afterTax: 0 },
      ytd: ytdNum,
      spillOn: true,
      catchupAmount,
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
  }, [lastPayDate, paycheckGross, sti, ltis, ytd, regRates, bonusRates, spillOn, catchupAmount]);

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
            Bayer plan: 100% match on first 3%, 50% on next 4%, plus 5% + 1% non-elective. Match continues past
            402(g) and stops only at 415(c).
          </div>
        </div>
        <div className="flex" style={{ gap: 6, flexWrap: "wrap" }}>
          <span className="pill" title="Inputs auto-saved to this browser">
            {savedAt ? `Auto-saved ${savedAt.toLocaleTimeString()}` : "Saved"}
          </span>
          <button onClick={exportJson} title="Download inputs as JSON">
            Export
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
        </div>
      </div>

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
            label="YTD company 5% + 1%"
            value={ytd.nonElective}
            onChange={(v) => setYtd({ ...ytd, nonElective: v })}
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
        <h2>
          Contribution Rates - Regular Paychecks <span className="hdr-sub">total: {regPctSum.toFixed(1)}%</span>
        </h2>
        <div className="grid grid-3">
          <NumInput label="Pre-tax %" value={regRates.preTax} onChange={(v) => setRegRates({ ...regRates, preTax: v })} step="0.5" />
          <NumInput label="Roth %" value={regRates.roth} onChange={(v) => setRegRates({ ...regRates, roth: v })} step="0.5" />
          <NumInput
            label="After-tax %"
            value={regRates.afterTax}
            onChange={(v) => setRegRates({ ...regRates, afterTax: v })}
            step="0.5"
          />
        </div>

        <div className="divider" />
        <h2>
          Contribution Rates - Bonuses (STI + all LTIs) <span className="hdr-sub">total: {bonusPctSum.toFixed(1)}%</span>
        </h2>
        <div className="grid grid-3">
          <NumInput
            label="Pre-tax %"
            value={bonusRates.preTax}
            onChange={(v) => setBonusRates({ ...bonusRates, preTax: v })}
            step="0.5"
          />
          <NumInput label="Roth %" value={bonusRates.roth} onChange={(v) => setBonusRates({ ...bonusRates, roth: v })} step="0.5" />
          <NumInput
            label="After-tax %"
            value={bonusRates.afterTax}
            onChange={(v) => setBonusRates({ ...bonusRates, afterTax: v })}
            step="0.5"
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
            <span>Year-end company 6%</span>
            <span>{fmt(sim.finalState.cumNonElective)}</span>
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
                <th>ER 6%</th>
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
                  <td>{fmt2(r.nonElective)}</td>
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
                <td>{fmt(sim.totals.nonElective)}</td>
                <td colSpan={3}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginTop: 16 }}>
        Estimator only. Verify with plan administrator. 2026 limits: 402(g) $24,500 / 415(c) $72,000 / 401(a)(17)
        $360,000. Source: IRS.gov COLA table.
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
