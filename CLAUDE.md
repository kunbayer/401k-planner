# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Vite dev server
- `npm run build` — production build
- `npm run preview` — preview built output

There is no test runner, linter, or type checker configured.

## Architecture

Single-page React 18 + Vite app that projects 2026 401(k) contributions for a Bayer-plan participant. The entire application lives in `src/App.jsx` (~830 lines); `main.jsx` is the standard React root and `styles.css` holds all CSS.

### The simulation core

`simulate({ events, regRates, bonusRates, ytd, spillOn, catchupAmount })` in `App.jsx` is the heart of the app. Everything else is input wiring or presentation. It walks an ordered list of pay events (regular biweekly paychecks + STI + LTIs from `buildEvents` / `buildFuturePayDates`) and for each event applies a strict order of operations that encodes IRS limits and Bayer plan rules:

1. **401(a)(17) compensation cap ($360,000)** — clamps eligible gross before any match/non-elective is computed.
2. **402(g) elective deferral cap ($24,500 + catch-up)** — pre-tax and Roth scaled proportionally if combined intent exceeds remaining room. When `spillOn` is true, the overflow is rerouted to after-tax (this is the "spillover" toggle in the UI).
3. **Match formula** — 100% on first 3% of elective rate + 50% on next 4% (max 5%), applied to eligible gross. Non-elective is a flat 6% (5% + 1%) of eligible gross. **Match continues past 402(g) and only stops at 415(c)** — this is the key Bayer-specific behavior the UI advertises.
4. **415(c) total additions cap ($72,000)** — if employee + employer total would exceed remaining room, contributions are cut in a specific priority: after-tax → non-elective → match → pre-tax → Roth. The first event where match is truncated to $0 is recorded as `dMatchStop`.

The four cap-hit dates (`d402g`, `d415c`, `dMatchStop`, `d401a17`) are captured as side effects during the walk and surfaced in the "Key Dates & Caps" section.

### Optimal-rate / "money on the table" calculation

`App` runs `simulate` twice inside its `useMemo`: once with the user's rates (`userSim`), and once with an `idealPct` derived from remaining 402(g) room and remaining gross — capped at 7% because that's the rate that captures the full Bayer match. The `matchGap` between the two simulations drives the `MoneyOnTableCard` headline. If you change match formula constants, update both the simulation and the 7% threshold logic that computes `idealRate`.

### IRS and plan constants

Hard-coded at the top of `App.jsx`: `LIMIT_402G`, `LIMIT_415C`, `LIMIT_401A17`, `CATCHUP_50`, `CATCHUP_60_63`, `YEAR_END`. These are 2026 values; updating the year requires changing all of them plus the `YEAR_END` date and the UI strings.

### Persistence

State persists to `localStorage` under key `bayer401kPlanner.v2` via a `useEffect` that watches every input. `loadSaved()` merges saved state over `DEFAULTS` so adding a new field to `DEFAULTS` is backwards-compatible. JSON import/export is also wired up; the import path has a legacy fallback (`obj.annualBase / 26 → paycheckGross`) for older exports.
