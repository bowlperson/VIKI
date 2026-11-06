/* Exercise real browser directory handles using OPFS in place of a user-picked folder. */
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const root=path.resolve(__dirname,'..'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+(req.url==='/'?'/index.html':new URL(req.url,'http://local').pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,b)=>{if(e)return res.writeHead(404).end();res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(b);});});
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);await page.waitForSelector('#dataPayloadSize',{state:'attached'});await page.evaluate(()=>VikiMobile.selectView('settings'));await page.evaluate(()=>VikiMobile.selectSettingsCategory('storage'));
 assert.match(await page.locator('#storageLocation').innerText(),/IndexedDB/);
 assert.match(await page.locator('#dataPayloadSize').innerText(),/B/);
 await page.evaluate(()=>{window.showDirectoryPicker=()=>navigator.storage.getDirectory();});
 await page.locator('#chooseBackupFolderButton').click();
 const names=()=>page.evaluate(async()=>{const h=await navigator.storage.getDirectory(),names=[];for await(const n of h.keys())if(n.endsWith('.json'))names.push(n);return names;});
 await page.waitForFunction(async()=>{const h=await navigator.storage.getDirectory();let count=0;for await(const n of h.keys())if(n.endsWith('.json'))count++;return count===1;});
 const first=(await names())[0];assert.match(first,/^viki-backup-.*\.json$/);
 const exported=await page.evaluate(async name=>JSON.parse(await(await(await navigator.storage.getDirectory()).getFileHandle(name)).getFile().then(f=>f.text())),first);
 assert.equal(exported.schemaVersion,1);assert.ok(Array.isArray(exported.viki_inventory_v2));assert.ok(exported.exportedAt);
 // Weekly check skips byte-identical portable data, even though exportedAt changes.
 await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('viki_backup_preferences_v1'));p.weekly=true;p.lastCheck=0;localStorage.setItem('viki_backup_preferences_v1',JSON.stringify(p));});
 await page.reload();await page.waitForSelector('#backupStatus',{state:'attached'});await page.waitForFunction(()=>JSON.parse(localStorage.getItem('viki_backup_preferences_v1')).lastCheck>0);
 assert.equal((await names()).length,1,'unchanged weekly check does not make another file');
 // Change the inventory, then let the startup weekly check create an automatic copy.
 await page.evaluate(async()=>{const state=await VikiStorage.load();state.inventory=[{id:'backup-milk',name:'milk',quantity:2,category:'dairy',location:'fridge',shelfLife:7,addedDate:new Date().toISOString()}];await VikiStorage.save(state);const p=JSON.parse(localStorage.getItem('viki_backup_preferences_v1'));p.lastCheck=0;localStorage.setItem('viki_backup_preferences_v1',JSON.stringify(p));});
 await page.reload();await page.waitForFunction(async()=>{const h=await navigator.storage.getDirectory();let n=0;for await(const name of h.keys())if(name.startsWith('viki-weekly-'))n++;return n===1;});
 assert.equal((await names()).length,2);
 const size=await page.evaluate(()=>new TextEncoder().encode(JSON.stringify(getBackupPayload())).length);assert.ok(size<20_000,'small inventory backups remain compact');
 await page.evaluate(async()=>{const payload=getBackupPayload();payload.modelSettings={};validateImportPayload(payload);await applyImportedData(payload);});
 assert.equal(await page.evaluate(()=>localStorage.getItem('viki_no_llm')),'true','restoring an automatic backup keeps the safe offline default');
 assert.deepEqual(errors,[]);console.log('PASS folder-handle persistence, dated portable backup, exact data size, unchanged weekly skip, and changed weekly snapshot');
}finally{if(browser)await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
