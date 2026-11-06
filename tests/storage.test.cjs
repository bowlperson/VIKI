const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../viki-storage.js'), 'utf8');
const state = () => ({ inventory: [], presets: {}, favoriteRules: {}, reminders: [], cashProfiles: [] });
function store(bridge) {
    const context = vm.createContext({ VikiNative: bridge, module: { exports: {} } });
    vm.runInContext(source, context);
    return { api: context.module.exports, make: (value = state()) => vm.runInContext('(' + JSON.stringify(value) + ')', context) };
}

test('native adapter snapshots queued writes, preserves order and roundtrips state', async () => {
    let record;
    const writes = [];
    const {api, make} = store({readState: () => record, writeState: json => {record=json;writes.push(JSON.parse(json));}});
    assert.equal(api.backend, 'sqlite');
    assert.equal(await api.load(), null);
    const initial = make();
    const first = api.save(initial);
    initial.inventory.push(make({inventory:[{id:1,name:'milk',quantity:1,location:'fridge',category:'dairy',addedDate:'2026-01-01T00:00:00Z',shelfLife:7}],presets:{},favoriteRules:{},reminders:[]}).inventory[0]);
    const second = api.save(initial);
    await Promise.all([first,second]);
    assert.equal(writes[0].state.inventory.length, 0);
    assert.equal(writes[1].state.inventory.length, 1);
    assert.equal(writes[1].schemaVersion, 1);
    assert.equal((await api.load()).inventory[0].name,'milk');
});

test('native failures are reported and later commits recover', async () => {
    let failure = true;
    const {api,make} = store({readState:()=>null,writeState:()=>{if(failure)throw Error('disk full');}});
    await assert.rejects(api.save(make()),/disk full/);
    await assert.rejects(api.flush(),/disk full/);
    failure=false;
    await api.save(make());
    await api.flush();
});

test('corrupt or unsupported records never silently become empty state', async () => {
    for (const record of ['bad json','{}','{"schemaVersion":99,"state":{}}']) {
        const {api}=store({readState:()=>record});
        await assert.rejects(api.load());
    }
});

test('legacy state loads; unsafe keys and invalid shapes are rejected', async () => {
    const {api,make}=store({readState:()=>JSON.stringify(state())});
    assert.equal((await api.load()).inventory.length,0);
    const invalid=make();invalid.inventory={};
    await assert.rejects(api.save(invalid),/Invalid local state/);
    const unsafe=make();Object.defineProperty(unsafe.presets,'__proto__',{value:{},enumerable:true});
    await assert.rejects(api.save(unsafe),/Unsafe property/);
});


test('invalid domain records are rejected before either backend can persist them', async () => {
    let writes=0;
    const {api,make}=store({readState:()=>null,writeState:()=>{writes++;}});
    for(const field of ['inventory','reminders','cashProfiles']){
        const bad=state();bad[field]=[null];
        await assert.rejects(api.save(make(bad)),/Invalid/);
    }
    for(const field of ['presets','favoriteRules']){
        const bad=state();bad[field]={milk:null};
        await assert.rejects(api.save(make(bad)),/Invalid/);
    }
    const item={id:1,name:'milk',quantity:1,location:'fridge',category:'dairy',addedDate:'2026-01-01T00:00:00Z',shelfLife:7};
    for(const invalid of [{quantity:-1},{shelfLife:0},{addedDate:'bad'},{name:''},{quantity:null}]){
        const bad=state();bad.inventory=[{...item,...invalid}];
        await assert.rejects(api.save(make(bad)),/Invalid inventory/);
    }
    const bad=state();bad.cashProfiles=[{id:'test',name:'Person',balance:-1}];
    await assert.rejects(api.save(make(bad)),/Invalid cash profile/);
    assert.equal(writes,0);
});
