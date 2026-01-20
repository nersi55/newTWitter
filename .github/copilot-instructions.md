# Copilot instructions — Playwright Tweet API Server

Short: Single-file Node.js Express server (`app.js`) that uses Playwright to control Chrome and perform three primary tasks: post tweets, read the home timeline, and reply to posts.

- Key functions: `runXLoginAndPost(tweetContent)`, `runReadTimeline(count)`, `runReplyToPost(target, replyText)`, and `simulateHumanBrowsing(page, ms)`.

- Data flow (explicit): HTTP request → read/normalize `cookies.json` → launch browser (system Chrome) → authenticate via cookies → perform action → optionally continue human-like browsing (background IIFE) if `KEEP_ALIVE_MS > 0`.

- Environment (must know):
  - Node 18+ recommended (uses global `fetch` fallback to `node-fetch`).
  - Required envs: `TELEGRAM_BOT_TOKEN` (for error reporting), optionally `TELEGRAM_CHAT_ID` or `TELEGRAM_CHAT_USERNAME`.
  - `PORT` (default 3000), `KEEP_ALIVE_MS` (default 60000), `HEADLESS` behavior is controlled in code (default uses system Chrome with headful mode in repo).

- Cookie behavior (important):
  - `test_add_cookies.js` demonstrates normalization rules used by `app.js`.
  - Maps `expiry` / `expirationDate` → `expires` (integer seconds); normalizes `sameSite` to `Strict|Lax|None`; **requires** `url` or `domain` (+ `path`) for Playwright `addCookies()`.
  - If `addCookies()` fails, code falls back to a minimal cookie set (name/value/domain/path/url) or proceeds without cookies.

- Endpoints & inputs (explicit examples):
  - POST `/tweet` JSON: `{ "tweetText":"Your message" }` → calls `runXLoginAndPost`.
  - GET `/readTM/:count` or `/readTM?count=N` → returns top N timeline posts.
  - POST `/reply` JSON: `{ "postUrl":"https://x.com/.." , "Replay-tweetText":"Nice" }` (note: code accepts `Replay-tweetText` and several aliases).
  - POST path-style: `POST /replay:<target>` supports full URL or numeric id.

- Debugging conventions:
  - Errors call `reportFailure()` which attempts Telegram notification and records stack snippets.
  - Diagnostic screenshots: `error_screenshot_*.png` and `reply_debug_*.png` saved to project root.
  - Use `node test_add_cookies.js` to validate cookie exports; use `node get_telegram_chat_id.js` with `TELEGRAM_BOT_TOKEN` to discover numeric chat ids.

- Project patterns to follow when editing/adding code:
  - Keep Playwright flows isolated in their own `run*` functions and return plain objects `{ success:true|false, message }`.
  - Prefer non-blocking background tasks via async IIFEs for `KEEP_ALIVE_MS`; do not close browser from main path when keep-alive is enabled.
  - Use `data-testid` selectors first (e.g., `tweetTextarea_0`, `tweetButtonInline`); fall back to aria/role queries and keyboard fallbacks.
  - Always try to capture a screenshot and call `reportFailure()` on unexpected errors for faster triage.

- Quick commands:
  - Start: `node app.js`
  - Validate cookies: `node test_add_cookies.js`
  - Discover Telegram chat id: `TELEGRAM_BOT_TOKEN=<token> node get_telegram_chat_id.js`
  - Install Playwright browsers (optional): `npx playwright install --with-deps`

Notes & constraints:
  - There is no `package.json` in the repo; add one if you want `npm start` scripts and deterministic deps.
  - Do NOT commit `cookies.json`, `.env`, or Telegram tokens / chat ids to source control.

If anything in this summary is unclear or you want more examples (e.g., a small patch to add a new route or tests), tell me which area to expand and I'll iterate. ✅