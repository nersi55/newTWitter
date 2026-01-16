// 1. Import necessary modules
// 1. وارد کردن ماژول‌های ضروری
//https://g.co/gemini/share/13b9a7fce227
// Load .env if present (optional; install dotenv to use)
try { require('dotenv').config(); } catch (e) { /* dotenv not installed or .env not present */ }
const { chromium } = require('playwright');
const path = require('path');
const fsp = require('fs').promises; // Use promise-based fs for async operations
const express = require('express');
const os = require('os');

// --- Telegram helper ---
// Configure via env vars:
// TELEGRAM_BOT_TOKEN (required) and TELEGRAM_CHAT_ID (optional - numeric chat id). If TELEGRAM_CHAT_ID is not set,
// you can set TELEGRAM_CHAT_USERNAME to a username like '@nersi55' but note bots cannot always message users by username.
// Preferred: set TELEGRAM_CHAT_ID to the numeric chat id after the user starts the bot.
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || null;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || null;
const TELEGRAM_CHAT_USERNAME = process.env.TELEGRAM_CHAT_USERNAME || null;

async function sendTelegramMessage(target, text) {
  try {
    if (!TELEGRAM_BOT_TOKEN) {
      console.log('Telegram token not set; skipping sendTelegramMessage.');
      return;
    }
    const api = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const body = { chat_id: target, text };
    // use global fetch (node 18+) or fallback to require('node-fetch')
    const fetchFn = (typeof fetch === 'function') ? fetch : (await import('node-fetch')).default;
    const res = await fetchFn(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('Telegram send failed:', res.status, txt);
    }
  } catch (e) {
    console.error('sendTelegramMessage error:', e && e.message ? e.message : e);
  }
}

async function reportFailure(err, context) {
  try {
    const host = os.hostname();
    const time = new Date().toISOString();
    const errMsg = err && err.message ? err.message : String(err);
    const stack = err && err.stack ? '\n' + err.stack.split('\n').slice(0,5).join('\n') : '';
    const text = `*Failure on* ${host}\n*Context:* ${context}\n*Time:* ${time}\n*Error:* ${errMsg}${stack}`;

    // Try numeric chat id first, then username if provided
    if (TELEGRAM_CHAT_ID) {
      sendTelegramMessage(TELEGRAM_CHAT_ID, text).catch(() => {});
    } else if (TELEGRAM_CHAT_USERNAME) {
      sendTelegramMessage(TELEGRAM_CHAT_USERNAME, text).catch(() => {});
    } else {
      // Attempt to discover recent chat from getUpdates (requires bot to have received a message from the user)
      if (!TELEGRAM_BOT_TOKEN) return;
      try {
        const updApi = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`;
        const fetchFn = (typeof fetch === 'function') ? fetch : (await import('node-fetch')).default;
        const r = await fetchFn(updApi);
        const j = await r.json().catch(() => ({}));
        if (j && Array.isArray(j.result) && j.result.length) {
          // find first message from a chat whose username matches TELEGRAM_CHAT_USERNAME if set
          let chatId = null;
          for (let u of j.result.reverse()) {
            const msg = u.message || u.channel_post || u.edited_message;
            if (!msg || !msg.from) continue;
            if (TELEGRAM_CHAT_USERNAME) {
              if ((msg.from.username && ('@' + msg.from.username) === TELEGRAM_CHAT_USERNAME) || (msg.chat && msg.chat.username && ('@' + msg.chat.username) === TELEGRAM_CHAT_USERNAME)) {
                chatId = msg.chat && msg.chat.id ? msg.chat.id : (msg.from && msg.from.id ? msg.from.id : null);
                break;
              }
            } else {
              chatId = msg.chat && msg.chat.id ? msg.chat.id : (msg.from && msg.from.id ? msg.from.id : null);
              if (chatId) break;
            }
          }
          if (chatId) sendTelegramMessage(chatId, text).catch(() => {});
        }
      } catch (e) {
        console.error('Failed to auto-discover Telegram chat id:', e && e.message ? e.message : e);
      }
    }
  } catch (e) {
    console.error('reportFailure failed:', e && e.message ? e.message : e);
  }
}

// Helper function for random delays
// تابع کمکی برای ایجاد تاخیر تصادفی
function randomDelay(min, max) {
  return Math.random() * (max - min) + min;
}

// List of common User Agents
// لیست User Agent های رایج
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/115.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/114.0.1823.82',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Version/16.5.1 Safari/605.1.15', // Safari
];


// -----------------------------------------------------------------------------
// Refactored Playwright Logic (V3.2: Fix type Timeout)
// منطق بازسازی شده پلی‌رایت (نسخه ۳.۲: رفع خطای Timeout در type)
// -----------------------------------------------------------------------------
async function runXLoginAndPost(tweetContent) {
  let browser;
  let context;
  let page;

  // Validate tweet content
  // اعتبارسنجی محتوای توییت
  if (!tweetContent || tweetContent.trim() === '') {
    console.error("Error: Tweet text received by function is empty.");
    return { success: false, message: "Tweet text cannot be empty." };
  }

  // Select a random User Agent
  // انتخاب یک User Agent تصادفی
  const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
  console.log(`Using User Agent: ${randomUserAgent}`);

  try {
    console.log(`\n--- Starting Playwright for tweet: "${tweetContent.substring(0, 30)}..." ---`);

    // --- Launch Browser (Headless) ---
    // --- راه‌اندازی مرورگر (Headless) ---
    console.log("Launching browser (headless)...");
    const browser = await require('playwright').chromium.launch({
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: false,
      args: ['--no-sandbox','--disable-gpu']
    });

    // --- Create Browser Context with Random User Agent ---
    // --- ایجاد زمینه مرورگر با User Agent تصادفی ---
    context = await browser.newContext({
      userAgent: randomUserAgent,
      locale: 'en-US'
    });

    // --- Load and Set Cookies ---
    // --- بارگذاری و تنظیم کوکی‌ها ---
    console.log("Loading cookies from cookies.json...");
    const cookiesPath = path.join(__dirname, 'cookies.json');
    try {
      const cookiesString = await fsp.readFile(cookiesPath, 'utf-8');
      let cookies = JSON.parse(cookiesString);

      // Normalize cookies to match Playwright expectations.
      // - Ensure `sameSite` is one of 'Strict' | 'Lax' | 'None' (Playwright is case-sensitive)
      // - Normalize `expiry` -> `expires` (number, seconds)
      // - If fields are invalid, remove them so addCookies doesn't fail.
      const normalizeSameSite = (v) => {
        if (!v && v !== 0) return undefined;
        const s = String(v).toLowerCase();
        if (s === 'strict') return 'Strict';
        if (s === 'lax') return 'Lax';
        if (s === 'none' || s === 'no_restriction') return 'None';
        // numeric values (0,1,2) sometimes appear in exports; map best-effort
        if (s === '0') return 'None';
        if (s === '1') return 'Lax';
        if (s === '2') return 'Strict';
        return undefined;
      };

      const normalized = (Array.isArray(cookies) ? cookies : []).map((c) => {
        const cc = Object.assign({}, c);
        // support `expiry`, `expirationDate` and `expires` fields
        if (cc.expiry && !cc.expires) {
          const num = Number(cc.expiry);
          if (!Number.isNaN(num)) cc.expires = Math.floor(num);
          delete cc.expiry;
        }
        if (cc.expirationDate && !cc.expires) {
          const num = Number(cc.expirationDate);
          if (!Number.isNaN(num)) cc.expires = Math.floor(num);
          delete cc.expirationDate;
        }
        if (cc.expires) {
          const num = Number(cc.expires);
          if (Number.isFinite(num)) cc.expires = Math.floor(num);
          else delete cc.expires;
        }

        const ss = normalizeSameSite(cc.sameSite || cc.SameSite || cc.same_site);
        if (ss) cc.sameSite = ss;
        else delete cc.sameSite;

        // Playwright requires either `url` or `domain`+`path`. If neither present, skip cookie.
        if (!cc.url && !cc.domain) return null;
        return cc;
      }).filter(Boolean);

      try {
        await context.addCookies(normalized);
        console.log(`Cookies added (${normalized.length}).`);
      } catch (addErr) {
        console.error('Error adding cookies (first attempt):', addErr && (addErr.message || addErr));
        try { reportFailure(addErr, 'addCookies - first attempt (runXLoginAndPost)'); } catch (e) {}
        // Fallback: try adding cookies with only minimal fields (name, value, domain/path)
        const minimal = normalized.map((c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path || '/', url: c.url })).filter(Boolean);
        try {
          await context.addCookies(minimal);
          console.log(`Cookies added (fallback, ${minimal.length}).`);
        } catch (fallbackErr) {
          console.error('Fallback cookie add also failed:', fallbackErr && (fallbackErr.message || fallbackErr));
          try { reportFailure(fallbackErr, 'addCookies - fallback (runXLoginAndPost)'); } catch (e) {}
          // Continue without cookies rather than throwing to allow the rest of the flow to run
          console.log('Continuing without cookies.');
        }
      }
    } catch (err) {
      console.error(`Error reading/parsing cookies file (${cookiesPath}):`, err && err.message ? err.message : err);
      try { reportFailure(err, `Error reading/parsing cookies file (${cookiesPath})`); } catch (e) {}
      console.log('Proceeding without cookies.');
    }

    // --- Open New Page ---
    // --- باز کردن صفحه جدید ---
    console.log("Opening new page...");
    page = await context.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });

    // --- Navigate to Home Feed ---
    // --- پیمایش به فید اصلی ---
    console.log("Navigating to X home feed...");
    await page.goto('https://x.com/home', { waitUntil: 'load', timeout: 60000 });
    console.log("Home feed navigation attempted (waited for 'load' event).");

    // --- Add extra wait for a key element ---
    // --- اضافه کردن انتظار بیشتر برای یک المان کلیدی ---
    const tweetInputSelector = 'div[data-testid="tweetTextarea_0"]';
    console.log(`Waiting for key element (${tweetInputSelector}) to be present after navigation...`);
    await page.waitForSelector(tweetInputSelector, { state: 'attached', timeout: 30000 });
    console.log("Key element found. Proceeding...");

    await page.waitForTimeout(randomDelay(1500, 3000));

    // --- Simulate Random Scrolling ---
    // --- شبیه‌سازی اسکرول تصادفی ---
    console.log("Simulating random scroll...");
    const scrollAmount = randomDelay(300, 800);
    await page.mouse.wheel(0, scrollAmount);
    console.log(`Scrolled down by ~${Math.round(scrollAmount)} pixels.`);
    await page.waitForTimeout(randomDelay(1000, 2500));

    // --- Use Home Feed Compose Box ---
    // --- استفاده از کادر نوشتن توییت در فید اصلی ---
    console.log("Waiting for tweet input area to be visible...");
    const tweetTextArea = page.locator(tweetInputSelector);
    await tweetTextArea.waitFor({ state: 'visible', timeout: 45000 });
    console.log("Clicking tweet input area...");
    await tweetTextArea.click(); // Click to focus initially | کلیک برای فوکوس اولیه
    await page.waitForTimeout(randomDelay(500, 1200));

    // --- Simulate Typing ---
    // --- شبیه‌سازی تایپ ---
    console.log("Ensuring focus on text area...");
    await tweetTextArea.focus(); // Explicitly focus before typing | فوکوس صریح قبل از تایپ
    await page.waitForTimeout(randomDelay(200, 500)); // Small delay after focus | تاخیر کوچک بعد از فوکوس

    console.log("Entering tweet text (simulating typing)...");
    const typingDelay = randomDelay(70, 190);
    // Increased timeout for the type operation itself to 90 seconds
    // مهلت زمانی برای خود عملیات تایپ به ۹۰ ثانیه افزایش یافت
    await tweetTextArea.type(tweetContent, { delay: typingDelay, timeout: 90000 });
    console.log("Tweet text entered.");
    await page.waitForTimeout(randomDelay(1000, 2500)); // Pause after typing | تاخیر تصادفی بعد از تایپ

    // --- Locate and Click Post Button ---
    // --- مکان‌یابی و کلیک دکمه ارسال ---
    console.log("Locating Post button...");
    const postButton = page.getByTestId('tweetButtonInline');
    console.log("Waiting for Post button (inline) to be visible...");
    await postButton.waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(randomDelay(800, 1800));
    console.log("Clicking Post button (inline) with force option...");
    await postButton.click({ force: true });

    // Optional second click (kept)
    // کلیک دوم اختیاری (حفظ شد)
    try {
      console.log("Attempting optional second click...");
      await page.waitForTimeout(randomDelay(700, 1500));
      await page.getByTestId('tweetButtonInline').click({ timeout: 3000, force: true });
       console.log("Second click successful (or attempted).");
    } catch (error) {
      console.log("Second click skipped or failed (likely already posted).");
    }

    console.log("Tweet posted (or attempt initiated). Waiting...");
    await page.waitForTimeout(randomDelay(7000, 10000));

    const result = { success: true, message: "Tweet posted successfully (or attempt initiated)." };

    // Keep browsing after posting if KEEP_ALIVE_MS > 0 (background)
    const keepAliveMs = process.env.KEEP_ALIVE_MS ? Number(process.env.KEEP_ALIVE_MS) : 60000;
    if (keepAliveMs > 0) {
      (async () => {
        try {
          await simulateHumanBrowsing(page, keepAliveMs);
        } catch (e) {
          console.error('Background browsing error (post):', e && e.message ? e.message : e);
        } finally {
          try { await page.close(); } catch (e) {}
          try { await context.close(); } catch (e) {}
          try { await browser.close(); } catch (e) {}
        }
      })();
      return result;
    }

    console.log("--- Playwright task completed successfully. ---");
    return result;

  } catch (error) {
    console.error("\nAn error occurred during the Playwright process:", error);
    try { reportFailure(error, 'runXLoginAndPost'); } catch (e) { /* ignore */ }
    if (page) {
      const screenshotPath = path.join(__dirname, `error_screenshot_${Date.now()}.png`);
      try {
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`Screenshot saved to: ${screenshotPath}`);
      } catch (ssError) {
        console.error("Failed to save screenshot:", ssError);
      }
    }
    return { success: false, message: `Playwright error during automation: ${error.name} - ${error.message}` };

  } finally {
    // --- Cleanup ---
    // --- پاکسازی ---
     if (page) {
        try {
            await page.close();
            console.log("Page closed.");
        } catch (closeErr) {
            console.error("Error closing page:", closeErr);
        }
    }
    if (context) {
      try {
          await context.close();
          console.log("Browser context closed.");
      } catch (closeErr) {
          console.error("Error closing context:", closeErr);
      }
    }
    if (browser) {
      console.log("Closing browser...");
      try {
          await browser.close();
          console.log("Browser closed.");
      } catch (closeErr) {
          console.error("Error closing browser:", closeErr);
      }
    }
    console.log("--- Playwright cleanup finished. ---");
  }
}

// Read top N posts from the home timeline and return structured info
async function runReadTimeline(count) {
  let browser;
  let context;
  let page;
  const n = Number(count) || 1;
  if (n <= 0) return { success: false, message: 'Count must be >= 1' };

  const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

  // How long to keep browsing after completing primary task (ms).
  // Set via env `KEEP_ALIVE_MS`. If 0 or unset, default to 60000 (1 minute).
  const keepAliveMs = process.env.KEEP_ALIVE_MS ? Number(process.env.KEEP_ALIVE_MS) : 60000;

  try {
    browser = await chromium.launch({
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: false,
      args: ['--no-sandbox','--disable-gpu']
    });

    context = await browser.newContext({ userAgent: randomUserAgent, locale: 'en-US' });

    // Load cookies (reuse normalization logic from above)
    const cookiesPath = path.join(__dirname, 'cookies.json');
    try {
      const cookiesString = await fsp.readFile(cookiesPath, 'utf-8');
      let cookies = JSON.parse(cookiesString);
      const normalizeSameSite = (v) => {
        if (!v && v !== 0) return undefined;
        const s = String(v).toLowerCase();
        if (s === 'strict') return 'Strict';
        if (s === 'lax') return 'Lax';
        if (s === 'none' || s === 'no_restriction') return 'None';
        if (s === '0') return 'None';
        if (s === '1') return 'Lax';
        if (s === '2') return 'Strict';
        return undefined;
      };

      const normalized = (Array.isArray(cookies) ? cookies : []).map((c) => {
        const cc = Object.assign({}, c);
        if (cc.expiry && !cc.expires) {
          const num = Number(cc.expiry);
          if (!Number.isNaN(num)) cc.expires = Math.floor(num);
          delete cc.expiry;
        }
        if (cc.expirationDate && !cc.expires) {
          const num = Number(cc.expirationDate);
          if (!Number.isNaN(num)) cc.expires = Math.floor(num);
          delete cc.expirationDate;
        }
        if (cc.expires) {
          const num = Number(cc.expires);
          if (Number.isFinite(num)) cc.expires = Math.floor(num);
          else delete cc.expires;
        }
        const ss = normalizeSameSite(cc.sameSite || cc.SameSite || cc.same_site);
        if (ss) cc.sameSite = ss;
        else delete cc.sameSite;
        if (!cc.url && !cc.domain) return null;
        return cc;
      }).filter(Boolean);

      try {
        await context.addCookies(normalized);
      } catch (addErr) {
        const minimal = normalized.map((c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path || '/', url: c.url })).filter(Boolean);
        try {
          await context.addCookies(minimal);
        } catch (e) {
          try { reportFailure(e, 'addCookies - fallback (runReadTimeline)'); } catch (r) {}
          // continue without cookies
        }
      }
    } catch (err) {
      try { reportFailure(err, `Error reading/parsing cookies file (${cookiesPath}) - runReadTimeline`); } catch (r) {}
      // ignore - proceed without cookies
    }

    page = await context.newPage();
    await page.setViewportSize({ width: 1200, height: 900 });

    await page.goto('https://x.com/home', { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(1500 + Math.random() * 1500);

    // Scroll a little to ensure feed items load
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(1000 + Math.random() * 1000);

    // Extract top N articles with URL and numeric metrics
    const tweets = await page.$$eval('article', (articles, limit) => {
      const results = [];
      const parseNumber = (s) => {
        if (!s) return 0;
        // sometimes innerText or aria-label contains words; extract first number
        const cleaned = String(s).replace(/[,\s]+/g, '');
        const m = cleaned.match(/\d+/);
        return m ? Number(m[0]) : 0;
      };

      for (let i = 0; i < articles.length && results.length < limit; i++) {
        const a = articles[i];
        const textEl = a.querySelector('div[data-testid="tweetText"]') || a.querySelector('[lang]');
        const text = textEl ? textEl.innerText.trim() : '';
        const timeEl = a.querySelector('time');
        const time = timeEl ? timeEl.getAttribute('datetime') : null;

        // Post URL (find anchor that links to the status)
        let postUrl = null;
        const statusAnchor = a.querySelector('a[href*="/status/"]');
        if (statusAnchor) {
          const href = statusAnchor.getAttribute('href') || '';
          postUrl = href.startsWith('http') ? href : (`https://x.com${href}`);
        }

        // Author name and handle
        let author = '';
        let handle = '';
        try {
          const anchors = Array.from(a.querySelectorAll('a[href]'));
          const profileAnchor = anchors.find(el => {
            const h = el.getAttribute('href') || '';
            // prefer simple profile paths like "/FoxNews" (single path segment)
            if (!h.startsWith('/')) return false;
            if (h.includes('/status') || h.includes('/hashtag') || h.includes('/i/')) return false;
            const parts = h.split('/').filter(Boolean);
            return parts.length === 1;
          });
          if (profileAnchor) {
            handle = profileAnchor.getAttribute('href') || '';
            author = (profileAnchor.innerText || '').trim();
          }
        } catch (e) {}

        // Metrics: replies, retweets, likes
        let replies = 0, retweets = 0, likes = 0;
        try {
          // look for elements with data-testid or aria-labels containing metrics
          const replyEl = a.querySelector('[data-testid*="reply"]') || a.querySelector('[aria-label*="reply"]');
          const retweetEl = a.querySelector('[data-testid*="retweet"]') || a.querySelector('[aria-label*="retweet"]');
          const likeEl = a.querySelector('[data-testid*="like"]') || a.querySelector('[aria-label*="like"]');

          const candidateText = (el) => {
            if (!el) return '';
            return (el.innerText || el.getAttribute('aria-label') || '').trim();
          };

          replies = parseNumber(candidateText(replyEl));
          retweets = parseNumber(candidateText(retweetEl));
          likes = parseNumber(candidateText(likeEl));
        } catch (e) {}

        results.push({ text, time, author, handle, postUrl, replies, retweets, likes });
      }
      return results;
    }, n);

    const result = { success: true, count: tweets.length, tweets };

    // If keepAliveMs > 0, run background human-like browsing without blocking response.
    if (keepAliveMs > 0) {
      (async () => {
        try {
          await simulateHumanBrowsing(page, keepAliveMs);
        } catch (e) {
          console.error('Background browsing error (readTimeline):', e && e.message ? e.message : e);
        } finally {
          try { await page.close(); } catch (e) {}
          try { await context.close(); } catch (e) {}
          try { await browser.close(); } catch (e) {}
        }
      })();
      // return response immediately while browsing continues
      return result;
    }

    return result;

  } catch (error) {
    try { reportFailure(error, 'runReadTimeline'); } catch (e) { /* ignore */ }
    return { success: false, message: error && error.message ? error.message : String(error) };
  } finally {
    // If KEEP_ALIVE_MS is set to >0 we let the background task close the browser.
    const keepAliveMsFinal = process.env.KEEP_ALIVE_MS ? Number(process.env.KEEP_ALIVE_MS) : 60000;
    if (keepAliveMsFinal <= 0) {
      try { if (page) await page.close(); } catch (e) {}
      try { if (context) await context.close(); } catch (e) {}
      try { if (browser) await browser.close(); } catch (e) {}
    } else {
      // do not close here; background task will handle closure
    }
  }
}

// Simulate human-like browsing on a page for `durationMs` milliseconds.
async function simulateHumanBrowsing(page, durationMs) {
  const end = Date.now() + durationMs;
  let pageUrl = '';
  try { pageUrl = page.url(); } catch (e) { pageUrl = ''; }
  console.log(`Simulating human browsing on ${pageUrl} for ${Math.round(durationMs/1000)}s`);

  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  while (Date.now() < end) {
    try {
      // Random scroll
      const dy = rand(100, 800) * (Math.random() < 0.6 ? 1 : -1);
      await page.evaluate((y) => window.scrollBy({ top: y, left: 0, behavior: 'smooth' }), dy);
      await page.waitForTimeout(rand(800, 2500));

      // Randomly hover over some elements
      const anchors = await page.$$('a[href]');
      if (anchors.length > 0 && Math.random() < 0.4) {
        const idx = rand(0, Math.min(anchors.length - 1, 8));
        try { await anchors[idx].hover(); } catch (e) {}
        await page.waitForTimeout(rand(400, 1200));
      }

      // Occasionally click into a tweet or profile (but only navigate within x.com)
      if (Math.random() < 0.25) {
        try {
          const statusAnchors = await page.$$('a[href*="/status/"]');
          if (statusAnchors.length > 0) {
            const idx = rand(0, Math.min(statusAnchors.length - 1, 4));
            try { await statusAnchors[idx].click({ button: 'left', delay: rand(50,150) }); } catch (e) {}
            await page.waitForTimeout(rand(1200, 3500));
            try { await page.goBack({ timeout: 10000 }); } catch (e) {}
            await page.waitForTimeout(rand(800, 2000));
          }
        } catch (e) {}
      }

      // Small random pause
      await page.waitForTimeout(rand(500, 2500));
    } catch (err) {
      // ignore per-iteration errors, continue until time elapses
      console.error('simulateHumanBrowsing iteration error:', err && err.message ? err.message : err);
      await page.waitForTimeout(1000);
    }
  }

  console.log('simulateHumanBrowsing completed.');
}

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// Reply helper: navigate to a specific post and reply to it
// -----------------------------------------------------------------------------
async function runReplyToPost(target, replyText) {
  if (!replyText || String(replyText).trim() === '') {
    return { success: false, message: 'Reply text cannot be empty.' };
  }

  // Build a usable URL for the target
  let url = '';
  if (!target) return { success: false, message: 'Target post is required.' };
  if (String(target).startsWith('http')) {
    url = String(target);
  } else if (/^\d+$/.test(String(target))) {
    // numeric id -> use the web status viewer
    url = `https://x.com/i/web/status/${String(target)}`;
  } else if (String(target).startsWith('/')) {
    url = `https://x.com${String(target)}`;
  } else {
    // fallback: try to interpret as a path
    url = `https://x.com/${String(target)}`;
  }

  let browser;
  let context;
  let page;
  try {
    browser = await chromium.launch({
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: false,
      args: ['--no-sandbox','--disable-gpu']
    });

    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    context = await browser.newContext({ userAgent: randomUserAgent, locale: 'en-US' });

    // Load cookies like other functions
    try {
      const cookiesPath = path.join(__dirname, 'cookies.json');
      const cookiesString = await fsp.readFile(cookiesPath, 'utf-8');
      let cookies = JSON.parse(cookiesString || '[]');
      const normalizeSameSite = (v) => {
        if (!v && v !== 0) return undefined;
        const s = String(v).toLowerCase();
        if (s === 'strict') return 'Strict';
        if (s === 'lax') return 'Lax';
        if (s === 'none' || s === 'no_restriction') return 'None';
        if (s === '0') return 'None';
        if (s === '1') return 'Lax';
        if (s === '2') return 'Strict';
        return undefined;
      };
      const normalized = (Array.isArray(cookies) ? cookies : []).map((c) => {
        const cc = Object.assign({}, c);
        if (cc.expiry && !cc.expires) {
          const num = Number(cc.expiry);
          if (!Number.isNaN(num)) cc.expires = Math.floor(num);
          delete cc.expiry;
        }
        if (cc.expirationDate && !cc.expires) {
          const num = Number(cc.expirationDate);
          if (!Number.isNaN(num)) cc.expires = Math.floor(num);
          delete cc.expirationDate;
        }
        if (cc.expires) {
          const num = Number(cc.expires);
          if (Number.isFinite(num)) cc.expires = Math.floor(num);
          else delete cc.expires;
        }
        const ss = normalizeSameSite(cc.sameSite || cc.SameSite || cc.same_site);
        if (ss) cc.sameSite = ss; else delete cc.sameSite;
        if (!cc.url && !cc.domain) return null;
        return cc;
      }).filter(Boolean);

      try { await context.addCookies(normalized); } catch (e) { /* continue without cookies */ }
    } catch (e) {
      // ignore cookie loading errors
    }

    page = await context.newPage();
    await page.setViewportSize({ width: 1200, height: 900 });

    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(1500 + Math.random() * 1500);

    // Wait for reply action and open reply composer
    // Data-testid or aria-labels can vary; try a few selectors
    const replySelectors = ['[data-testid="reply"]', 'div[aria-label*="Reply"]', 'a[role="button"][href*="/status/"]'];
    let clicked = false;
    for (const sel of replySelectors) {
      try {
        const el = await page.waitForSelector(sel, { timeout: 5000 });
        if (el) {
          await el.click({ force: true });
          clicked = true;
          break;
        }
      } catch (e) {}
    }

    if (!clicked) {
      // Sometimes the reply button is nested in an article; try locating the article then its reply
      try {
        const article = await page.$('article');
        if (article) {
          const replyBtn = await article.$('[data-testid="reply"]');
          if (replyBtn) { await replyBtn.click({ force: true }); clicked = true; }
        }
      } catch (e) {}
    }

    // Wait for reply textarea and pick the first visible instance to avoid strict-mode errors
    const textareaSelector = 'div[data-testid="tweetTextarea_0"]';
    const textarea = page.locator(textareaSelector).first();
    await textarea.waitFor({ state: 'visible', timeout: 30000 });
    await textarea.click({ force: true });
    await page.waitForTimeout(300 + Math.random() * 700);
    await textarea.fill('');
    const typingDelay = Math.random() * 120 + 60;
    await textarea.type(replyText, { delay: typingDelay, timeout: 60000 });

    // Click Post / Reply button - try dialog-scoped button first, then fallbacks, then keyboard
    let posted = false;
    try {
      const dialog = page.locator('div[role="dialog"]').first();
      if (await dialog.count() > 0) {
        const btn = dialog.getByTestId('tweetButtonInline').first();
        try {
          await btn.waitFor({ state: 'visible', timeout: 7000 });
          const ariaDisabled = await btn.getAttribute('aria-disabled');
          if (ariaDisabled === 'true') await page.waitForTimeout(800);
          await btn.click({ force: true });
          posted = true;
        } catch (e) {
          // continue to other fallbacks
        }
      }
    } catch (e) {}

    if (!posted) {
      try {
        const pageBtn = page.locator('div[role="button"][data-testid*="tweetButton"]').first();
        await pageBtn.waitFor({ state: 'visible', timeout: 7000 });
        await pageBtn.click({ force: true });
        posted = true;
      } catch (e) {
        // continue
      }
    }

    // Try role/button by accessible name (e.g., 'Reply') as a robust selector
    if (!posted) {
      try {
        const namedBtn = page.getByRole('button', { name: /^(Reply|Send|Tweet)$/i }).first();
        const count = await namedBtn.count();
        if (count > 0) {
          try {
            await namedBtn.waitFor({ state: 'visible', timeout: 5000 });
            const ariaDisabled = await namedBtn.getAttribute('aria-disabled');
            console.log('Named button aria-disabled:', ariaDisabled);
            await namedBtn.click({ force: true });
            posted = true;
          } catch (e) {
            // continue to keyboard fallback
          }
        }
      } catch (e) {
        // ignore
      }
    }

    // Keyboard fallback: try Meta+Enter then Control+Enter to submit when button clicks fail
    if (!posted) {
      try { await page.keyboard.press('Meta+Enter'); posted = true; } catch (e) {}
    }
    if (!posted) {
      try { await page.keyboard.press('Control+Enter'); posted = true; } catch (e) {}
    }

    // If still not posted, capture a diagnostic screenshot and DOM snapshot for debugging
    if (!posted) {
      try {
        const debugPath = path.join(__dirname, `reply_debug_${Date.now()}.png`);
        await page.screenshot({ path: debugPath, fullPage: true });
        console.error('Reply send failed; saved screenshot to', debugPath);
      } catch (e) {
        console.error('Failed to capture debug screenshot:', e && e.message ? e.message : e);
      }
    }

    await page.waitForTimeout(3000 + Math.random() * 4000);
    return { success: true, message: 'Reply posted (or attempt initiated).', target: url };
  } catch (err) {
    return { success: false, message: err && err.message ? err.message : String(err) };
  } finally {
    try { if (page) await page.close(); } catch (e) {}
    try { if (context) await context.close(); } catch (e) {}
    try { if (browser) await browser.close(); } catch (e) {}
  }
}

// Express API Server Setup (No changes here)
// تنظیمات سرور API اکسپرس (بدون تغییر در اینجا)
// -----------------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());

app.post('/tweet', async (req, res) => {
  console.log(`\nReceived POST request to /tweet at ${new Date().toISOString()}`);
  const { tweetText } = req.body;

  if (!tweetText) {
    console.log("Request missing 'tweetText'.");
    return res.status(400).json({ success: false, message: "Missing 'tweetText' in request body." });
  }
  console.log(`Tweet text received: "${tweetText.substring(0,50)}..."`);

  try {
    const result = await runXLoginAndPost(tweetText);
    if (result.success) {
      console.log("Sending success response.");
      res.status(200).json(result);
    } else {
      console.log("Sending failure response.");
      res.status(500).json(result);
    }
  } catch (serverError) {
    console.error("Unexpected server error:", serverError);
    res.status(500).json({ success: false, message: `Unexpected server error: ${serverError.message}` });
  }
});

// POST /reply - JSON body. Accepts either `postUrl` or `postId` (or `target`) and reply text.
// Example body: { "postUrl": "https://x.com/FoxNews/status/2011913540647477469", "Replay-tweetText": "nice" }
app.post('/reply', async (req, res) => {
  console.log(`Received POST /reply at ${new Date().toISOString()}`);
  const body = req.body || {};
  const replyText = body['Replay-tweetText'] || body.ReplayTweetText || body.replyText || body.tweetText;
  const target = body.postUrl || body.postId || body.target;

  if (!replyText) return res.status(400).json({ success: false, message: "Missing reply text. Use key 'Replay-tweetText' or 'replyText'." });
  if (!target) return res.status(400).json({ success: false, message: "Missing target post. Provide 'postUrl' or 'postId'." });

  try {
    const result = await runReplyToPost(target, replyText);
    if (result && result.success) return res.status(200).json(result);
    return res.status(500).json(result);
  } catch (err) {
    console.error('Error in /reply', err);
    res.status(500).json({ success: false, message: err && err.message ? err.message : String(err) });
  }
});

// Support POST to paths like /replay:https://x.com/... or /replay:2011913540647477469
app.post(/^\/replay:(.+)/, async (req, res) => {
  const target = req.params[0];
  console.log(`Received POST /replay:${target} at ${new Date().toISOString()}`);
  const body = req.body || {};
  const replyText = body['Replay-tweetText'] || body.ReplayTweetText || body.replyText || body.tweetText;
  if (!replyText) return res.status(400).json({ success: false, message: "Missing reply text in JSON body (key 'Replay-tweetText')." });

  try {
    const result = await runReplyToPost(target, replyText);
    if (result && result.success) return res.status(200).json(result);
    return res.status(500).json(result);
  } catch (err) {
    console.error('Error in regex /replay route', err);
    res.status(500).json({ success: false, message: err && err.message ? err.message : String(err) });
  }
});

app.get('/', (req, res) => {
    // Updated the welcome message
    // پیام خوش‌آمدگویی به‌روز شد
    res.send('Playwright Tweet API Server is running (V3.2 - Fix type Timeout). Send POST requests to /tweet.');
});

// Read top N timeline posts
app.get('/readTM/:count', async (req, res) => {
  const count = Number(req.params.count) || 0;
  console.log(`Received request to /readTM/${count}`);
  if (count <= 0) return res.status(400).json({ success: false, message: 'Invalid count. Use a positive integer.' });
  try {
    const result = await runReadTimeline(count);
    if (result.success) return res.status(200).json(result);
    return res.status(500).json(result);
  } catch (err) {
    console.error('Error in /readTM/:count', err);
    res.status(500).json({ success: false, message: err && err.message ? err.message : String(err) });
  }
});

// Support query param: /readTM?count=3
app.get('/readTM', async (req, res) => {
  const count = Number(req.query.count) || 0;
  console.log(`Received request to /readTM?count=${count}`);
  if (count <= 0) return res.status(400).json({ success: false, message: 'Invalid or missing count query parameter.' });
  try {
    const result = await runReadTimeline(count);
    if (result.success) return res.status(200).json(result);
    return res.status(500).json(result);
  } catch (err) {
    console.error('Error in /readTM', err);
    res.status(500).json({ success: false, message: err && err.message ? err.message : String(err) });
  }
});

// Typo alias for convenience: /reamTM -> /readTM
app.get('/reamTM/:count', async (req, res) => {
  req.url = `/readTM/${req.params.count}`;
  app._router.handle(req, res);
});

app.listen(PORT, () => {
  console.log(`Tweet API server listening on port ${PORT}`);
  console.log(`GitHub Codespace should forward this port.`);
  console.log(`Check the 'Ports' tab for the public URL.`);
  console.log(`Send POST requests to <Your Codespace URL>/tweet with JSON body: {"tweetText": "your message"}`);
});
