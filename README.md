# 401(k) Contribution Planner - 2026

A privacy-first, educational 401(k) contribution planning tool for Bayer employees. Project your contributions through 2026 and see exactly when you'll hit IRS limits.

**🔒 Privacy First:** Zero server tracking. All data stays in your browser or on your device.

---

## Quick Start

### 🌐 Use Online
Visit: [401k-planner](https://kunbayer.github.io/401k-planner/) (no sign-in required)

### 📥 Download Standalone (Offline)
For maximum privacy with **zero server access**:

1. **Download File:**
   - Click the **"📥 Download Standalone"** button in the app
   - Or [download directly (179 KB)](https://github.com/kunbayer/401k-planner/raw/main/dist/401k-planner-standalone.html)

2. **Save to Your Computer:**
   - Save as `401k-planner-standalone.html` in your Documents or Desktop

3. **Run Locally:**
   - Double-click the file to open in your browser
   - Works completely offline — no internet needed
   - Data stays 100% on your device

---

## Features

✅ **2026 IRS Limits Built In**
- 402(g) cap: $24,500 (employee deferrals)
- 415(c) cap: $72,000 (all contributions combined)
- 401(a)(17) cap: $360,000 (compensation limit)
- Catch-up contributions (age 50+, 60-63)

✅ **Bayer Plan Rules**
- Employer match: 100% on first 3% + 50% on next 4%
- 5% retirement contribution (non-elective)
- 1% additional contribution (job-dependent)
- Configurable match strategy
- Match continues past 402(g), stops only at 415(c)

✅ **Easy Data Entry**
- Paycheck gross, bonus amounts, YTD totals
- Percentage sliders for contribution rates
- Auto-save to browser (can export/import JSON)

✅ **Projections**
- See cap hit dates through year-end
- "Money on the table" — how much match you're leaving behind
- Separate employer 5% vs 1% tracking

✅ **Privacy & Control**
- No server tracking
- Export/Import your data
- Reset all settings
- Download standalone for offline use

---

## How to Use

### Step 1: Enter Pay Information
- **Last paycheck date:** Your most recent pay date
- **Gross paycheck:** Before taxes (from pay slip)
- **Bonus amounts:** STI/LTI estimates

### Step 2: Enter YTD Contributions
- Pull your pay slip or benefits statement
- Enter what you've deferred so far in 2026
- Enter employer contributions (5% + 1% if applicable)

### Step 3: Set Your Contribution Strategy
- **Pre-tax %:** Traditional 401(k) deferrals
- **Roth %:** Roth 401(k) deferrals
- **After-tax %:** After-tax contributions (optional)
- **Enable spillover:** Redirect excess to after-tax

### Step 4: Configure Match Strategy (Optional)
- Adjust tier 1/tier 2 match rates
- Adjust 5%/1% non-elective amounts
- See impact on projected cap dates

### Step 5: Review Projections
- See when you'll hit 402(g), 415(c) limits
- Check "money on the table" vs. ideal 7%
- Adjust rates to optimize

---

## Understanding the Caps

### 402(g) - Elective Deferral Cap ($24,500)
- **What counts:** Your pre-tax + Roth deferrals only
- **What doesn't:** Employer match, 5%, 1% contributions
- **When you hit it:** No more employee deferrals for rest of year
- **Spillover option:** Excess redirects to after-tax

### 415(c) - Total Additions Cap ($72,000)
- **What counts:** EVERYTHING — your deferrals + employer match + 5% + 1%
- **When you hit it:** No more contributions (yours or employer's) for rest of year
- **Usually the limiting factor:** In most scenarios

### 401(a)(17) - Compensation Cap ($360,000)
- **What it affects:** Match and non-elective calculations
- **High earners:** May have compensation above this cap not counted

---

## Privacy & Data Security

### 🔒 No Server Tracking
- ❌ Zero analytics or telemetry
- ❌ No logs of your financial data
- ❌ No cloud sync or backups
- ❌ No third-party tracking

### 💾 Your Data Storage Options
1. **Browser local storage** (default) — persists between sessions
2. **Standalone HTML file** — runs offline, data stays on device
3. **Export JSON** — download your data anytime
4. **Reset** — clear everything with one click

For complete details, see [PRIVACY.md](PRIVACY.md).

---

## Project Structure

```
401k-planner/
├── src/
│   ├── App.jsx           (Main React component with simulation logic)
│   ├── main.jsx          (React entry point)
│   └── styles.css        (All styling)
├── dist/
│   ├── index.html        (Web app HTML)
│   └── 401k-planner-standalone.html  (Self-contained offline version)
├── index.html            (Entry point for web)
├── vite.config.js        (Build configuration)
├── package.json          (Dependencies)
├── CLAUDE.md             (Architecture notes)
├── PRIVACY.md            (Privacy & data security)
└── README.md             (This file)
```

---

## Build & Development

### Prerequisites
- Node.js 16+
- npm or yarn

### Install & Run
```bash
npm install          # Install dependencies
npm run dev          # Start Vite dev server (http://localhost:5173)
npm run build        # Production build to dist/
npm run preview      # Preview built output
```

### Create Standalone
```bash
npm run build
bash create-standalone.sh  # Generates 401k-planner-standalone.html
```

---

## Disclaimer

**⚠️ Educational Use Only**

This tool is for educational and planning purposes only. It does not constitute financial, tax, or investment advice.

- Results are estimates based on 2026 IRS limits
- Actual calculations may vary based on plan rules
- Always verify with your benefits administrator
- Consult a qualified financial advisor before making changes

**Not Financial Advice.** Do your own research and speak with professionals.

---

## License

MIT License — See LICENSE file for details

---

## Contributing

Found a bug or have a feature request? [Open an issue on GitHub](https://github.com/kunbayer/401k-planner/issues)

---

## Support

### Questions About This App
- Check the **Help** modal (click "Help" button in app)
- See the "Privacy & Offline" tab for data storage info
- Review [PRIVACY.md](PRIVACY.md) for security details
- Check [CLAUDE.md](CLAUDE.md) for technical architecture

### 401(k) Questions
- Review your Bayer plan documents
- Contact your benefits administrator
- Speak with a financial advisor

---

**Last Updated:** May 2026  
**Repository:** [kunbayer/401k-planner](https://github.com/kunbayer/401k-planner)  
**IRS Limits:** 2026 Edition
