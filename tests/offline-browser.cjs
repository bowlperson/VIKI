/* Real service-worker checks: bundled shell works offline; API data never enters caches. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const root = path.resolve(__dirname, '..');
const types = {'.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.css':'text/css'};
const secretMarker = 'private-test-api-data-never-cache';
let remoteCalls = 0;
const remote = http.createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, apikey');
    if (request.method === 'OPTIONS') { response.writeHead(204).end(); return; }
    remoteCalls++;
    response.writeHead(200, {'Content-Type':'application/json'}).end(JSON.stringify({state:secretMarker}));
});
const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/api/private-state') {
        response.writeHead(200, {'Content-Type':'application/json'}).end(JSON.stringify({state:secretMarker}));
        return;
    }
    const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    fs.readFile(target, (error, body) => {
        if (error) { response.writeHead(404).end(); return; }
        response.writeHead(200, {'Content-Type':types[path.extname(target)] || 'application/octet-stream'}).end(body);
    });
});
const listen = target => new Promise((resolve, reject) => { target.once('error', reject); target.listen(0, '127.0.0.1', resolve); });
const close = target => new Promise(resolve => target.close(resolve));
(async () => {
    let browser;
    try {
        await Promise.all([listen(server), listen(remote)]);
        const origin = `http://127.0.0.1:${server.address().port}`;
        const apiOrigin = `http://127.0.0.1:${remote.address().port}`;
        browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args:['--no-sandbox']});
        const context = await browser.newContext({serviceWorkers:'allow'});
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(origin, {waitUntil:'networkidle'});
        await page.waitForFunction(() => document.getElementById('localStorageStatus').textContent.includes('ready'));
        await page.evaluate(() => navigator.serviceWorker.ready);
        await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
        await page.evaluate(async apiOrigin => {
            const response = await fetch(`${apiOrigin}/rest/v1/viki_state`, {headers:{Authorization:'Bearer test-only-not-a-credential', apikey:'test-only'}});
            if (!response.ok || (await response.json()).state !== 'private-test-api-data-never-cache') throw new Error('Remote test API did not respond');
            const localResponse = await fetch('/api/private-state');
            if ((await localResponse.json()).state !== 'private-test-api-data-never-cache') throw new Error('Same-origin API did not respond');
            const state = await VikiStorage.load();
            state.inventory = [{id:'offline-eggs',name:'eggs',quantity:2,location:'fridge',category:'dairy',addedDate:new Date().toISOString(),shelfLife:28}];
            await VikiStorage.save(state);
        }, apiOrigin);
        assert.equal(remoteCalls, 1, 'cross-origin API GET must actually reach mock service');
        const cached = await page.evaluate(async () => {
            const result = [];
            for (const name of await caches.keys()) {
                const cache = await caches.open(name);
                for (const request of await cache.keys()) result.push({url:request.url, body:await (await cache.match(request)).text()});
            }
            return result;
        });
        for (const pathname of ['/', '/index.html', '/viki-storage.js', '/viki-notifications.js', '/viki-personality.js', '/manifest.json']) {
            assert.ok(cached.some(entry => entry.url === origin + pathname), `offline shell missing ${pathname}`);
        }
        assert.ok(cached.every(entry => entry.url.startsWith(origin + '/')), 'remote API URL must never enter app cache');
        assert.ok(cached.every(entry => !entry.url.includes('/api/private-state') && !entry.body.includes(secretMarker)), 'authenticated/API response body must never enter app cache');
        await context.setOffline(true);
        await page.reload({waitUntil:'domcontentloaded'});
        await page.waitForFunction(() => document.getElementById('localStorageStatus').textContent.includes('ready'));
        const state = await page.evaluate(() => VikiStorage.load());
        assert.equal(state.inventory[0].id, 'offline-eggs', 'IndexedDB data must survive offline app-shell reload');
        await page.locator('#openSettingsButton').click();
        await page.locator('#settingsPage').waitFor({state:'visible'});
        const apiResults = await page.evaluate(async apiOrigin => Promise.all(['/api/private-state', `${apiOrigin}/rest/v1/viki_state`].map(async url => {
            try { await fetch(url); return 'unexpected-response'; } catch { return 'offline'; }
        })), apiOrigin);
        assert.deepEqual(apiResults, ['offline', 'offline'], 'offline API requests must fail rather than return cached private data or index.html');
        await page.setViewportSize({width:412, height:915});
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile Settings should fit Pixel-sized viewport');
        await page.locator('#closeSettingsButton').click();
        await page.evaluate(()=>window.VikiMobile?.selectView('chat'));
        await page.locator('#messageInput').fill('add milk');
        await page.locator('.send-btn').click();
        await page.locator('#messageInput').fill('CONFIRM');
        await page.locator('.send-btn').click();
        await page.evaluate(() => VikiStorage.flush());
        assert.ok((await page.evaluate(() => VikiStorage.load())).inventory.some(item => item.name === 'milk'), 'mobile local addition should work offline');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile inventory should fit Pixel-sized viewport');
        assert.deepEqual(errors, [], 'offline startup and mobile actions must have no JavaScript errors');
        console.log('PASS Pixel-sized browser layout and offline local addition');
        console.log('PASS real service-worker offline reload, local data retention, and Settings');
        console.log('PASS same-origin and cross-origin API GETs excluded from caches and offline fallback');
        await context.close();
    } finally {
        if (browser) await browser.close();
        await Promise.all([close(server), close(remote)]);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
