/* End-to-end checks against the same assets shipped in the APK. No external API is used. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
let chromium;
try { ({chromium}=require('playwright')); }
catch { ({chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json'};
const server=http.createServer((req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    fs.readFile(target,(error,body)=>{
        if(error){res.writeHead(404).end();return;}
        res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream'}).end(body);
    });
});
async function command(page,text){
    await page.locator('#messageInput').fill(text);
    await page.locator('.send-btn').click();
    await page.waitForTimeout(50);
}
async function saved(page){await page.evaluate(()=>VikiStorage.flush());return page.evaluate(()=>VikiStorage.load());}
(async()=>{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${server.address().port}`;
    const executablePath=process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
    const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
    try {
        const context=await browser.newContext({acceptDownloads:true,serviceWorkers:'block'});
        const external=[],errors=[];
        const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
        await context.route('**/*',route=>{
            if(!route.request().url().startsWith(origin)){external.push(route.request().url());return route.abort();}
            return route.continue();
        });
        page.on('dialog',dialog=>dialog.accept());
        await page.goto(origin,{waitUntil:'networkidle'});
        await page.waitForFunction(()=>document.getElementById('localStorageStatus').textContent.includes('ready'));
        assert.equal(await page.evaluate(()=>localStorage.getItem('viki_no_llm')),'true');
        assert.deepEqual(external,[],'clean startup must not attempt external requests');
        await command(page,'add eggs');
        await command(page,'CONFIRM');
        let state=await saved(page);
        assert.equal(state.inventory.length,1,'confirmed eggs should persist without account');
        assert.equal(state.inventory[0].name,'eggs');
        await page.locator('.favorite-button').first().click();
        state=await saved(page);assert.ok(state.favoriteRules.eggs,'favorite saves its rule locally');
        await page.reload({waitUntil:'networkidle'});
        await page.waitForFunction(()=>document.getElementById('localStorageStatus').textContent.includes('ready'));
        state=await saved(page);assert.equal(state.inventory.length,1);assert.ok(state.favoriteRules.eggs);
        const second=await context.newPage();
        await second.goto(origin,{waitUntil:'networkidle'});
        const blocked=await second.evaluate(()=>VikiStorage.load().then(()=>'',error=>error.message));
        assert.match(blocked,/another tab/);
        await second.close();
        console.log('PASS offline-first startup, addition, favorites, IndexedDB reload and second-tab protection');

        for(const input of ['Add Reminder','Pick up medicine','SKIP','in 2 hours','NONE','LOCAL','ONCE','CONFIRM'])await command(page,input);
        state=await saved(page);
        assert.equal(state.reminders.length,1,'local reminder conversation must not require email');
        assert.deepEqual(state.reminders[0].recipients,[]);
        assert.equal(state.reminders[0].subject,'Pick up medicine');
        await page.locator('#openSettingsButton').click();
        const downloadPromise=page.waitForEvent('download');
        await page.locator('#exportDataButton').click();
        const download=await downloadPromise;
        const backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
        assert.equal(backup.schemaVersion,1);
        assert.equal(backup.viki_inventory_v2.length,1);
        assert.equal(backup.reminders[0].subject,'Pick up medicine');
        assert.ok(backup.favoriteRules.eggs);
        await page.locator('#importDataInput').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
        await page.waitForFunction(()=>document.body.textContent.includes('IMPORT_DATA complete'));
        state=await saved(page);assert.equal(state.reminders.length,1);assert.equal(state.inventory.length,1);
        console.log('PASS local reminders and version-1 backup export/import roundtrip');

        // Seed a past event through the public adapter, then exercise the real delivery path.
        await page.evaluate(async()=>{
            const state=await VikiStorage.load();
            state.notificationSettings={enabled:true,dailySummary:false,milestones:false,reminders:true};
            state.reminders=[{id:'due-test',subject:'Due test',body:'Notification deduplication',recipients:[],status:'pending',repeat:'none',reminder_datetime:new Date(Date.now()-1000).toISOString(),second_reminder_datetime:null}];
            state.notificationHistory={};await VikiStorage.save(state);
        });
        await page.reload({waitUntil:'networkidle'});
        await page.waitForFunction(async()=>Object.keys((await VikiStorage.load()).notificationHistory||{}).length===1);
        state=await saved(page);const firstHistory=Object.keys(state.notificationHistory);
        await page.evaluate(()=>checkLocalNotifications());
        assert.deepEqual(Object.keys((await saved(page)).notificationHistory),firstHistory);
        await page.reload({waitUntil:'networkidle'});
        await page.waitForFunction(()=>document.getElementById('localStorageStatus').textContent.includes('ready'));
        assert.deepEqual(Object.keys((await saved(page)).notificationHistory),firstHistory);
        console.log('PASS due notification delivery and persisted duplicate suppression');

        assert.deepEqual(external,[],'local operations must not attempt external requests');

        // Explicit cloud connection preserves current local data and uses existing Auth/PostgREST shape.
        await context.unroute('**/*');
        const cloudRequests=[];let uploaded,remoteOverride;
        await context.route('https://test.supabase.co/**',async route=>{
            const req=route.request(),url=new URL(req.url());cloudRequests.push({path:url.pathname,query:url.search,method:req.method()});
            if(url.pathname==='/auth/v1/token')return route.fulfill({json:{access_token:'test-access',refresh_token:'test-refresh',user:{id:'test-user',email:'operator@example.com'}}});
            if(url.pathname==='/rest/v1/viki_state' && req.method()==='POST'){
                uploaded=req.postDataJSON();return route.fulfill({status:201,json:[]});
            }
            if(url.pathname==='/rest/v1/viki_state' && req.method()==='GET')return route.fulfill({json:[{state:remoteOverride || uploaded.state}]});
            throw Error('Unexpected cloud request '+req.url());
        });
        await page.locator('#openSettingsButton').click();
        await page.locator('#supabaseUrl').fill('https://test.supabase.co');
        await page.locator('#supabaseAnonKey').fill('browser-safe-test-key');
        await page.locator('#supabaseEmail').fill('operator@example.com');
        await page.locator('#supabasePassword').fill('test-password');
        const before=await saved(page);
        await page.locator('#connectSupabaseButton').click();
        await page.waitForFunction(()=>document.getElementById('supabaseStatus').textContent.includes('Connected as'));
        assert.deepEqual(await saved(page),before,'connect must not overwrite local data');
        assert.equal(cloudRequests.length,1,'connect must only authenticate');
        assert.equal(await page.locator('#supabasePassword').inputValue(),'');
        await page.locator('#uploadSupabaseButton').click();
        await page.waitForFunction(()=>document.getElementById('supabaseStatus').textContent.includes('Uploaded'));
        assert.equal(uploaded.user_id,'test-user');
        assert.ok(uploaded.updated_at);assert.deepEqual(uploaded.state.inventory,before.inventory);
        await page.locator('#downloadSupabaseButton').click();
        await page.waitForFunction(()=>document.getElementById('supabaseStatus').textContent.includes('downloaded'));
        assert.ok(cloudRequests.some(r=>r.method==='GET'&&r.query.includes('user_id=eq.test-user')));
        const beforeInvalidDownload=await saved(page);
        remoteOverride={...uploaded.state,inventory:[null]};
        await page.locator('#downloadSupabaseButton').click();
        await page.waitForFunction(()=>document.getElementById('supabaseStatus').textContent.includes('Invalid inventory'));
        assert.deepEqual(await saved(page),beforeInvalidDownload,'invalid remote state must not replace durable local data');
        await page.locator('#disconnectSupabaseButton').click();
        assert.equal((await saved(page)).inventory.length,1);
        assert.equal(await page.evaluate(()=>localStorage.getItem('viki_supabase_session')),null);
        assert.deepEqual(errors,[],'no uncaught JavaScript errors');
        console.log('PASS optional Supabase Auth/PostgREST contract, explicit upload/download, and disconnect retains local state');
        await context.close();
        const nativeContext=await browser.newContext({serviceWorkers:'block'});
        await nativeContext.addInitScript(()=>{
            window.VikiNative={
                readState:()=>localStorage.getItem('test_native_db'),
                writeState:json=>{localStorage.setItem('test_native_db',json);return true;},
                scheduleNotifications:json=>localStorage.setItem('test_native_schedule',json),
                notificationStatus:()=>JSON.stringify({notifications:true,exactAlarms:true}),
                requestNotificationPermission:()=>{},requestExactAlarmPermission:()=>{}
            };
        });
        const nativePage=await nativeContext.newPage();
        await nativePage.goto(origin,{waitUntil:'networkidle'});
        await nativePage.waitForFunction(()=>document.getElementById('localStorageStatus').textContent.includes('sqlite'));
        await command(nativePage,'add eggs');await command(nativePage,'CONFIRM');
        assert.equal((await saved(nativePage)).inventory.length,1);
        await nativePage.reload({waitUntil:'networkidle'});
        await nativePage.waitForFunction(()=>document.getElementById('localStorageStatus').textContent.includes('sqlite'));
        assert.equal((await saved(nativePage)).inventory.length,1);
        await nativePage.locator('#openSettingsButton').click();
        await nativePage.locator('#localNotificationsEnabled').check();
        await nativePage.locator('#saveNotificationSettingsButton').click();
        await nativePage.waitForFunction(()=>JSON.parse(localStorage.getItem('test_native_schedule')).length>0);
        const schedules=await nativePage.evaluate(()=>JSON.parse(localStorage.getItem('test_native_schedule')));
        assert.ok(schedules.some(e=>e.kind==='digest'));
        console.log('PASS shared app native bridge persistence and notification schedule handoff (mock bridge)');
        await nativeContext.close();
    } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
