// 1. Import necessary modules
// 1. وارد کردن ماژول‌های ضروری
//https://g.co/gemini/share/13b9a7fce227
const { chromium } = require('playwright');
const path = require('path');
const fsp = require('fs').promises; // Use promise-based fs for async operations
const express = require('express');

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
        // Fallback: try adding cookies with only minimal fields (name, value, domain/path)
        const minimal = normalized.map((c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path || '/', url: c.url })).filter(Boolean);
        try {
          await context.addCookies(minimal);
          console.log(`Cookies added (fallback, ${minimal.length}).`);
        } catch (fallbackErr) {
          console.error('Fallback cookie add also failed:', fallbackErr && (fallbackErr.message || fallbackErr));
          // Continue without cookies rather than throwing to allow the rest of the flow to run
          console.log('Continuing without cookies.');
        }
      }
    } catch (err) {
      console.error(`Error reading/parsing cookies file (${cookiesPath}):`, err && err.message ? err.message : err);
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

    console.log("--- Playwright task completed successfully. ---");
    return { success: true, message: "Tweet posted successfully (or attempt initiated)." };

  } catch (error) {
    console.error("\nAn error occurred during the Playwright process:", error);
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

// -----------------------------------------------------------------------------
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

app.get('/', (req, res) => {
    // Updated the welcome message
    // پیام خوش‌آمدگویی به‌روز شد
    res.send('Playwright Tweet API Server is running (V3.2 - Fix type Timeout). Send POST requests to /tweet.');
});

app.listen(PORT, () => {
  console.log(`Tweet API server listening on port ${PORT}`);
  console.log(`GitHub Codespace should forward this port.`);
  console.log(`Check the 'Ports' tab for the public URL.`);
  console.log(`Send POST requests to <Your Codespace URL>/tweet with JSON body: {"tweetText": "your message"}`);
});
