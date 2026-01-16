const fsp = require('fs').promises;
const path = require('path');
const playwright = require('playwright');
(async ()=>{
  try{
    const p = path.join(__dirname,'cookies.json');
    const s = await fsp.readFile(p,'utf8');
    const cookies = JSON.parse(s);
    console.log('orig sameSite[0]=', cookies[0].sameSite);
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
    const normalized = (Array.isArray(cookies)?cookies:[]).map(c=>{
      const cc = Object.assign({}, c);
      if (cc.expiry && !cc.expires){ const num = Number(cc.expiry); if (!Number.isNaN(num)) cc.expires = Math.floor(num); delete cc.expiry; }
      if (cc.expirationDate && !cc.expires){ const num = Number(cc.expirationDate); if (!Number.isNaN(num)) cc.expires = Math.floor(num); delete cc.expirationDate; }
      if (cc.expires){ const num = Number(cc.expires); if (Number.isFinite(num)) cc.expires = Math.floor(num); else delete cc.expires; }
      const ss = normalizeSameSite(cc.sameSite || cc.SameSite || cc.same_site);
      if (ss) cc.sameSite = ss; else delete cc.sameSite;
      if (!cc.url && !cc.domain) return null;
      return cc;
    }).filter(Boolean);
    console.log('normalized count:', normalized.length, 'first sameSite:', normalized[0]&&normalized[0].sameSite);

    console.log('Launching system Chrome to test addCookies...');
    const browser = await playwright.chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true});
    const context = await browser.newContext();
    try{
      await context.addCookies(normalized);
      console.log('addCookies succeeded');
    }catch(e){
      console.error('addCookies error:', e && (e.message || e));
      console.error(e && e.stack);
    }
    await context.close();
    await browser.close();
  }catch(err){
    console.error('test script error:', err && err.stack);
    process.exit(1);
  }
})();
