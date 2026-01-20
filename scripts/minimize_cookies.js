const fs = require('fs').promises;
const path = require('path');

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

// Usage: node scripts/minimize_cookies.js [--out path]
(async () => {
  try {
    const root = path.join(__dirname, '..');
    const src = path.join(root, 'cookies.json');
    const outArgIndex = process.argv.indexOf('--out');
    const out = outArgIndex !== -1 && process.argv[outArgIndex + 1]
      ? process.argv[outArgIndex + 1]
      : path.join(root, 'cookies_min.json');

    const raw = await fs.readFile(src, 'utf8').catch(() => null);
    if (!raw) {
      console.error('Could not read cookies.json at project root. Ensure you have exported cookies to cookies.json.');
      process.exit(1);
    }

    const cookies = JSON.parse(raw || '[]');
    const minimal = (Array.isArray(cookies) ? cookies : []).map(c => {
      const name = c.name || c.key || c.n || null;
      const value = c.value || c.v || null;
      if (!name || !value) return null;

      // Prefer absolute URL if present; otherwise derive from domain
      const url = (c.url && String(c.url).startsWith('http')) ? c.url : (c.domain ? `https://${String(c.domain).replace(/^\./, '')}` : null);

      const sameSite = normalizeSameSite(c.sameSite || c.SameSite || c.same_site);

      return {
        name,
        value,
        // include either url OR domain+path; url is simplest for Playwright
        ...(url ? { url } : {}),
        path: c.path || '/',
        ...(sameSite ? { sameSite } : {}),
        secure: !!c.secure
      };
    }).filter(Boolean);

    await fs.writeFile(out, JSON.stringify(minimal, null, 2));
    console.log(`Wrote ${out} (${minimal.length} cookies).`);
    console.log('Tip: start with a single auth cookie and iterate (binary search) to find the minimal required set. Do not commit output to source control.');
  } catch (err) {
    console.error('Error while minimizing cookies:', err && err.message ? err.message : err);
    process.exit(2);
  }
})();
