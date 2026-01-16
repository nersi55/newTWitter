# Playwright Tweet API Server

A small Node.js Express server that accepts POST requests to publish a tweet-like message to X (formerly Twitter) using Playwright automation.

This project uses Playwright to control a Chromium/Chrome browser, loads cookies from `cookies.json`, and posts the provided text to the X home feed.

---

**Contents**
- **Project**: automation server that posts tweets via Playwright
- **Primary file**: `app.js`
- **Cookies**: `cookies.json`
- **Helper**: `test_add_cookies.js` (verifies cookie normalization)

---

## Requirements
- macOS (tested here)
- Node.js (v18+ recommended; v24 observed in logs)
- npm
- Google Chrome installed at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (recommended fallback)

Optional:
- Playwright browsers (installed via `npx playwright install`)

---

## Install
1. Clone the repo or copy files into a folder.
2. Install dependencies:

```bash
cd /Users/nersibayat/Desktop/Programing/VScode/twww1/TwLatest
npm install
```

3. Install Playwright browsers (if you want to use the bundled browsers):

```bash
npx playwright install --with-deps
```

Note: the code prefers launching the system Chrome executable (path above) to avoid compatibility issues with bundled Chromium on some macOS setups.

---

## Configuration
- `cookies.json` — place exported cookies for `x.com` in this file. The server will attempt to normalize cookies (map `expirationDate`/`expiry` → `expires`, fix `sameSite` to `Strict|Lax|None`) before adding them to the Playwright context.
- If you do not provide `cookies.json` or it cannot be used, the automation will attempt to continue without cookies.

Cookies format notes:
- Playwright expects cookie objects with fields like `name`, `value`, and either `url` or `domain` + `path`.
- `sameSite` must be one of `Strict`, `Lax`, or `None`. The server attempts to normalize common values (e.g., `no_restriction` → `None`).

---

## Running
Start the API server:

```bash
node app.js
```

By default the server listens on port `3000` (override with `PORT` env var).

Example POST to publish a tweet:

```bash
curl -X POST http://localhost:3000/tweet \
  -H "Content-Type: application/json" \
  -d '{"tweetText":"Hello from Playwright Tweet API"}'
```

Successful response example:

```json
{ "success": true, "message": "Tweet posted successfully (or attempt initiated)." }
```

---

## Test helpers
- `test_add_cookies.js` — small script that normalizes `cookies.json` and attempts to `context.addCookies()` with system Chrome to verify cookies are acceptable.

Run it with:

```bash
node test_add_cookies.js
```

---

## Troubleshooting
- Playwright Chromium segmentation faults on macOS (SIGSEGV).
  - Cause: bundled Chromium binary may be incompatible with your macOS or CPU architecture.
  - Quick fixes:
    - Use the system Chrome by ensuring Chrome is installed and letting `app.js` launch it (it already prefers `/Applications/Google Chrome.app/...`).
    - Clear Playwright cache and reinstall browsers:

```bash
rm -rf ~/Library/Caches/ms-playwright
npx playwright install --with-deps
```

    - Reinstall or update the `playwright` package to match your OS: `npm i playwright@latest`.
    - Try launching Chromium with safe flags: `--no-sandbox --disable-gpu --use-gl=swiftshader`.

- JSON parse errors when POSTing: ensure you send valid JSON bodies and the header `Content-Type: application/json`.

- Cookie errors (`sameSite` or missing fields): The server normalizes common variants but if your cookie export uses non-standard fields, adjust `cookies.json` to include `name`, `value`, and `domain`/`path` or `url` and `sameSite` set to `Strict|Lax|None`.

- Port in use error: if `EADDRINUSE` occurs on port 3000, find and kill the process using that port:

```bash
lsof -i :3000
kill <PID>
```

---

## Development notes
- Main automation lives in `app.js` inside function `runXLoginAndPost(tweetContent)`.
- The server exposes `POST /tweet` which expects JSON `{ "tweetText": "your message" }`.
- The code includes logic to normalize cookies and to fall back to a minimal cookie set if Playwright's `addCookies()` fails.

---

## Files
- `app.js` — main server and Playwright automation
- `cookies.json` — cookie store used by the automation (not committed with secrets)
- `test_add_cookies.js` — helper to validate cookie normalization

---

## License
MIT

---

If you want, I can also add example `.env` handling, a stronger README section on writing safe cookie exports, or create a small `package.json` script to start the server.
