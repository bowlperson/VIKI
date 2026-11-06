/* Shared durable state store. This file has no network or Supabase dependency. */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.VikiStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';
    const SCHEMA_VERSION = 1;
    const DB_NAME = 'viki-local';
    const STORE_NAME = 'state';
    const STATE_KEY = 'current';
    const native = root.VikiNative;
    let opening;
    let writerLock;
    let pending = Promise.resolve();

    function object(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value)
            && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
    }

    function assertSafe(value, ancestors = new Set()) {
        if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
        if (typeof value === 'number' && Number.isFinite(value)) return;
        if (typeof value !== 'object' || (!Array.isArray(value) && !object(value))) {
            throw new Error('Local state must contain only finite JSON values.');
        }
        if (ancestors.has(value)) throw new Error('Local state cannot contain circular references.');
        ancestors.add(value);
        for (const key of Object.keys(value)) {
            if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
                throw new Error('Unsafe property in local state.');
            }
            // Existing data occasionally has optional undefined properties. JSON omits these.
            if (value[key] !== undefined) assertSafe(value[key], ancestors);
        }
        ancestors.delete(value);
    }

    const text = value => typeof value === 'string';
    const nonempty = value => text(value) && value.trim().length > 0;
    const numeric = value => (typeof value === 'number' || (text(value) && value.trim() !== '')) && Number.isFinite(Number(value));
    const date = value => nonempty(value) && Number.isFinite(Date.parse(value));
    const identifier = value => nonempty(value) || (typeof value === 'number' && Number.isFinite(value));
    const optionalId = entry => entry.id === undefined || identifier(entry.id);
    const category = entry => object(entry) && numeric(entry.days) && Number(entry.days) > 0
        && text(entry.category) && text(entry.location)
        && (entry.tags === undefined || (Array.isArray(entry.tags) && entry.tags.every(text)));
    function validateEntries(state) {
        if (!state.inventory.every(item => object(item) && optionalId(item) && nonempty(item.name)
            && numeric(item.quantity) && Number(item.quantity) >= 0 && text(item.location)
            && text(item.category) && date(item.addedDate) && numeric(item.shelfLife) && Number(item.shelfLife) > 0)) {
            throw new Error('Invalid inventory entry in local state.');
        }
        if (!Object.values(state.presets).every(category) || !Object.values(state.favoriteRules).every(category)) {
            throw new Error('Invalid preset or favorite rule in local state.');
        }
        if (!state.reminders.every(entry => object(entry) && optionalId(entry) && nonempty(entry.subject)
            && text(entry.body) && date(entry.reminder_datetime)
            && (entry.second_reminder_datetime == null || date(entry.second_reminder_datetime))
            && Array.isArray(entry.recipients) && entry.recipients.every(value => text(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
            && (entry.repeat == null || ['none', 'daily', 'weekly', 'monthly'].includes(entry.repeat))
            && ['pending', 'sent', 'cancelled', 'deleted'].includes(entry.status))) {
            throw new Error('Invalid reminder entry in local state.');
        }
        if (!(state.cashProfiles || []).every(entry => object(entry) && identifier(entry.id)
            && nonempty(entry.name) && numeric(entry.balance) && Number(entry.balance) >= 0)) {
            throw new Error('Invalid cash profile in local state.');
        }
    }

    function validate(state) {
        if (!object(state) || !Array.isArray(state.inventory) || !Array.isArray(state.reminders)
            || !object(state.presets) || !object(state.favoriteRules)
            || (state.cashProfiles !== undefined && !Array.isArray(state.cashProfiles))) {
            throw new Error('Invalid local state: inventory/reminders must be arrays and presets/favoriteRules must be objects.');
        }
        assertSafe(state);
        validateEntries(state);
        const copy = JSON.parse(JSON.stringify(state));
        if (copy.cashProfiles === undefined) copy.cashProfiles = [];
        return copy;
    }

    function decode(record) {
        if (record === null || record === undefined || record === '') return null;
        if (typeof record === 'string') record = JSON.parse(record);
        // Accept state stored by an earlier native wrapper without an envelope.
        if (object(record) && Object.hasOwn(record, 'schemaVersion')) {
            if (record.schemaVersion !== SCHEMA_VERSION) throw new Error('Unsupported local storage schema. Export or upgrade before continuing.');
            return validate(record.state);
        }
        return validate(record);
    }

    function ensureWriterLock() {
        if (native) return Promise.resolve();
        if (!writerLock) writerLock = new Promise((resolve, reject) => {
            if (!root.navigator?.locks?.request) {
                reject(new Error('This browser does not support safe VIKI storage locking. Use a current browser on localhost or HTTPS.'));
                return;
            }
            // The browser automatically releases this lock when the page is closed or reloaded.
            root.navigator.locks.request('viki-local-writer', { ifAvailable: true }, lock => {
                if (!lock) {
                    reject(new Error('VIKI is open in another tab. Close it and reload this page to protect your local data.'));
                    return;
                }
                resolve();
                return new Promise(() => {});
            }).catch(reject);
        });
        return writerLock;
    }

    function open() {
        if (!root.indexedDB) return Promise.reject(new Error('IndexedDB unavailable. Open VIKI through a local web server in a browser with site storage enabled.'));
        if (!opening) {
            opening = new Promise((resolve, reject) => {
                const request = root.indexedDB.open(DB_NAME, SCHEMA_VERSION);
                request.onupgradeneeded = () => {
                    if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
                };
                request.onerror = () => reject(request.error || new Error('Cannot open local database.'));
                request.onblocked = () => reject(new Error('Local database upgrade blocked. Close other VIKI tabs and retry.'));
                request.onsuccess = () => {
                    const db = request.result;
                    db.onversionchange = () => { db.close(); opening = undefined; };
                    resolve(db);
                };
            }).catch(error => { opening = undefined; throw error; });
        }
        return opening;
    }

    async function transaction(mode, operation) {
        await ensureWriterLock();
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, mode);
            let result;
            const request = operation(tx.objectStore(STORE_NAME));
            request.onsuccess = () => { result = request.result; };
            tx.oncomplete = () => resolve(result);
            tx.onerror = () => reject(tx.error || request.error || new Error('Local database operation failed.'));
            tx.onabort = () => reject(tx.error || new Error('Local database write aborted.'));
        });
    }

    async function load() {
        await pending;
        const record = native ? native.readState() : await transaction('readonly', store => store.get(STATE_KEY));
        return decode(record);
    }

    function save(state) {
        // Snapshot at call time, before another UI command can mutate the same object.
        let snapshot;
        try { snapshot = validate(state); } catch (error) { return Promise.reject(error); }
        const record = { schemaVersion: SCHEMA_VERSION, state: snapshot };
        pending = pending.catch(() => {}).then(async () => {
            if (native) {
                const result = native.writeState(JSON.stringify(record));
                if (result === false) throw new Error('Android local database write failed.');
            } else {
                await transaction('readwrite', store => store.put(record, STATE_KEY));
            }
            return snapshot;
        });
        return pending;
    }

    return Object.freeze({
        schemaVersion: SCHEMA_VERSION,
        backend: native ? 'sqlite' : 'indexeddb',
        load, save, validate,
        flush: () => pending
    });
});
