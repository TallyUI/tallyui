#!/usr/bin/env node
// Screenshot capture for docs/v2-parity/PARITY.md.
//
// Usage:
//   node scripts/parity/capture.mjs [--app v2|medusapos|vendurepos|tally-woo|all] [--only slug,slug] [--sale]
//
// Writes docs/v2-parity/screens/<app>/<section-slug>.jpg (JPEG quality 70,
// 1280x800, plus 390x844 for the sale screen). Each section runs in its own
// try/catch, so one missing screen never stops the rest; the log says which
// sections were skipped and why.
//
// Safe to rerun. It only reads the public demos:
// - demo.wcpos.com (WCPOS v2) is a live public demo. The script signs in with
//   the credentials the login page shows (demo / demo), opens dialogs and the
//   tender screen, and closes them again. It never takes a payment, refunds,
//   closes a register, saves a setting or creates a customer or product.
//   It reuses one cart per profile (the cart URL is kept in the profile
//   folder), so a rerun does not leave a new open order each time.
// - demo.medusapos.com and demo.vendurepos.com: the same rules. The one
//   exception is --sale, which completes a single cash sale on each, to reach
//   the receipt screen. Without --sale the receipt is not captured.
// - Tally Woo (tallyui-woocommerce.vercel.app) has no public store to sign in
//   to; only its connect screen is captured.
//
// Browser: Playwright Chromium from the repo's @playwright/test. Set
// PARITY_CHROME to a Chromium binary if the bundled revision is not installed.
// Profiles live in $PARITY_PROFILE_DIR (default: <tmpdir>/tallyui-parity).

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCREENS = path.join(ROOT, 'docs/v2-parity/screens');
const PROFILES = process.env.PARITY_PROFILE_DIR ?? path.join(os.tmpdir(), 'tallyui-parity');

// The viewports the checklist compares at.
const WIDE = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
// JPEG quality 70 keeps a 1280x800 screen well under 200 KB.
const JPEG_QUALITY = 70;
// How long to let a single-page app settle after navigation or a tap.
const SETTLE_MS = 1500;
const BOOT_MS = 9000;

const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const appArg = argValue('--app') ?? 'all';
const only = argValue('--only')?.split(',');
const allowSale = args.includes('--sale');

const log = (...m) => console.log(...m);

async function shot(page, app, slug) {
  const dir = path.join(SCREENS, app);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${slug}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: JPEG_QUALITY });
  const kb = Math.round(fs.statSync(file).size / 1024);
  log(`  shot ${app}/${slug}.jpg ${kb} KB`);
}

async function settle(page, ms = SETTLE_MS) {
  await page.waitForTimeout(ms);
}

// Run one section: reset to a known state, act, screenshot. A failure is
// logged and the section is skipped.
async function section(ctx, slug, fn) {
  if (only && !only.includes(slug)) return;
  const { page, app } = ctx;
  try {
    await page.setViewportSize(WIDE);
    await fn(page);
    await shot(page, app, slug);
  } catch (e) {
    log(`  SKIP ${app}/${slug}: ${String(e).split('\n')[0]}`);
  } finally {
    // Close whatever dialog or sheet the section opened. Cancel first, so a
    // started drawer count or form is abandoned rather than left open.
    const cancel = page.getByRole('button', { name: 'Cancel', exact: true }).last();
    if (await cancel.isVisible().catch(() => false)) await cancel.click().catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
    await settle(page, 500);
  }
}

const tid = (id) => `[data-testid="${id}"]`;
const click = async (page, sel, ms = SETTLE_MS) => {
  await page.locator(sel).first().click({ timeout: 10000 });
  await settle(page, ms);
};
const visible = async (page, sel, timeout = 3000) =>
  page
    .locator(sel)
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);

// The demo sign-in pages print their public demo logins. Mask the printed
// passwords, the "sign in with <user> / <password>" hint and any typed field
// before a screenshot, so no login is ever committed with the images.
async function redactCredentials(page) {
  await page
    .evaluate(() => {
      const rules = [
        [/(sign in with\s+)\S+(\s*\/\s*)\S+/i, '$1••••$2••••'],
        [/(@[\w.-]+\s*·\s*)\S+/, '$1••••'],
        [/^(\s*Password\s+)\S+/, '$1••••'],
      ];
      const els = [...document.body.querySelectorAll('*')].filter(
        // Never rewrite an element that holds a field or button: replacing
        // its text would remove the control the run fills next.
        (el) =>
          !['SCRIPT', 'STYLE'].includes(el.tagName) &&
          !el.querySelector('input,button,select,textarea'),
      );
      for (const [re, to] of rules) {
        // The deepest elements whose text matches, so a hint split across a
        // <strong> is still caught whole.
        const hits = els.filter(
          (el) => re.test(el.textContent) && ![...el.children].some((c) => re.test(c.textContent)),
        );
        for (const el of hits) el.textContent = el.textContent.replace(re, to);
      }
      for (const i of document.querySelectorAll('input[type=text],input[type=email],input:not([type])')) {
        if (i.value) i.value = '••••';
      }
    })
    .catch(() => {});
}

// demo.wcpos.com prints its public demo login on the sign-in page ("sign in
// with <user> / <password>"). Read it from there at run time rather than
// keeping it in this file; without the hint the demo needs a login we do not
// have, and the run stops.
async function readPrintedLogin(page) {
  const text = await page.locator('body').innerText();
  const m = text.match(/sign in with\s+(\S+)\s*\/\s*(\S+)/i);
  if (!m) throw new Error('login needed: the sign-in page prints no demo login');
  return { user: m[1], pass: m[2] };
}

async function fillPrintedLogin(page, login) {
  await page.fill('#user_login', login.user);
  await page.fill('#user_pass', login.pass);
}

// A first visit in a throwaway browser with no saved sign-in. `fn` gets the
// page and a `snap(slug)` that screenshots the current state.
async function firstVisit(app, fn) {
  if (only && !['login', 'store-pick'].some((s) => only.includes(s))) return;
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PARITY_CHROME || undefined,
  });
  try {
    const page = await (await browser.newContext({ viewport: WIDE })).newPage();
    page.setDefaultTimeout(10000);
    await fn(page, async (slug) => {
      await redactCredentials(page);
      await shot(page, app, slug);
    });
  } catch (e) {
    log(`  SKIP ${app}/first visit: ${String(e).split('\n')[0]}`);
  } finally {
    await browser.close();
  }
}

async function launch(app) {
  const dir = path.join(PROFILES, app);
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await chromium.launchPersistentContext(dir, {
    headless: true,
    viewport: WIDE,
    executablePath: process.env.PARITY_CHROME || undefined,
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.setDefaultTimeout(10000);
  return { browser: ctx, page, app, dir };
}

// ---------------------------------------------------------------- WCPOS v2

const V2 = 'https://demo.wcpos.com/pos';

async function v2SignIn(page) {
  await page.goto(V2, { waitUntil: 'domcontentloaded' });
  await settle(page, 3000);
  if (await visible(page, '#user_login', 2000)) {
    await fillPrintedLogin(page, await readPrintedLogin(page));
    await page.check('#rememberme').catch(() => {});
    await page.click('#wp-submit');
  }
  await settle(page, BOOT_MS);
  // A new device is asked which register it is at. Joining an open register
  // is a device choice, not a register change.
  if (await visible(page, '[data-testid^="register-picker-row-"]', 2000)) {
    await click(page, '[data-testid^="register-picker-row-"]', 3000);
  }
}

// One cart per profile: the first run adds one product, later runs reopen it.
async function v2Cart(ctx) {
  const { page, dir } = ctx;
  const keep = path.join(dir, 'v2-cart-url.txt');
  if (fs.existsSync(keep)) {
    await page.goto(fs.readFileSync(keep, 'utf8').trim(), { waitUntil: 'domcontentloaded' });
    await settle(page, BOOT_MS);
    if (await visible(page, tid('cart-quantity-input'), 3000)) return;
  }
  await page.goto(V2, { waitUntil: 'domcontentloaded' });
  await settle(page, BOOT_MS);
  await click(page, tid('browse-all-products'), 3000);
  await page.getByRole('button', { name: 'Affirm Water Bottle' }).first().click();
  await settle(page, 2500);
  fs.writeFileSync(keep, page.url());
}

async function v2Back(ctx) {
  const { page, dir } = ctx;
  await page.goto(fs.readFileSync(path.join(dir, 'v2-cart-url.txt'), 'utf8').trim(), {
    waitUntil: 'domcontentloaded',
  });
  await settle(page, BOOT_MS);
}

async function captureV2() {
  const ctx = await launch('v2');
  const { page } = ctx;
  log('v2: demo.wcpos.com');

  // A first visit, in a throwaway browser: the sign-in page, then the
  // register question a new device is asked.
  await firstVisit('v2', async (p, snap) => {
    await p.goto(V2, { waitUntil: 'domcontentloaded' });
    await settle(p, 3000);
    const login = await readPrintedLogin(p);
    await snap('login');
    await fillPrintedLogin(p, login);
    await p.click('#wp-submit');
    await settle(p, BOOT_MS + 3000);
    await snap('store-pick');
  });
  await v2SignIn(page);
  await v2Cart(ctx);

  await section(ctx, 'sale-wide', async (p) => {
    await click(p, tid('browse-all-products'), 3000);
  });
  await section(ctx, 'sale-phone', async (p) => {
    await p.setViewportSize(PHONE);
    await settle(p, 2500);
  });
  await v2Back(ctx);

  await section(ctx, 'search', async (p) => {
    await p.fill(tid('search-products'), 'shirt');
    await settle(p, 3000);
  });
  await page.fill(tid('search-products'), '').catch(() => {});

  await section(ctx, 'categories', async (p) => {
    await click(p, tid('filter-pill-categories'));
  });

  await section(ctx, 'variable', async (p) => {
    await click(p, tid('browse-all-products'), 3000);
    await p.getByRole('button', { name: 'Aether Gym Pant' }).first().click();
    await settle(p, 2500);
  });
  await v2Back(ctx);

  await section(ctx, 'line-quantity', async (p) => {
    await click(p, tid('cart-quantity-input'));
  });
  await section(ctx, 'line-price', async (p) => {
    await click(p, tid('cart-price'));
  });
  await section(ctx, 'fee-shipping', async (p) => {
    await click(p, tid('add-cart-item-menu'));
  });
  await section(ctx, 'fee', async (p) => {
    await click(p, tid('add-cart-item-menu'));
    await p.getByText('Add Fee').first().click();
    await settle(p);
  });
  await section(ctx, 'coupon', async (p) => {
    await click(p, tid('add-cart-item-menu'));
    await p.getByText('Add Discount').first().click();
    await settle(p);
    await click(p, tid('add-discount-kind-coupon'));
  });
  await section(ctx, 'customer', async (p) => {
    await click(p, tid('cart-customer-name-label'), 2500);
  });
  await section(ctx, 'customer-create', async (p) => {
    await click(p, tid('add-cart-item-menu'));
    await p.getByText('Add new customer').first().click();
    await settle(p, 2000);
  });
  await section(ctx, 'note', async (p) => {
    await click(p, tid('order-meta-button'));
  });
  await section(ctx, 'open-orders', async (p) => {
    await p.locator('[data-testid^="open-order-tab-"]').last().hover();
    await settle(p, 500);
  });
  await section(ctx, 'tender', async (p) => {
    await click(p, tid('checkout-button'), 3000);
  });
  await section(ctx, 'split', async (p) => {
    // The section reset closes the tender pane, so open it again.
    if (!(await visible(p, tid('checkout-split-chip'), 1500))) await click(p, tid('checkout-button'), 3000);
    await click(p, tid('checkout-split-chip'));
  });
  await v2Back(ctx);

  // Orders: the list, an existing completed order, its receipt and the
  // refund form (opened, never submitted).
  const openCompleted = async (p) => {
    await click(p, tid('drawer-item-orders'), 5000);
    await p
      .locator('[data-testid^="order-status-"][aria-label="Completed"]')
      .first()
      .locator('xpath=ancestor::*[.//*[@data-testid="order-open-button"]][1]')
      .locator(tid('order-open-button'))
      .first()
      .click();
    await settle(p, 3000);
  };
  await section(ctx, 'orders', async (p) => {
    await click(p, tid('drawer-item-orders'), 5000);
  });
  await section(ctx, 'order-detail', openCompleted);
  await section(ctx, 'receipt', async (p) => {
    await openCompleted(p);
    await p.getByRole('button', { name: 'Receipt', exact: true }).last().click();
    await settle(p, 4000);
  });
  await section(ctx, 'refund', async (p) => {
    await openCompleted(p);
    await p.getByRole('button', { name: 'Refund', exact: true }).last().click();
    await settle(p, 3000);
  });
  await section(ctx, 'customers', async (p) => {
    await click(p, tid('drawer-item-customers'), 5000);
  });
  await section(ctx, 'products', async (p) => {
    await click(p, tid('drawer-item-products'), 5000);
  });
  await section(ctx, 'register', async (p) => {
    await click(p, tid('drawer-item-pos'), 4000);
    await click(p, tid('register-bar-avatar'));
    await click(p, tid('user-sheet-drawer'), 2500);
  });
  await section(ctx, 'register-close', async (p) => {
    await click(p, tid('register-bar-avatar'));
    await click(p, tid('user-sheet-drawer'), 2500);
    await click(p, tid('register-panel-close-register'), 2500);
  });
  await section(ctx, 'reports', async (p) => {
    await click(p, tid('drawer-item-reports'), 6000);
  });
  await section(ctx, 'settings-display', async (p) => {
    await click(p, tid('drawer-item-settings'), 4000);
    await click(p, tid('settings-nav-theme'), 2000);
  });
  await section(ctx, 'settings-hardware', async (p) => {
    await click(p, tid('drawer-item-settings'), 4000);
    await click(p, tid('settings-nav-printing'), 2000);
  });
  await section(ctx, 'settings-barcode', async (p) => {
    await click(p, tid('drawer-item-settings'), 4000);
    await click(p, tid('settings-nav-barcode-scanning'), 2000);
  });
  await section(ctx, 'cashier', async (p) => {
    await click(p, tid('drawer-item-pos'), 4000);
    await click(p, tid('register-bar-avatar'));
  });
  await section(ctx, 'offline', async (p) => {
    await click(p, tid('drawer-item-pos'), 4000);
    await ctx.browser.setOffline(true);
    await settle(p, 4000);
    await p.locator(tid('browse-all-products')).first().click().catch(() => {});
    await settle(p, 2000);
  });
  await ctx.browser.setOffline(false);
  await ctx.browser.close();
}

// ------------------------------------------- medusapos and vendurepos (TallyUI)

// Both apps are built from the same TallyUI components. Some controls carry a
// test id in one app and only a label in the other, so `pick` tries the test
// id first and then the button label.
const TALLY_APPS = {
  medusapos: {
    url: 'https://demo.medusapos.com',
    enter: tid('demo-enter-cashier'),
    simple: 'Butter Croissant',
    variable: 'E2E product 4',
    search: 'coffee',
  },
  vendurepos: {
    url: 'https://demo.vendurepos.com',
    enter: tid('demo-enter'),
    simple: 'Tally Fixture Mug',
    variable: 'Espresso Beans',
    search: 'coffee',
  },
};

async function pick(p, testId, label, ms = SETTLE_MS) {
  const byId = p.locator(tid(testId)).first();
  if (testId && (await byId.isVisible().catch(() => false))) {
    await byId.click();
  } else {
    await p.getByRole('button', { name: label, exact: typeof label === 'string' }).first().click();
  }
  await settle(p, ms);
}

async function tallyHome(ctx, cfg) {
  const { page } = ctx;
  await page.setViewportSize(WIDE);
  await page.goto(cfg.url, { waitUntil: 'domcontentloaded' });
  await settle(page, BOOT_MS);
  if (page.url().includes('/demo') && (await visible(page, cfg.enter, 3000))) {
    await click(page, cfg.enter, BOOT_MS);
  }
  await page.locator(tid('demo-banner-dismiss')).click({ timeout: 1000 }).catch(() => {});
  // The till must be open before it takes payment. Opening it, with a
  // 100 float, is the first thing any cashier does on these demos.
  if (await visible(page, tid('register-picker-row-register-1'), 1500)) {
    await click(page, tid('register-picker-row-register-1'), 2500);
  }
  if (await visible(page, tid('open-register-amount'), 1500)) {
    await page.fill(tid('open-register-amount'), '100');
    await click(page, tid('open-register-button'), 3000);
  }
  // medusapos keeps one claim per till; a new sign-in by this script finds
  // its own earlier claim. The register list says "Not opened" when that is
  // the case, and only then is taking it over harmless.
  if (await visible(page, tid('register-conflict-take-over'), 1500)) {
    await click(page, tid('register-conflict-take-over'), 3000);
  }
}

async function tallyCart(ctx, cfg) {
  const { page } = ctx;
  await tallyHome(ctx, cfg);
  if (!(await visible(page, '[aria-label^="Remove "]', 1500))) {
    await click(page, tid(`product-tile-${cfg.simple}`), 2000);
  }
}

// Leave whatever pane a section opened: the tender pane (Back), a count
// (Back to selling), a sheet or dialog (Cancel, Escape).
async function tallyReset(p) {
  for (const name of ['Back', 'Back to selling', 'Back to the cart', 'Back to sale']) {
    const b = p.getByRole('button', { name, exact: true }).first();
    if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
  }
  await settle(p, 500);
}

async function captureTally(app) {
  const cfg = TALLY_APPS[app];
  const ctx = await launch(app);
  const { page } = ctx;
  const sec = (slug, fn) =>
    section(ctx, slug, async (p) => {
      await fn(p);
    }).then(() => tallyReset(page));
  log(`${app}: ${cfg.url}`);

  await firstVisit(app, async (p, snap) => {
    await p.goto(`${cfg.url}/demo`, { waitUntil: 'domcontentloaded' });
    await settle(p, 4000);
    await snap('login');
    await click(p, cfg.enter, BOOT_MS);
    await p.locator(tid('demo-banner-dismiss')).click({ timeout: 1000 }).catch(() => {});
    await snap('store-pick');
  });
  await tallyCart(ctx, cfg);

  await sec('sale-wide', async () => {});
  await sec('sale-phone', async (p) => {
    await p.setViewportSize(PHONE);
    await settle(p, 2500);
  });
  await page.setViewportSize(WIDE);
  await sec('search', async (p) => {
    await p.getByPlaceholder(/Search or scan/).first().fill(cfg.search);
    await settle(p, 2500);
  });
  await page.getByPlaceholder(/Search or scan/).first().fill('').catch(() => {});
  await sec('categories', async (p) => {
    await p.locator('[data-testid^="category-nav-"]').nth(1).click();
    await settle(p);
  });
  await page.locator('[data-testid="category-nav-"]').first().click().catch(() => {});
  await sec('variable', async (p) => {
    await click(p, tid(`product-tile-${cfg.variable}`), 2000);
  });
  await page.getByRole('button', { name: 'Cancel', exact: true }).first().click({ timeout: 1000 }).catch(() => {});
  await sec('line-quantity', async (p) => {
    const inc = p.locator('[aria-label^="Increase "]').first();
    if (await inc.isVisible().catch(() => false)) await inc.click();
    else await p.getByRole('button', { name: '+', exact: true }).first().click();
    await settle(p);
  });
  // Undo the extra unit, but only if the quantity section added one: at a
  // quantity of 1, Decrease removes the line.
  if (!only || only.includes('line-quantity')) {
    const dec = page.locator('[aria-label^="Decrease "]').first();
    if (await dec.isVisible().catch(() => false)) await dec.click().catch(() => {});
    else await page.getByRole('button', { name: /^[−-]$/ }).first().click({ timeout: 1000 }).catch(() => {});
  }
  await sec('line-price', async (p) => {
    const byId = p.locator('[data-testid^="line-price-"]').first();
    if (await byId.isVisible().catch(() => false)) await byId.click();
    else await p.getByText('Price', { exact: true }).first().click();
    await settle(p);
  });
  await sec('line-discount', async (p) => {
    const byId = p.locator('[data-testid^="line-discount-"]').first();
    if (await byId.isVisible().catch(() => false)) await byId.click();
    else await p.getByText('Discount', { exact: true }).first().click();
    await settle(p);
  });
  await sec('fee-shipping', async (p) => {
    await pick(p, 'add-charge', 'Add charge');
  });
  await sec('fee', async (p) => {
    await pick(p, 'add-charge', 'Add charge');
    await p.getByRole('button', { name: 'Fee', exact: true }).first().click();
    await settle(p);
  });
  await sec('coupon', async (p) => {
    await pick(p, 'order-discount', 'Order discount');
  });
  await sec('customer', async (p) => {
    await pick(p, 'customer-add', /^Customer/, 2500);
  });
  await sec('customer-create', async (p) => {
    // vendurepos opens the customer search inline and the second press of
    // its button closes it again, so press it only when the search is shut.
    const add = p.getByRole('button', { name: /new customer/i }).first();
    if (!(await add.isVisible().catch(() => false))) await pick(p, 'customer-add', /^Customer/, 2500);
    await add.click();
    await settle(p);
  });
  await sec('note', async (p) => {
    // A sale note button, not a product whose name starts with "Note".
    await p.getByRole('button', { name: /^(add |order |sale |cart )?note$/i }).first().click({ timeout: 3000 });
    await settle(p);
  });
  await sec('open-orders', async (p) => {
    await pick(p, 'parked-open', /^Park/);
  });
  await tallyCart(ctx, cfg);
  await sec('tender', async (p) => {
    await pick(p, 'pay-cash', 'Cash', 2500);
  });
  await sec('split', async (p) => {
    if (await visible(p, tid('pay-split'), 1000)) await click(p, tid('pay-split'), 2500);
    else if (await p.getByRole('button', { name: 'Split', exact: true }).first().isVisible().catch(() => false)) {
      await pick(p, null, 'Split', 2500);
    } else {
      await pick(p, 'pay-cash', 'Cash', 2500);
      await p.getByRole('button', { name: 'Split payment' }).first().click();
      await settle(p, 2000);
    }
  });
  // The one sale per demo the checklist allows, to reach the receipt. A marker
  // in the profile folder makes sure a rerun never makes a second one.
  const saleMarker = path.join(PROFILES, app, 'sale-done.txt');
  if (allowSale && !fs.existsSync(saleMarker)) {
    fs.writeFileSync(saleMarker, new Date().toISOString());
    await sec('receipt', async (p) => {
      await tallyCart(ctx, cfg);
      await pick(p, 'pay-cash', 'Cash', 2500);
      // Type a cash amount above the total (the last text box on screen is
      // the tendered amount; the first is the product search).
      await p.getByRole('textbox').last().fill('50');
      await settle(p, 800);
      const complete = p.locator(tid('tender-complete'));
      if (await complete.isVisible().catch(() => false)) await complete.click();
      else await p.getByRole('button', { name: /complete sale/i }).first().click();
      await settle(p, 5000);
    });
  }
  await sec('orders', async (p) => {
    await pick(p, 'orders-open', 'Orders', 4000);
  });
  // Open the newest order in the Orders list (each row has an order-row- id).
  const openFirstOrder = async (p) => {
    await tallyHome(ctx, cfg);
    await pick(p, 'orders-open', 'Orders', 4000);
    await p.locator('[data-testid^="order-row-"]').first().click();
    await settle(p, 3000);
  };
  await sec('order-detail', async (p) => {
    await openFirstOrder(p);
  });
  await sec('refund', async (p) => {
    await openFirstOrder(p);
    await p.getByRole('button', { name: /refund/i }).first().click();
    await settle(p, 2500);
  });
  await tallyHome(ctx, cfg);
  await sec('products', async (p) => {
    await click(p, tid('view-toggle-table'), 2500);
  });
  await page.locator(tid('view-toggle-grid')).click({ timeout: 1000 }).catch(() => {});
  await sec('register', async (p) => {
    await pick(p, 'register-open-panel', 'Open register panel', 2500).catch(() =>
      click(p, tid('register-bar-open-panel'), 2500),
    );
  });
  await sec('register-close', async (p) => {
    // Starts the count, which "Back to selling" undoes; never closes.
    if (await visible(p, tid('register-open-panel'), 1000)) await click(p, tid('register-open-panel'), 2500);
    else await click(p, tid('register-bar-open-panel'), 2500);
    await click(p, tid('register-panel-close'), 2500);
  });
  await tallyHome(ctx, cfg);
  await sec('reports', async (p) => {
    if (await visible(p, tid('register-print-x'), 1000)) await click(p, tid('register-print-x'), 3000);
    else await pick(p, null, 'Reports', 4000);
  });
  await tallyHome(ctx, cfg);
  await sec('settings-display', async (p) => {
    await pick(p, 'settings-open', 'Settings', 4000);
  });
  await tallyHome(ctx, cfg);
  await sec('offline', async (p) => {
    await ctx.browser.setOffline(true);
    await settle(p, 4000);
    await p.locator(tid('sync-now')).click({ timeout: 1000 }).catch(() => {});
    await p.getByPlaceholder(/Search or scan/).first().fill(cfg.search).catch(() => {});
    await settle(p, 2500);
  });
  await ctx.browser.setOffline(false);
  await ctx.browser.close();
}

// ---------------------------------------------------------------- Tally Woo

async function captureTallyWoo() {
  log('tally-woo: tallyui-woocommerce.vercel.app');
  // The only public WooCommerce store is demo.wcpos.com, and its sign-in page
  // refuses the app's redirect address; capture that answer as evidence.
  await firstVisit('tally-woo', async (p, snap) => {
    await p.goto('https://tallyui-woocommerce.vercel.app', { waitUntil: 'domcontentloaded' });
    await settle(p, 5000);
    await snap('login');
    await p.fill(tid('store-url-input'), 'demo.wcpos.com');
    await click(p, tid('connect-store-button'), 8000);
    await snap('store-pick');
  });
}

const runners = {
  v2: captureV2,
  medusapos: () => captureTally('medusapos'),
  vendurepos: () => captureTally('vendurepos'),
  'tally-woo': captureTallyWoo,
};
const apps = appArg === 'all' ? Object.keys(runners) : appArg.split(',');
for (const app of apps) {
  if (!runners[app]) throw new Error(`unknown app ${app}`);
  await runners[app]();
}
