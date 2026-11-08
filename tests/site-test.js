// Browser checks for the IIF site, run with Playwright.
//
//   npm run test:browser                     # against `npm run dev` (http://localhost:4173)
//   npm run test:live                        # against https://internationalintermediaryforum.org
//   node tests/site-test.js <url> [--engines=chromium,firefox,webkit]
//
// Browsers come from `npx playwright install`. Chromium falls back to an installed Microsoft Edge;
// other engines that are not installed are reported as SKIP. Screenshots go to test-results/.
const { chromium, firefox, webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const BASE = (args.find((a) => !a.startsWith('--')) || 'http://localhost:4173').replace(/\/$/, '');
const ENGINES = (args.find((a) => a.startsWith('--engines='))?.split('=')[1] || 'chromium,firefox,webkit').split(',');
const SITE = 'https://internationalintermediaryforum.org';
const IS_LIVE = BASE === SITE;
const SHOTS = path.join(__dirname, '..', 'test-results', 'screenshots', IS_LIVE ? 'live' : 'local');
fs.mkdirSync(SHOTS, { recursive: true });

const NAVY = 'rgb(8, 38, 83)';
const GOLD = 'rgb(212, 155, 42)';
const results = [];
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

async function check(group, name, fn) {
  try {
    const detail = await fn();
    results.push({ group, name, status: 'PASS', detail: detail || '' });
  } catch (e) {
    results.push({ group, name, status: 'FAIL', detail: e.message.split('\n')[0] });
  }
}

// Collect console errors, page errors, failed requests and 4xx/5xx subresources.
function watch(page, { expectDocStatus = 200 } = {}) {
  const issues = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (expectDocStatus === 404 && /404/.test(m.text())) return; // the intentional 404 document itself
    issues.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => issues.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    const f = r.failure()?.errorText || '';
    if (!/ABORT|NS_BINDING_ABORTED|cancelled/i.test(f)) issues.push(`requestfailed: ${r.url()} ${f}`);
  });
  page.on('response', (r) => {
    if (r.request().resourceType() !== 'document' && r.status() >= 400) issues.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  return issues;
}

// Record Content-Security-Policy violations in every browser, not just those that log them.
const cspInit = () => {
  window.__csp = [];
  document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
};

async function noIssues(page, issues) {
  const csp = await page.evaluate(() => window.__csp || []);
  const all = [...issues, ...csp.map((c) => `CSP: ${c}`)];
  assert(all.length === 0, all.join('; '));
}

async function loadAllImages(page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 });
  await page.evaluate(() => window.scrollTo(0, 0));
}

const headerBottom = (page) => page.evaluate(() => document.querySelector('.site-header').getBoundingClientRect().bottom);

const imageSize = (page, src) => page.evaluate((s) => new Promise((resolve) => {
  const i = new Image();
  i.onload = () => resolve([i.naturalWidth, i.naturalHeight]);
  i.onerror = () => resolve(null);
  i.src = s;
}), src);

async function testHome(browser, engine, vpName, viewport, mobile) {
  const group = `${engine} ${vpName}`;
  const touch = mobile && engine !== 'firefox' ? { isMobile: true, hasTouch: true } : {};
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', ...touch });
  await context.addInitScript(cspInit);
  const page = await context.newPage();
  const issues = watch(page);
  const res = await page.goto(BASE + '/', { waitUntil: 'load' });

  await check(group, 'home returns 200', async () => { assert(res.status() === 200, `status ${res.status()}`); });

  await check(group, 'all images load (incl. lazy illustration)', async () => {
    await loadAllImages(page);
    const hero = await page.evaluate(() => performance.getEntriesByType('resource').some((e) => e.name.includes('blue-map.webp')));
    assert(hero, 'hero background blue-map.webp not requested');
    return `${await page.evaluate(() => document.images.length)} <img> + hero background`;
  });

  await check(group, 'no horizontal overflow', async () => {
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    assert(sw <= cw, `scrollWidth ${sw} > clientWidth ${cw}`);
  });

  await check(group, 'favicon link + icon decodes', async () => {
    const href = await page.getAttribute('link[rel="icon"]', 'href');
    assert(href === '/favicon.ico', `icon href ${href}`);
    const size = await imageSize(page, '/favicon.ico');
    assert(size, 'favicon did not decode');
    return `decoded at ${size[0]}px`;
  });

  await check(group, 'canonical + social preview tags', async () => {
    const m = await page.evaluate(() => {
      const q = (s, a = 'content') => document.querySelector(s)?.getAttribute(a);
      return {
        canonical: q('link[rel="canonical"]', 'href'), url: q('meta[property="og:url"]'), title: q('meta[property="og:title"]'),
        desc: q('meta[property="og:description"]'), image: q('meta[property="og:image"]'), card: q('meta[name="twitter:card"]'),
        w: q('meta[property="og:image:width"]'), h: q('meta[property="og:image:height"]'), alt: q('meta[property="og:image:alt"]'),
      };
    });
    assert(m.canonical === SITE + '/' && m.url === SITE + '/', `canonical/url ${m.canonical} ${m.url}`);
    assert(m.title && m.desc && m.alt, 'missing og title/description/image alt');
    assert(m.image === SITE + '/assets/social-preview.jpg', `og:image ${m.image}`);
    assert(m.card === 'summary_large_image' && m.w === '1200' && m.h === '630', 'card type or image dimensions');
    // The tags always name the live domain; check the image this server has at the same path.
    const size = await imageSize(page, '/assets/social-preview.jpg');
    assert(size && size[0] === 1200 && size[1] === 630, `preview image ${size}`);
  });

  await check(group, 'header stays visible when scrolled', async () => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => {
      const h = document.querySelector('.site-header');
      const b = h.getBoundingClientRect();
      return { top: b.top, onTop: h.contains(document.elementFromPoint(b.left + 5, b.top + b.height / 2)), scrollY };
    });
    assert(r.scrollY > 500, 'page did not scroll');
    assert(Math.abs(r.top) < 1 && r.onTop, `header top ${r.top}, on top: ${r.onTop}`);
    await page.screenshot({ path: path.join(SHOTS, `${engine}-${vpName}-scrolled.png`) });
    await page.evaluate(() => window.scrollTo(0, 0));
  });

  await check(group, '"Annual Meeting" nav link lands below header', async () => {
    if (mobile) {
      const toggle = page.locator('.menu-toggle');
      assert(await toggle.isVisible(), 'menu toggle not visible');
      assert(!(await page.locator('#primary-nav').isVisible()), 'nav visible before opening');
      await toggle.click();
      assert((await toggle.getAttribute('aria-expanded')) === 'true', 'aria-expanded not true after open');
    }
    const link = page.getByRole('link', { name: 'Annual Meeting', exact: true });
    assert(await link.isVisible(), '"Annual Meeting" link not visible');
    await link.click();
    await page.waitForTimeout(250);
    if (mobile) assert((await page.getAttribute('.menu-toggle', 'aria-expanded')) === 'false', 'menu did not close');
    const top = await page.evaluate(() => document.querySelector('#meeting').getBoundingClientRect().top);
    const hb = await headerBottom(page);
    assert(page.url().endsWith('#meeting'), `url ${page.url()}`);
    assert(top >= hb - 1 && top < hb + 40, `#meeting top ${top.toFixed(0)} vs header bottom ${hb.toFixed(0)}`);
    return `section top ${top.toFixed(0)}px, header bottom ${hb.toFixed(0)}px`;
  });

  // Tab through every focusable element: each needs the right 3px ring (WCAG 1.4.11) and must not
  // be hidden under the sticky header or off-screen (WCAG 2.4.11).
  await check(group, 'keyboard focus: skip link, rings, not obscured', async () => {
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => document.activeElement.className);
    assert(first.includes('skip-link'), `first Tab focused "${first}"`);
    const total = await page.evaluate(() => [...document.querySelectorAll('a[href], button')]
      .filter((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed').length);
    const seen = [];
    const problems = [];
    for (let i = 0; i < total; i++) {
      if (i > 0) await page.keyboard.press('Tab');
      await page.waitForTimeout(60);
      const f = await page.evaluate(() => {
        const el = document.activeElement;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          label: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40),
          top: r.top, bottom: r.bottom, vh: innerHeight, hb: document.querySelector('.site-header').getBoundingClientRect().bottom,
          inHeader: !!el.closest('.site-header'), skip: el.classList.contains('skip-link'), inFooter: !!el.closest('.site-footer'),
          color: cs.outlineColor, style: cs.outlineStyle, width: cs.outlineWidth,
        };
      });
      seen.push(f.label);
      const want = f.inFooter ? GOLD : NAVY;
      if (f.style === 'none' || f.width !== '3px' || f.color !== want) problems.push(`${f.label}: outline ${f.style} ${f.width} ${f.color}, want ${want}`);
      if (!f.inHeader && !f.skip && (f.top < f.hb - 1 || f.bottom > f.vh + 1)) problems.push(`${f.label}: obscured/off-screen (top ${f.top.toFixed(0)}, header ${f.hb.toFixed(0)})`);
    }
    assert(problems.length === 0, problems.join('; '));
    return `${seen.length} stops: ${seen.join(' | ')}`;
  });

  await check(group, 'skip link moves to main content', async () => {
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    assert(page.url().endsWith('#main-content'), `url ${page.url()}`);
  });

  await check(group, 'reduced motion disables smooth scrolling', async () => {
    const sb = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
    assert(sb === 'auto', `scroll-behavior ${sb}`);
  });

  if (vpName === 'desktop') {
    await check(group, 'nav fits on one line at 821px', async () => {
      await page.setViewportSize({ width: 821, height: 900 });
      const lines = await page.evaluate(() => [...document.querySelectorAll('.primary-nav a')].map((a) => {
        const r = document.createRange();
        r.selectNodeContents(a);
        return `${a.textContent}:${new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size}`;
      }));
      const wrapped = lines.filter((l) => !l.endsWith(':1'));
      assert(wrapped.length === 0, `wrapped: ${wrapped.join(', ')}`);
      await page.setViewportSize(viewport);
    });
  }

  await check(group, 'links: mailto, flyer PDF, Eventbrite opens safely', async () => {
    const mail = await page.getAttribute('.footer-copy a', 'href');
    assert(mail === 'mailto:contact@internationalintermediaryforum.org', `mailto ${mail}`);
    const flyer = await page.request.get(BASE + '/assets/iif-open-meeting-2026-flyer.pdf');
    assert(flyer.status() === 200 && flyer.headers()['content-type'].includes('pdf'), `flyer ${flyer.status()} ${flyer.headers()['content-type']}`);
    const eb = page.locator('a[href*="eventbrite"]');
    assert((await eb.getAttribute('target')) === '_blank' && (await eb.getAttribute('rel')).includes('noopener'), 'Eventbrite link target/rel');
  });

  await page.screenshot({ path: path.join(SHOTS, `${engine}-${vpName}-home.png`), fullPage: true });
  await check(group, 'no console errors, CSP violations or failed requests (home)', () => noIssues(page, issues));
  await context.close();
}

async function test404(browser, engine, vpName, viewport) {
  const group = `${engine} ${vpName}`;
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(cspInit);
  const page = await context.newPage();
  const issues = watch(page, { expectDocStatus: 404 });
  for (const p of ['/does-not-exist', '/nested/does-not-exist']) {
    await check(group, `404 page at ${p}`, async () => {
      const res = await page.goto(BASE + p, { waitUntil: 'load' });
      assert(res.status() === 404, `status ${res.status()}`);
      const h1 = (await page.textContent('h1')).trim();
      assert(h1 === 'Page not found', `h1 "${h1}"`);
      assert(await page.evaluate(() => getComputedStyle(document.querySelector('h1')).fontFamily.includes('Georgia')), 'stylesheet not applied');
      assert(await page.evaluate(() => document.querySelector('.brand-mark').naturalWidth > 0), 'logo did not load');
    });
  }
  await check(group, '404 home link returns to homepage', async () => {
    const [res] = await Promise.all([page.waitForNavigation(), page.getByRole('link', { name: 'Go to the home page' }).click()]);
    assert(page.url() === BASE + '/' && res.status() === 200, `${page.url()} ${res?.status()}`);
  });
  await check(group, 'no console errors, CSP violations or failed requests (404)', () => noIssues(page, issues));
  await context.close();
}

async function testHttp(request) {
  const group = 'http';
  await check(group, 'security headers on / and 404', async () => {
    for (const p of ['/', '/does-not-exist']) {
      const h = (await request.get(BASE + p)).headers();
      assert(h['content-security-policy']?.includes("default-src 'none'") && h['x-frame-options'] === 'DENY' && h['x-content-type-options'] === 'nosniff', `${p} missing headers`);
    }
  });
  await check(group, '/favicon.ico is an icon', async () => {
    const r = await request.get(BASE + '/favicon.ico');
    assert(r.status() === 200 && /icon/.test(r.headers()['content-type']), `${r.status()} ${r.headers()['content-type']}`);
  });
  await check(group, '/assets/social-preview.jpg is a JPEG', async () => {
    const r = await request.get(BASE + '/assets/social-preview.jpg');
    assert(r.status() === 200 && r.headers()['content-type'] === 'image/jpeg', `${r.status()} ${r.headers()['content-type']}`);
    return `${(await r.body()).length} bytes`;
  });
  if (!IS_LIVE) return;
  // Redirects are Cloudflare zone settings (Always Use HTTPS + a www redirect rule), so only the live site has them.
  const hops = [
    ['http://internationalintermediaryforum.org/', `${SITE}/`],
    ['http://www.internationalintermediaryforum.org/x?y=1', 'https://www.internationalintermediaryforum.org/x?y=1'],
    ['https://www.internationalintermediaryforum.org/x?y=1', `${SITE}/x?y=1`],
  ];
  for (const [from, to] of hops) {
    await check(group, `redirect ${from}`, async () => {
      const r = await request.get(from, { maxRedirects: 0 });
      assert([301, 308].includes(r.status()) && r.headers()['location'] === to, `${r.status()} -> ${r.headers()['location']}`);
    });
  }
  // Fails once the event listing is removed: a reminder to update the meeting copy.
  await check(group, 'Eventbrite registration page responds', async () => {
    const r = await request.get('https://www.eventbrite.co.nz/e/international-intermediary-forum-open-meeting-tickets-2003635531812');
    assert(r.status() < 400, `status ${r.status()}`);
    return `status ${r.status()}`;
  });
}

(async () => {
  const launchers = { chromium, firefox, webkit };
  const used = [];
  let httpDone = false;
  for (const engine of ENGINES) {
    let browser;
    try {
      browser = await launchers[engine].launch();
      used.push(engine);
    } catch {
      try {
        if (engine !== 'chromium') throw new Error();
        browser = await chromium.launch({ channel: 'msedge' });
        used.push('chromium (msedge)');
      } catch {
        results.push({ group: engine, name: 'launch', status: 'SKIP', detail: 'browser not installed (npx playwright install)' });
        continue;
      }
    }
    for (const [vpName, viewport, mobile] of [['desktop', { width: 1440, height: 900 }, false], ['mobile', { width: 375, height: 812 }, true], ['small', { width: 320, height: 640 }, true]]) {
      await testHome(browser, engine, vpName, viewport, mobile);
      if (vpName !== 'small') await test404(browser, engine, vpName, viewport);
    }
    if (!httpDone) {
      const ctx = await browser.newContext();
      await testHttp(ctx.request);
      await ctx.close();
      httpDone = true;
    }
    await browser.close();
  }

  console.log(`\nBASE ${BASE}   engines: ${used.join(', ') || 'none'}\n`);
  let last = '';
  for (const r of results) {
    if (r.group !== last) { console.log(`== ${r.group}`); last = r.group; }
    console.log(`  ${r.status.padEnd(5)} ${r.name}${r.detail ? `  — ${r.detail}` : ''}`);
  }
  const count = (s) => results.filter((r) => r.status === s).length;
  console.log(`\n${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped. Screenshots: ${path.relative(process.cwd(), SHOTS)}`);
  process.exitCode = count('FAIL') || !used.length ? 1 : 0;
})();
