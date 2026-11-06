const test = require('node:test');
const assert = require('node:assert/strict');
const inbox = require('../viki-inbox.js');
const at = Date.parse('2026-11-06T16:00:00Z');
const notification = {id:'native-event',occurrence:at,at:at+1000,title:'Eggs',body:'Check shelf life',status:'posted',read:false};

test('normalizes notification/email content without accepting invalid identities or time', () => {
    const entry=inbox.normalizeEntry({id:'email:1',kind:'email',title:'<img src=x>',body:'plain text',at:new Date(at).toISOString()});
    assert.equal(entry.kind,'email');assert.equal(entry.title,'<img src=x>');assert.equal(entry.at,at);assert.equal(entry.read,false);
    assert.throws(()=>inbox.normalizeEntry({id:'',at}),/identifier/);
    assert.throws(()=>inbox.normalizeEntry({id:'x',at:'not-a-date'}),/valid time/);
});

test('native archive merges stable occurrence identities and honors shade read/unread changes', () => {
    let entries=inbox.mergeNative([], [notification]);
    assert.equal(entries.length,1);assert.equal(entries[0].id,`native:native-event:${at}`);
    assert.equal(entries[0].nativeEventId,'native-event');assert.equal(entries[0].nativeOccurrence,at);
    entries=inbox.mergeNative(entries,[{...notification,read:true,status:'seen'}]);
    assert.equal(entries.length,1);assert.equal(entries[0].read,true);
    entries=inbox.mergeNative(entries,[{...notification,read:false,status:'seen'}]);
    assert.equal(entries[0].read,false,'explicit unread overrides historical Seen status');
    entries=inbox.mergeNative(entries,[{...notification,occurrence:at+86400000}]);
    assert.equal(entries.length,2,'different recurrence remains a separate archived notification');
});

test('cleared native entries remain dismissed rather than reappearing on archive refresh', () => {
    const id=`native:native-event:${at}`;
    assert.deepEqual(inbox.mergeNative([], [notification], [id]),[]);
});

test('filters keep email, unread and notification activity distinct without mutating source', () => {
    const entries=[{id:'n',kind:'notification',at,read:true},{id:'e',kind:'email',at:at+1,read:false}];
    assert.deepEqual(inbox.filterEntries(entries,'email').map(e=>e.id),['e']);
    assert.deepEqual(inbox.filterEntries(entries,'notifications').map(e=>e.id),['n']);
    assert.deepEqual(inbox.filterEntries(entries,'unread').map(e=>e.id),['e']);
    assert.deepEqual(entries.map(e=>e.id),['n','e']);
});

test('recording activity is durable, preserves existing read choice and rolls back failed saves', async () => {
    const state={};let saved,fail=false;
    await inbox.init({getState:()=>state,save:async()=>{if(fail)throw new Error('disk full');saved=JSON.parse(JSON.stringify(state));}});
    await inbox.record({id:'email:1',kind:'email',at,title:'Reminder sent',body:'Your reminder',status:'sent'});
    assert.equal(saved.inbox[0].status,'sent');
    await inbox.markRead('email:1',true);assert.equal(saved.inbox[0].read,true);
    await inbox.record({id:'email:1',kind:'email',at,title:'Reminder sent',body:'Updated text',read:false});
    assert.equal(state.inbox.length,1);assert.equal(state.inbox[0].read,true);
    fail=true;await assert.rejects(inbox.record({id:'email:2',at,title:'Retry'}),/disk full/);
    assert.equal(state.inbox.length,1,'failed write must not replace local activity');
});

test('native read actions update the same archived occurrence without changing its identity', async () => {
    const state={inbox:[inbox.nativeEntry(notification)]};const calls=[];
    global.VikiNative={markNotificationRead:(...args)=>{calls.push(args);return true;}};
    await inbox.init({getState:()=>state,save:async()=>{}});
    const id=state.inbox[0].id;
    await inbox.markRead(id,true);await inbox.markRead(id,false);
    assert.deepEqual(calls,[['native-event',at,true],['native-event',at,false]]);
    assert.equal(state.inbox[0].read,false);
    delete global.VikiNative;
});

test('prior browser ledger migrates once, preserves read state and respects dismissed messages', () => {
    const ledger={first:{title:'Old message',body:'Existing details',at,status:'seen'},empty:{title:'No items',body:'',at,status:'empty'},bad:{body:'Invalid time',at:'bad'}};
    const migrated=inbox.migrateLedger([],ledger);
    assert.equal(migrated.length,1);assert.equal(migrated[0].id,'browser:first');assert.equal(migrated[0].read,true);
    assert.deepEqual(inbox.migrateLedger(migrated,ledger),migrated,'existing record retains its own read state');
    assert.deepEqual(inbox.migrateLedger([],ledger,['browser:first']),[]);
});

test('email recipients remain portable data separate from body and are normalized as plain strings', () => {
    const entry=inbox.normalizeEntry({id:'email:recipients',kind:'email',at,recipients:[' operator@example.com ',null,'','partner@example.com']});
    assert.deepEqual(entry.recipients,['operator@example.com','partner@example.com']);
});


test('successful prior reminder emails migrate once without inventing missing deliveries', async () => {
 const state={reminders:[{id:'past',subject:'Remember eggs',body:'Bring a bag',recipients:['operator@example.com'],reminder_datetime:'2026-11-06T16:00:00Z',first_sent_at:'2026-11-06T16:01:00Z',second_reminder_datetime:'2026-11-06T20:00:00Z',second_sent_at:null}]};
 await inbox.init({getState:()=>state,save:async()=>{}});
 assert.equal(state.inbox.length,1);assert.equal(state.inbox[0].kind,'email');assert.equal(state.inbox[0].at,Date.parse('2026-11-06T16:01:00Z'));
 await inbox.markRead(state.inbox[0].id,true);
 await inbox.init({getState:()=>state,save:async()=>{}});assert.equal(state.inbox.length,1);assert.equal(state.inbox[0].read,true);
});
