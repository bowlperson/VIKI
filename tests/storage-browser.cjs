// Run with: node tests/storage-browser.cjs (uses the prepared environment's Playwright).
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
    const browser = await chromium.launch({executablePath:'/usr/bin/chromium', headless:true, args:['--no-sandbox']});
    try {
        const context=await browser.newContext();
        await context.route('http://localhost:8765/**',route=>route.fulfill({body:'<!doctype html><title>Storage integration</title>',contentType:'text/html'}));
        const page=await context.newPage();
        await page.goto('http://localhost:8765/');
        const script=path.join(__dirname,'../viki-storage.js');
        await page.addScriptTag({path:script});
        assert.equal(await page.evaluate(()=>VikiStorage.load()),null);
        await page.evaluate(async()=>{
            const state={inventory:[{id:1,name:'milk',quantity:1,location:'fridge',category:'dairy',addedDate:'2026-01-01T00:00:00Z',shelfLife:7}],presets:{milk:{days:7,category:'dairy',location:'fridge'}},favoriteRules:{},reminders:[]};
            const first=VikiStorage.save(state);
            state.inventory[0].name='eggs';
            const second=VikiStorage.save(state);
            await Promise.all([first,second]);
        });
        await page.reload();
        await page.addScriptTag({path:script});
        const loaded=await page.evaluate(()=>VikiStorage.load());
        assert.equal(loaded.inventory[0].name,'eggs');
        assert.deepEqual(loaded.cashProfiles,[]);
        assert.equal(await page.evaluate(()=>VikiStorage.backend),'indexeddb');
        const second=await context.newPage();
        await second.goto('http://localhost:8765/');
        await second.addScriptTag({path:script});
        assert.match(await second.evaluate(()=>VikiStorage.load().then(()=>'',error=>error.message)),/another tab/);
        await page.close();
        await second.reload();
        await second.addScriptTag({path:script});
        assert.equal((await second.evaluate(()=>VikiStorage.load())).inventory[0].name,'eggs');
        console.log('PASS IndexedDB commit ordering, persistence, and single-writer tab protection');
    } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
