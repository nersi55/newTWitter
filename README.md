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

## Read Timeline Endpoint

This server exposes a simple read-only endpoint to fetch the top N posts from the authenticated home timeline.

- GET by path: `GET /readTM/:count` — example: `GET /readTM/3` returns the top 3 posts.
- GET by query: `GET /readTM?count=3` — same as above.
- Typo alias: `GET /reamTM/:count` — convenience alias for `readTM`.

Response (JSON) example:

```json
{
  "success": true,
  "count": 3,
  "tweets": [
    {
      "text": "...",
      "time": "2024-12-01T12:34:56.000Z",
      "author": "Fox News",
      "handle": "/FoxNews",
      "postUrl": "https://x.com/FoxNews/status/2011948651854045272",
      "replies": 12,
      "retweets": 34,
      "likes": 256
    }
  ]
}
```

Notes:
- Fields may be empty if Playwright cannot find the corresponding DOM elements for a given post (X markup changes frequently).
- If you get partial or zero results, run the server with `KEEP_ALIVE_MS` set (see below) so the automation has extra time to load dynamic content and the background browsing keeps the session active.

## Keep-alive / Human-like browsing

The automation can optionally keep the browser open after completing a request to simulate natural browsing behavior. Control the behavior with the `KEEP_ALIVE_MS` environment variable (milliseconds):

- Default: `KEEP_ALIVE_MS` = `60000` (1 minute). The server will start a background human-like browsing simulation and return responses immediately.
- Disable keep-alive: set `KEEP_ALIVE_MS=0` (the browser/context/page will be closed immediately after the request finishes).

Example run (keep browser alive 90s):

```bash
export KEEP_ALIVE_MS=90000
node app.js
curl http://127.0.0.1:3000/readTM/3
```

The background simulation performs randomized scrolling, hovering, and occasional intra-site clicks to emulate human behavior; it automatically closes the page/context/browser when finished.

---

## Development notes
- Main automation lives in `app.js` inside function `runXLoginAndPost(tweetContent)`.
- The server exposes `POST /tweet` which expects JSON `{ "tweetText": "your message" }`.
- The code includes logic to normalize cookies and to fall back to a minimal cookie set if Playwright's `addCookies()` fails.

## Reply endpoints

This version adds endpoints to post replies to specific X posts (statuses).

- `POST /reply` — JSON body. Accepts `postUrl` or `postId` (or `target`) and the reply text under the key `Replay-tweetText` (or `replyText`). Example body:

```json
{ "postId": "2011913540647477469", "Replay-tweetText": "Nice post!" }
```

- `POST /replay:<target>` — Path-style route. The `<target>` can be a full URL or numeric id. Example:

```
POST http://127.0.0.1:3000/replay:https://x.com/FoxNews/status/2011913540647477469
```

Example curl (POST /reply with postId):

```bash
curl -X POST http://127.0.0.1:3000/reply \
  -H "Content-Type: application/json" \
  -d '{"postId":"2011913540647477469","Replay-tweetText":"nice"}'
```

Example curl (path-style):

```bash
curl -X POST 'http://127.0.0.1:3000/replay:https://x.com/FoxNews/status/2011913540647477469' \
  -H "Content-Type: application/json" \
  -d '{"Replay-tweetText":"nice"}'
```

Notes:
- The server uses the same `cookies.json` session to authenticate; ensure it contains a valid logged-in X session.
- Reply UI on X changes frequently; if replies fail, the server will save a debug screenshot `reply_debug_*.png` in the project root for inspection.
- JSON must be valid (double quotes) and include `Content-Type: application/json` header.

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
