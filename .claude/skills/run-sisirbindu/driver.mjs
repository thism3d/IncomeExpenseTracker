// Browser driver for SISIRBINDU TRACKERAPP.
//
// chromium-cli is NOT installed on this machine, so this script is the harness:
// a thin Playwright wrapper that logs in, drives a flow, screenshots each step,
// and reports console errors. It is agent tooling, not product code.
//
//   node .claude/skills/run-sisirbindu/driver.mjs [flow]
//
//   flow = smoke   (default) user portal: login -> dashboard (light+dark) ->
//                  add a real transaction -> calendar -> reports -> drive -> budgets
//          admin   admin console: login -> overview -> users -> app -> broadcast
//          export  download the PDF + Excel statements and assert the magic bytes
//          all     every flow above
//
// Env:
//   WEB=http://localhost:5050   web dev server
//   SHOTS=/tmp/sisir-shots      where screenshots land
//   USER_ID / USER_PW           test user      (default 01712345678 / Lawyer@2026)
//   ADMIN_ID / ADMIN_PW         admin account  (default from backend/.env.development)
//
// Requires playwright + its chromium binary. Neither is a project dependency —
// install them into web/ first (see SKILL.md).

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// This skill dir is not an npm package, so resolve playwright out of web/.
const HERE = dirname(fileURLToPath(import.meta.url));
const UNIT = resolve(HERE, '../../..');
const require = createRequire(resolve(UNIT, 'web/package.json'));

let chromium;
try {
    ({ chromium } = require('playwright'));
} catch {
    console.error(
        'playwright is not installed.\n' +
        '  cd web && npm install --no-save playwright@1.61.1 && npx playwright install chromium'
    );
    process.exit(1);
}

const WEB = process.env.WEB || 'http://localhost:5050';
const SHOTS = process.env.SHOTS || '/tmp/sisir-shots';
const USER_ID = process.env.USER_ID || '01712345678';
const USER_PW = process.env.USER_PW || 'Lawyer@2026';
const ADMIN_ID = process.env.ADMIN_ID || 'muzahid@onzep.uk';
const ADMIN_PW = process.env.ADMIN_PW || '@ThisM3D2025456';

const flow = process.argv[2] || 'smoke';
mkdirSync(SHOTS, { recursive: true });

const errors = [];
const step = (m) => console.log(`  ${m}`);

const watch = (page, tag) => {
    page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`[${tag} console] ${m.text().split('\n')[0]}`);
    });
    page.on('pageerror', (e) => errors.push(`[${tag} pageerror] ${e.message}`));
};

const shot = async (page, name) => {
    await page.screenshot({ path: `${SHOTS}/${name}.png` });
    step(`shot: ${name}.png`);
};

// The app talks to the backend over a WebSocket, so networkidle never settles.
// Always wait for a real element instead.
const login = async (page, { identifier, password, path = '/', ready }) => {
    await page.goto(`${WEB}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#identifier', { timeout: 30000 });
    await page.fill('#identifier', identifier);
    await page.fill('#password', password);
    await page.click('button[type=submit]');
    await page.waitForSelector(ready, { timeout: 30000 });
};

const smoke = async (browser) => {
    console.log('\n== USER PORTAL ==');
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 960 } })).newPage();
    watch(page, 'user');

    await login(page, {
        identifier: USER_ID,
        password: USER_PW,
        ready: 'text=/Good (morning|afternoon|evening)/',
    });
    step('logged in');
    await page.waitForTimeout(2500);          // let the charts finish animating in
    await shot(page, '02-dashboard-light');

    await page.click('button[aria-label="Toggle theme"]');
    await page.waitForTimeout(1200);
    await shot(page, '03-dashboard-dark');

    await page.click('a[href="/transactions"]');
    await page.waitForSelector('h1:has-text("Transactions")', { timeout: 20000 });
    await page.waitForTimeout(1500);
    await shot(page, '04-transactions');

    // Write a real transaction — this is the point of the flow. Scope every
    // locator to the dialog: the ledger behind it contains the same text.
    step('adding a transaction…');
    await page.click('button:has-text("Add transaction")');
    const dialog = page.locator('[role=dialog]');
    await dialog.waitFor({ timeout: 15000 });

    await page.fill('#amount', '4500');
    await dialog.locator('button:has-text("Choose a category")').click();
    await dialog.locator('input[placeholder="Search or type to add…"]').fill('Fuel');
    await page.waitForTimeout(500);
    await dialog.locator('button:has-text("Fuel")').first().click();

    const note = `Driven by run-sisirbindu ${Date.now()}`;
    await page.fill('#note', note);
    await shot(page, '05-add-dialog');
    await dialog.locator('button:has-text("Save transaction")').click();

    // Proof it round-tripped through the API and back into the ledger.
    await page.waitForSelector(`text=${note}`, { timeout: 20000 });
    step('transaction saved and visible in the ledger');
    await shot(page, '06-transaction-saved');

    for (const [href, heading, name] of [
        ['/calendar', 'Calendar', '07-calendar'],
        ['/reports', 'Reports', '08-reports'],
        ['/drive', 'Drive', '09-drive'],
        ['/budgets', 'Budgets', '10-budgets'],
    ]) {
        await page.click(`a[href="${href}"]`);
        await page.waitForSelector(`h1:has-text("${heading}")`, { timeout: 20000 });
        await page.waitForTimeout(1800);
        await shot(page, name);
    }
};

const admin = async (browser) => {
    console.log('\n== ADMIN CONSOLE ==');
    // A fresh context: the admin must not inherit the user's session.
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 960 } })).newPage();
    watch(page, 'admin');

    await login(page, {
        identifier: ADMIN_ID,
        password: ADMIN_PW,
        path: '/admin/login',
        ready: 'h1:has-text("Overview")',
    });
    step('admin signed in');
    await page.waitForTimeout(2500);
    await shot(page, '12-admin-overview');

    for (const [href, ready, name] of [
        ['/admin/users', 'h1:has-text("Users")', '13-admin-users'],
        ['/admin/app', 'text=App & maintenance', '14-admin-app'],
        ['/admin/broadcast', 'h1:has-text("Broadcast")', '15-admin-broadcast'],
    ]) {
        await page.click(`a[href="${href}"]`);
        await page.waitForSelector(ready, { timeout: 20000 });
        await page.waitForTimeout(1500);
        await shot(page, name);
    }
};

const exportFlow = async (browser) => {
    console.log('\n== EXPORTS ==');
    const page = await (await browser.newContext({
        viewport: { width: 1440, height: 960 },
        acceptDownloads: true,
    })).newPage();
    watch(page, 'export');

    await login(page, {
        identifier: USER_ID,
        password: USER_PW,
        ready: 'text=/Good (morning|afternoon|evening)/',
    });
    await page.click('a[href="/reports"]');
    await page.waitForSelector('h1:has-text("Reports")', { timeout: 20000 });
    await page.waitForTimeout(2000);

    for (const [label, file, magic] of [
        ['PDF', 'statement.pdf', '%PDF'],
        ['Excel', 'statement.xlsx', 'PK'],
    ]) {
        const pending = page.waitForEvent('download', { timeout: 45000 });
        await page.locator(`button:has-text("${label}")`).first().click();
        const dl = await pending;
        const path = `${SHOTS}/${file}`;
        await dl.saveAs(path);

        // A JSON error body would also "download" — check the magic bytes.
        const head = readFileSync(path).subarray(0, 4).toString('latin1');
        if (!head.startsWith(magic)) {
            throw new Error(`${label} download is not a real ${label}: starts with ${JSON.stringify(head)}`);
        }
        step(`${label} downloaded and verified: ${dl.suggestedFilename()}`);
    }
};

const run = async () => {
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    try {
        if (flow === 'smoke' || flow === 'all') await smoke(browser);
        if (flow === 'admin' || flow === 'all') await admin(browser);
        if (flow === 'export' || flow === 'all') await exportFlow(browser);
    } finally {
        await browser.close();
    }

    console.log('\n== CONSOLE ERRORS ==');
    const unique = [...new Set(errors)];
    if (!unique.length) {
        console.log('  none');
    } else {
        unique.forEach((e) => console.log('  ' + e));
    }
    console.log(`\nScreenshots: ${SHOTS}`);

    // A page can render its shell while every fetch fails — treat console
    // errors as a failed run, not a warning.
    if (unique.length) process.exit(1);
};

run().catch((err) => {
    console.error(`\nDRIVER FAILED: ${err.message}`);
    console.error(`Screenshots so far: ${SHOTS}`);
    process.exit(1);
});
