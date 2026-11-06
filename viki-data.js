/* Storage visibility and portable dated backups. No cloud connection is required. */
(function(root){
'use strict';
let config,folder,busy=false,timer,refreshing=false;
const KEY='viki_backup_preferences_v1',WEEK=604800000;
const $=id=>document.getElementById(id);
function prefs(){try{return{weekly:false,retention:8,lastCheck:0,lastHash:'',...JSON.parse(localStorage.getItem(KEY)||'{}')};}catch{return{weekly:false,retention:8,lastCheck:0,lastHash:''};}}
function store(p){localStorage.setItem(KEY,JSON.stringify(p));}
function bytes(n){n=Math.max(0,Number(n)||0);return n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(2)} MB`;}
function node(tag,text){const el=document.createElement(tag);if(text)el.textContent=text;return el;}
function button(id,text,action){const el=node('button',text);el.id=id;el.type='button';el.className='config-button';el.onclick=()=>Promise.resolve().then(action).catch(report);return el;}
function report(error){$('backupStatus').textContent=`Backup needs attention: ${error.message||error}. Your active local data is unchanged.`;}
async function handles(mode,operation){return new Promise((resolve,reject)=>{const request=indexedDB.open('viki-backup-folder',1);request.onupgradeneeded=()=>request.result.createObjectStore('handles');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('handles',mode),r=operation(tx.objectStore('handles'));let result;r.onsuccess=()=>result=r.result;tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error);};};});}
async function refresh(){
 if(!config||refreshing)return;refreshing=true;
 try{
  const json=JSON.stringify(config.getState());const payloadBytes=new TextEncoder().encode(json).length;
  $('dataPayloadSize').textContent=bytes(payloadBytes);
  $('storageLocation').textContent=window.VikiNative?'Android app-private SQLite database':`${location.origin} · IndexedDB / viki-local`;
  if(window.VikiNative?.storageInfo){
   const info=JSON.parse(VikiNative.storageInfo());
   $('databaseSize').textContent=bytes(info.databaseBytes);
   $('storageLocation').textContent=info.databasePath||'Android app-private SQLite database';
   $('backupFolderLocation').textContent=info.folderName||'No backup folder selected';
   $('backupFolderSize').textContent=`${bytes(info.backupBytes)} in ${info.backupCount||0} VIKI backup files`;
   $('weeklyBackupEnabled').checked=Boolean(info.weeklyEnabled);$('backupRetention').value=String(info.retention||8);
   $('backupLastSaved').textContent=info.lastBackupAt?new Date(info.lastBackupAt).toLocaleString():'Not yet';
   $('backupStatus').textContent=info.error||(info.weeklyEnabled&&!info.folderUri?'Choose a backup folder to activate weekly backups.':'Database size is read from disk. Backup totals update after backup operations. Weekly copies skip unchanged data.');
  }else{
   const estimate=await navigator.storage?.estimate?.();$('databaseSize').textContent=estimate?.usage==null?'Unavailable':`${bytes(estimate.usage)} (browser estimate, includes offline cache)`;
   const p=prefs();$('weeklyBackupEnabled').checked=p.weekly;$('backupRetention').value=String(p.retention);
   $('backupFolderLocation').textContent=folder?.name||'Browser download folder / choose on export';
   $('backupLastSaved').textContent=p.lastBackup?new Date(p.lastBackup).toLocaleString():'Not yet';
   $('backupFolderSize').textContent=p.count==null?'Not scanned':`${bytes(p.backupBytes)} in ${p.count} VIKI backup files`;
   if(p.weekly&&!folder&&root.showDirectoryPicker)$('backupStatus').textContent='Choose a backup folder to activate weekly backups.';
  }
 }catch(error){report(error);}finally{refreshing=false;}
}
async function chooseFolder(){
 if(window.VikiNative?.chooseBackupFolder){VikiNative.chooseBackupFolder();return;}
 if(!root.showDirectoryPicker){config.exportData();return;}
 try{folder=await root.showDirectoryPicker({id:'viki-backups',mode:'readwrite'});await handles('readwrite',s=>s.put(folder,'folder'));const p=prefs();p.lastHash='';store(p);await backup(true);}
 catch(error){if(error.name!=='AbortError')throw error;}
 await refresh();
}
async function hash(text){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
async function browserFiles(){const files=[];for await(const [name,handle] of folder.entries())if(handle.kind==='file'&&/^viki-(weekly|backup)-.*\.json$/.test(name))files.push({name,handle});return files;}
async function backup(force=false){
 if(window.VikiNative?.backupNow){if(force){if(VikiNative.storageInfo&&!JSON.parse(VikiNative.storageInfo()).folderUri)await chooseFolder();else VikiNative.backupNow();}return;}
 if(busy)return;const p=prefs();if(!force&&(!p.weekly||Date.now()-p.lastCheck<WEEK))return;
 if(!folder){if(force)await chooseFolder();return;}
 busy=true;
 try{
  if(await folder.queryPermission({mode:'readwrite'})!=='granted')throw Error('Open Choose backup folder to renew access');
  const payload=config.getBackupPayload();delete payload.exportedAt;
  const checksum=await hash(JSON.stringify(payload));p.lastCheck=Date.now();
  if(!force&&checksum===p.lastHash){store(p);$('backupStatus').textContent='Weekly check complete: data is unchanged, so no extra file was created.';return;}
  payload.exportedAt=new Date().toISOString();
  const stamp=payload.exportedAt.replace('T','_').replace(/:/g,'-').replace(/\.\d+Z$/,'');
  const name=`viki-${force?'backup':'weekly'}-${stamp}-${crypto.randomUUID().slice(0,8)}.json`;
  const handle=await folder.getFileHandle(name,{create:true}),stream=await handle.createWritable();const text=JSON.stringify(payload);
  await stream.write(text);await stream.close();
  if(await (await handle.getFile()).text()!==text)throw Error('Saved backup did not match the original data');
  const files=await browserFiles(),weekly=files.filter(f=>/^viki-weekly-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-[a-f0-9]{8}\.json$/.test(f.name)).sort((a,b)=>b.name.localeCompare(a.name));
  for(const old of weekly.slice(p.retention))await folder.removeEntry(old.name);
  const kept=await browserFiles();p.count=kept.length;p.backupBytes=0;for(const f of kept)p.backupBytes+=(await f.handle.getFile()).size;
  p.lastHash=checksum;p.lastBackup=Date.now();store(p);$('backupStatus').textContent=`Saved ${name}.`;
 }catch(error){p.lastCheck=Date.now()-WEEK+86400000;store(p);report(error);}
 finally{busy=false;await refresh();}
}
async function init(options){
 config=options;
 const section=$('localStorageStatus').closest('.settings-section');
 const heading=node('h3','Storage & dated backups');heading.className='storage-subheading';section.append(heading);
 const stats=node('dl');stats.className='storage-metrics';
 for(const [label,id] of [['Active data location','storageLocation'],['Data JSON size (live)','dataPayloadSize'],['Database & cache on disk','databaseSize'],['Backup folder','backupFolderLocation'],['Backup files (last scan)','backupFolderSize'],['Last successful backup','backupLastSaved']]){stats.append(node('dt',label));const value=node('dd','Calculating…');value.id=id;stats.append(value);}section.append(stats);
 const actions=node('div');actions.className='config-actions';actions.append(button('chooseBackupFolderButton','Choose backup folder',chooseFolder),button('backupNowButton','Save dated backup now',()=>backup(true)),button('refreshStorageButton','Refresh sizes',refresh));section.append(actions);
 const weekly=node('label');weekly.className='toggle-row';const check=node('input');check.type='checkbox';check.id='weeklyBackupEnabled';weekly.append(check,node('span','Back up weekly when data changes'));section.append(weekly);
 const keep=node('label','Keep automatic weekly copies');keep.className='appearance-field';const select=node('select');select.id='backupRetention';select.className='config-select';for(const n of [4,8,12]){const option=node('option',`${n} weekly copies`);option.value=n;select.append(option);}keep.append(select);section.append(keep);
 const note=node('p','Android keeps the active database in app-private storage. Choose another folder for portable JSON copies. Backups are unencrypted JSON; choose a local folder you control. Only automatic weekly files are rotated; manual exports are kept. SQLite reuses freed space, so its disk allocation can remain steady after deletions. Browser automatic backups require this app to be open and folder access to remain granted.');note.className='config-help';section.append(note);
 const status=node('p');status.id='backupStatus';status.className='config-help';status.setAttribute('role','status');section.append(status);
 check.onchange=async()=>{if(window.VikiNative?.setWeeklyBackups)VikiNative.setWeeklyBackups(check.checked);else{const p=prefs();p.weekly=check.checked;store(p);if(p.weekly)await backup(false);}await refresh();};
 select.onchange=async()=>{if(window.VikiNative?.setBackupRetention)VikiNative.setBackupRetention(Number(select.value));else{const p=prefs();p.retention=Number(select.value);store(p);}await refresh();};
 if(!window.VikiNative){try{folder=await handles('readonly',s=>s.get('folder'));}catch{ /* Ordinary downloads/imports remain available. */ }if(!root.showDirectoryPicker){check.disabled=true;select.disabled=true;status.textContent='This browser supports manual file export/import. Automatic folder backups are available in the Android APK or a browser with folder access.';}}
 root.addEventListener('viki-native-error',event=>report(event.detail));
 root.addEventListener('viki-storage-change',refresh);root.addEventListener('viki-native-resume',refresh);root.addEventListener('viki-view-change',event=>{if(event.detail?.view==='settings')void refresh();});
 setInterval(()=>{if(document.body.dataset.vikiView==='settings')void refresh();},30000);
 if(!window.VikiNative)setInterval(()=>void backup(false),30*60*1000);
 await refresh();if(!window.VikiNative)void backup(false);
}
function changed(){clearTimeout(timer);timer=setTimeout(()=>void refresh(),200);}
root.VikiData=Object.freeze({init,refresh,changed,bytes});
})(window);
