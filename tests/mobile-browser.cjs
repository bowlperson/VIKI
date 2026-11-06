/* Mobile navigation, readable controls and local preferences on Pixel-sized screens. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'};
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(error,body)=>{if(error){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(body);});
});
async function ready(page){await page.waitForFunction(()=>window.VikiMobile && document.body.classList.contains('mobile-ui-ready'));}
async function fit(page,label){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${label}: no horizontal overflow`);}
async function touchable(locator,label){
 await locator.scrollIntoViewIfNeeded();
 const box=await locator.boundingBox();assert.ok(box&&box.width>=43&&box.height>=43,`${label}: target is at least 44px (${JSON.stringify(box)})`);
 const hit=await locator.evaluate(el=>{const r=el.getBoundingClientRect();const top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!top&&(el===top||el.contains(top));});
 assert.ok(hit,`${label}: not covered by another control`);
}
(async()=>{
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
  for(const viewport of [{width:412,height:915},{width:393,height:851}]){
   const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,serviceWorkers:'block',timezoneId:'America/Phoenix'});
   const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(origin,{waitUntil:'networkidle'});await ready(page);
   await fit(page,'Chat');
   assert.equal(await page.locator('#permissionSetupButton').isVisible(),false,'browser does not gate startup on Android permissions');
   assert.equal(await page.locator('#vikiCommandGuide').count(),1,'first launch displays command guide');
   await page.locator('#vikiCommandGuide').evaluate(el=>el.remove());
   await page.evaluate(()=>VikiHelp.maybeShowDaily());
   assert.equal(await page.locator('#vikiCommandGuide').count(),0,'same day guide does not auto-repeat');
   await page.evaluate(()=>{const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);VikiHelp.maybeShowDaily(tomorrow.getTime());});
   assert.equal(await page.locator('#vikiCommandGuide').count(),1,'next day guide loads automatically');
   await page.locator('#vikiCommandGuide').evaluate(el=>el.remove());
   await page.locator('#messageInput').fill('help');await page.locator('.send-btn').click();
   await page.waitForSelector('#vikiCommandGuide');
   assert.ok((await page.locator('#vikiCommandGuide').innerText()).toLowerCase().includes('add'),'help lists supported entry commands');
   await page.screenshot({path:`/tmp/viki-mobile-${viewport.width}-chat.png`});
   // Detailed interactions follow the public mobile module contract; controls
   // are asserted separately so an invisible-but-callable view cannot pass.
   for(const view of ['assets','reminders','settings','chat']){
    await page.evaluate(view=>VikiMobile.selectView(view),view);
    await fit(page,view);
   }
   await page.evaluate(async()=>{
    await VikiInbox.record({id:'mobile-email',kind:'email',title:'Reminder email sent',body:'Recipient: operator@example.com',at:Date.now(),status:'sent'});
    await VikiInbox.record({id:'mobile-notification',kind:'notification',title:'Inventory warning',body:'Milk is approaching expiry',at:Date.now(),status:'delivered'});
    VikiMobile.selectView('reminders');
   });
   await page.locator('#reminderInboxTabs [data-section="history"]').click();
   await page.locator('#inboxFilter').selectOption('email');
   assert.equal(await page.locator('.viki-inbox-card').count(),1,'email filter excludes notifications');
   const email=page.locator('[data-inbox-id="mobile-email"]');
   await email.getByRole('button',{name:'Mark read',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('[data-inbox-id="mobile-email"]')?.classList.contains('is-read'));
   assert.match(await email.locator('.viki-inbox-message').evaluate(el=>el.style.filter),/blur/,'read email content is blurred');
   await email.getByRole('button',{name:'Reveal read message',exact:true}).click();
   assert.equal(await email.locator('.viki-inbox-message').evaluate(el=>el.style.filter),'','read message can be revealed');
   await email.getByRole('button',{name:'Mark unread',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('[data-inbox-id="mobile-email"]')?.classList.contains('is-unread'));
   await page.locator('#inboxFilter').selectOption('unread');
   assert.equal(await page.locator('.viki-inbox-card').count(),2,'unread state can be restored');
   await page.screenshot({path:`/tmp/viki-mobile-${viewport.width}-inbox.png`});
   if(viewport.width===412){
    let sends=0;
    await context.route('https://api.emailjs.com/**',route=>{sends++;return route.fulfill({status:200,body:'OK'});});
    await page.evaluate(async()=>{
     localStorage.setItem('viki_reminder_email_settings',JSON.stringify({enabled:true,serviceId:'test-service',templateId:'test-template',publicKey:'test-public'}));
     const current=await VikiStorage.load();
     current.reminders=[{id:'email-integration',subject:'Mocked email check',body:'Recorded delivery',recipients:['operator@example.com'],status:'pending',repeat:'none',reminder_datetime:new Date(Date.now()-60000).toISOString(),second_reminder_datetime:null}];
     current.notificationSettings={enabled:false};await VikiStorage.save(current);
    });
    await page.reload({waitUntil:'networkidle'});await ready(page);
    await page.waitForFunction(async()=> (await VikiStorage.load()).inbox?.some(e=>e.kind==='email'&&e.title.includes('Mocked email check')&&e.status==='sent'));
    await page.evaluate(()=>checkDueReminders());assert.equal(sends,1,'sent reminder email is archived without duplicate send');
   }
   await page.evaluate(()=>VikiMobile.selectView('settings'));
   await touchable(page.locator('#closeSettingsButton'),'Settings back');
   await page.screenshot({path:`/tmp/viki-mobile-${viewport.width}-settings.png`});
   await page.evaluate(()=>VikiMobile.selectSettingsCategory('appearance'));
   for(const theme of ['mint','violet','amber']){
    await page.locator(`.theme-option[data-theme="${theme}"]`).click();
    const palette=await page.evaluate(()=>['fridge','freezer','cupboard'].map(key=>getComputedStyle(document.documentElement).getPropertyValue('--'+key).trim()));
    assert.equal(new Set(palette).size,3,'theme preserves three distinct location colors');
   }
   await page.locator('#palette-fridge').evaluate(el=>{el.value='#ff88cc';el.dispatchEvent(new Event('input'));});
   assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--fridge')),'#ff88cc');
   await page.locator('#monoAccent').check();
   assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--secondary-accent')),await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent-cyan')));
   assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--fridge')),'#ff88cc','mono does not erase location choices');
   await page.locator('#appearanceScale').evaluate(el=>{el.value='.7';el.dispatchEvent(new Event('input'));});
   await page.locator('#chatScale').evaluate(el=>{el.value='1.4';el.dispatchEvent(new Event('input'));});
   assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--app-scale')),'0.7');
   assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--chat-scale')),'1.4');
   await page.evaluate(async()=>{
    cashProfiles=[{id:'quiet-game',name:'Quiet test',balance:10000}];databaseState.cashProfiles=cashProfiles;localStorage.setItem(CASH_PROFILE_KEY,'quiet-game');
    const before=document.getElementById('chatArea').childElementCount;
    start2048Game();end2048Game();await earnCashForRegistryAddition();await handleLocalCommand('xoxo reset');
    if(document.getElementById('chatArea').childElementCount!==before)throw Error('Games or earnings leaked into chat');
   });
   for(const category of ['storage','alerts','assistant','advanced','appearance']){
    const tab=page.locator(`.settings-category[data-category="${category}"]`);
    await touchable(tab,`${category} category`);await tab.click();
    assert.equal(await tab.getAttribute('aria-pressed'),'true');
   }
   await page.locator('.theme-option[data-theme="violet"]').click();
   assert.equal(await page.locator('html').getAttribute('data-theme'),'violet');
   await page.locator('.theme-option[data-theme="custom"]').click();
   for(const [id,color] of [['themeAccent','#fe00aa'],['themeBackground','#10101c'],['themeText','#f1f0ff']]){
    await page.locator('#'+id).evaluate((el,color)=>{el.value=color;el.dispatchEvent(new Event('input',{bubbles:true}));},color);
   }
   await page.locator('#appearanceFont').selectOption('readable');
   await page.locator('#appearanceScale').evaluate(el=>{el.value='1.2';el.dispatchEvent(new Event('input',{bubbles:true}));});
   await page.locator('#reduceMotion').check();
   await page.locator('#fullscreenEnabled').uncheck();
   await page.reload({waitUntil:'networkidle'});await ready(page);
   const preferences=await page.evaluate(()=>JSON.parse(localStorage.getItem('viki_appearance_v1')));
   assert.equal(preferences.theme,'custom');assert.equal(preferences.accent,'#fe00aa');assert.equal(preferences.background,'#10101c');assert.equal(preferences.text,'#f1f0ff');
   assert.equal(preferences.font,'readable');assert.equal(preferences.scale,1.2);assert.equal(preferences.reducedMotion,true);assert.equal(preferences.fullscreen,false);
   await page.evaluate(()=>VikiMobile.selectView('settings'));
   await page.locator('#settingsSearch').fill('Supabase');
   await page.locator('#storageMode').waitFor({state:'visible'});
   assert.ok(await page.locator('#supabaseUrl').isVisible(),'Settings search finds cloud controls across categories');
   await page.locator('#settingsSearch').fill('unfindable-setting-xyz');
   assert.ok(await page.locator('#settingsSearchEmpty').isVisible(),'Settings search provides empty feedback');
   await page.locator('#settingsSearch').fill('');
   await page.locator('.settings-category[data-category="appearance"]').click();
   await page.screenshot({path:`/tmp/viki-mobile-${viewport.width}-custom-theme.png`});
   await page.setViewportSize({width:viewport.width,height:420});
   await fit(page,'Keyboard-sized Settings');
   await touchable(page.locator('#closeSettingsButton'),'Keyboard-sized Settings back');
   await page.evaluate(()=>VikiMobile.selectView('chat'));
   await touchable(page.locator('#messageInput'),'Keyboard-sized chat input');
   assert.deepEqual(errors,[],'no uncaught errors in mobile navigation');
   await context.close();
  }
  console.log('PASS first-launch/daily/manual command guide and read/blur/reveal activity inbox');
  console.log('PASS mocked email delivery archival and duplicate-send suppression');
  console.log('PASS mobile themes, custom colors, fonts, text scale and Settings search persistence');
  console.log('PASS Pixel-sized navigation, reachable Settings back, and keyboard-sized layouts');
 }finally{if(browser)await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
