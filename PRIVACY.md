# Privacy & Data Security

## Summary
**🔒 No data is ever sent to any server.** All your 401(k) contribution data stays on your device in your browser's local storage.

---

## How Your Data is Stored

### Browser Local Storage (Default)
- ✅ Data stored in your **browser only** — not on any server
- ✅ Persists between sessions for convenience
- ✅ Device-specific & browser-specific (different browsers ≠ shared data)
- ✅ You control it: Export, Import, or Reset at any time

### Standalone HTML File (Maximum Privacy)
- ✅ Download the standalone HTML and run **completely offline**
- ✅ Zero server access — no network connections at all
- ✅ Works in any browser without installation
- ✅ Data still in browser local storage on your device only
- ✅ Perfect for sensitive financial data

---

## Standalone Version: Quick Start

### Download & Use
1. **Download:** Click the **"📥 Download Standalone"** button in the app toolbar
2. **Save:** Save `401k-planner-standalone.html` to your computer
3. **Run:** Double-click the file to open it in any browser
4. **Use:** Works exactly like the web version — no internet needed

### Download Direct Link
[401k-planner-standalone.html](https://github.com/kunbayer/401k-planner/raw/main/dist/401k-planner-standalone.html) (179 KB)

Or via command line:
```bash
curl -L https://github.com/kunbayer/401k-planner/raw/main/dist/401k-planner-standalone.html \
  -o 401k-planner-standalone.html
```

---

## What Data Is Collected

### 📊 What We DON'T Track
- ❌ No analytics or telemetry
- ❌ No cookies (except essential browser local storage)
- ❌ No logs of your projections or inputs
- ❌ No server backups of your data
- ❌ No third-party tracking pixels

### 💾 What You Enter (Stays on Your Device)
- Your pay schedule and gross income
- STI/LTI bonus amounts
- Year-to-date contributions
- Selected contribution percentages
- Match strategy preferences

---

## Full Data Control

### Export Your Data
- Click **"Export"** button → Downloads JSON file with all your inputs
- Use this to:
  - Back up your data
  - Transfer between browsers
  - Use in a spreadsheet
  - Verify what's being stored

### Import Your Data
- Click **"Import"** button → Upload previously exported JSON
- Restores all your settings in seconds

### Reset All Data
- Click **"Reset"** button → Clears browser local storage completely
- Starts fresh with default settings

### Delete via Browser Settings
Manual deletion through browser settings:
- **Chrome/Edge:** Settings → Privacy → Clear browsing data → Cookies/Local storage
- **Firefox:** Settings → Privacy → Cookies and Site Data → Remove
- **Safari:** Settings → Privacy → Manage Website Data → Delete

---

## Code Transparency

### Open Source
This project is **100% open source** on GitHub:
- Repository: [kunbayer/401k-planner](https://github.com/kunbayer/401k-planner)
- License: MIT (or as specified in repository)
- Review the code yourself — it's publicly available

### No Network Calls
You can verify in browser Dev Tools:
1. Open app → Press F12 (Developer Tools)
2. Go to **Network** tab
3. Use the app normally
4. **Result:** No external API calls, only local computation

---

## Security Best Practices

### When Using Browser Version
✅ **Safe to use on shared computers** — data is browser-specific
✅ **Use incognito/private mode** if on a public computer — data won't persist
✅ **Verify HTTPS** when accessing the web app
✅ **Export data before clearing browser** if you want to keep it

### When Using Standalone Version  
✅ **Store in a safe location** (Documents, not shared folders)
✅ **Keep your computer updated** for security
✅ **Don't share the file** unless you want someone to see your data

---

## Why This Matters

Your 401(k) financial data is **personal and sensitive**. You should have:
- 🔒 **Privacy** — no tracking or surveillance
- 🎮 **Control** — ability to export/import/delete
- 📖 **Transparency** — see the code, know what's happening
- 🚀 **Offline option** — zero server dependency

This app is designed with all four principles in mind.

---

## Questions?

### For Privacy Concerns
- Review the [source code](https://github.com/kunbayer/401k-planner)
- Use the standalone version for zero server access
- Check the **Privacy & Offline** tab in the Help modal
- Open an issue on GitHub with questions

### For 401(k) Financial Questions
- Consult your Bayer plan documents
- Contact your benefits administrator
- Speak with a financial advisor (this tool is educational only)

---

**Last Updated:** May 2026  
**App Version:** 2026  
**IRS Limits:** 2026 (will need update for 2027)
