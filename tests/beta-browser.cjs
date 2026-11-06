/* Exercise real browser directory handles using OPFS in place of a user-picked folder. */
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const root=path.resolve(__dirname,'..'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+(req.url==='/'?'/index.html':new URL(req.url,'http://local').pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,b)=>{if(e)return res.writeHead(404).end();res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(b);});});
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:412,height:915}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(origin);await page.waitForSelector('.mobile-ui-ready');
 assert.equal(await page.locator('#saveReminderEmailSettingsButton').count(),0);
 await page.evaluate(()=>VikiMobile.selectView('reminders'));assert.ok(await page.locator('#reminderHistoryPanel').isVisible());assert.equal(await page.getByRole('tab',{name:'Scheduled',exact:true}).count(),0);
 await page.evaluate(()=>VikiMobile.selectView('settings'));await page.locator('.theme-option[data-theme="red"]').click();
 assert.equal(await page.evaluate(()=>VikiMobile.appearance().theme),'red');
 await page.locator('#appearanceFont').selectOption('mono');assert.equal(await page.evaluate(()=>VikiMobile.appearance().theme),'custom');
 assert.equal(await page.evaluate(()=>localStorage.getItem('viki_appearance_v1')),null,'preview does not persist before confirmation');
 await page.locator('#saveAppearanceButton').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('viki_appearance_v1')).theme),'custom');
 await page.locator('#typeSpeed').fill('10');await page.locator('#typeSpeed').dispatchEvent('input');await page.locator('#saveAppearanceButton').click();
 await page.evaluate(()=>VikiMobile.selectView('chat'));
 await page.evaluate(()=>addMessage('Terminal typing test '.repeat(15),'assistant'));const latest=page.locator('#chatArea > .message').last();assert.ok(await latest.locator('.terminal-block-cursor').isVisible());await latest.locator('.terminal-skip').click();assert.equal(await latest.locator('.terminal-message-body').innerText(),'Terminal typing test '.repeat(15));
 await page.locator('#vikiLogo').click({clickCount:10});await page.waitForFunction(()=>document.getElementById('vikiLogo').textContent==="Anna & Abel 's System");
 await page.evaluate(()=>{setMoneyIndicator(1234);});
 await page.evaluate(()=>{databaseState.inventory=[{id:'badge',name:'milk',quantity:1,location:'fridge',category:'dairy',shelfLife:3,addedDate:new Date(Date.now()-86400000).toISOString()}];checkExpiringItems();});
 assert.equal(await page.locator('#expiringAlert').count(),0);assert.equal(await page.locator('#expiringCount').innerText(),'⚠︎ 1 item');
 await page.evaluate(()=>{rewardParticles=[];showCashReward(250);});assert.equal(await page.evaluate(()=>rewardParticles.length),0,'item rewards are float and sound only');
 await page.evaluate(()=>showCashReward(500,false,true));assert.ok(await page.evaluate(()=>rewardParticles.length)>0,'game wins retain particles');
 await page.evaluate(()=>VikiMobile.selectView('reminders'));assert.ok(await page.locator('#notificationGamesButton').isVisible());
assert.match(await page.locator('.header-cash-balance').innerText(),/1,234/);
 await page.evaluate(()=>VikiMobile.selectView('settings'));await page.locator('.theme-option[data-theme="red"]').click();
 page.removeAllListeners('dialog');page.on('dialog',d=>d.dismiss());await page.evaluate(()=>VikiMobile.selectView('chat'));assert.equal(await page.evaluate(()=>VikiMobile.appearance().theme),'custom','rejecting exit confirmation restores committed appearance');
 await page.screenshot({path:'/tmp/viki-beta-chat.png'});assert.deepEqual(errors,[]);console.log('PASS beta appearance preview/save/discard, CyberPunk Red, terminal typing/skip, notification-only registry, cash header and ten-tap title');
}finally{if(browser)await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});