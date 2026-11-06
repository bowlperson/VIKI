/* Local activity history shared by the browser and bundled Android interface. */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.VikiInbox = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';
    let config, panel, tabs, list, errorLabel;
    let visible = false, section = 'scheduled', selectedFilter = 'all', displayCount = 30;
    let importing = false;
    let sequence = 0;
    let pending = Promise.resolve();
    function enqueue(action) {
        const result = pending.catch(() => {}).then(action);
        pending = result;
        return result;
    }
    const revealed = new Set();
    const value = (input, max = 8000) => String(input ?? '').slice(0, max);

    function normalizeEntry(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid inbox entry.');
        const at = typeof input.at === 'number' ? input.at : Date.parse(input.at);
        if (!Number.isFinite(at)) throw new TypeError('Inbox entries need a valid time.');
        const id = value(input.id, 4096);
        if (!id) throw new TypeError('Inbox entries need an identifier.');
        const result = {
            id, kind: input.kind === 'email' ? 'email' : 'notification',
            title: value(input.title || (input.kind === 'email' ? 'Email activity' : 'VIKI notification'), 300),
            body: value(input.body), at,
            status: value(input.status || 'delivered', 80), read: Boolean(input.read)
        };
        if (Array.isArray(input.recipients)) result.recipients = input.recipients.filter(entry => typeof entry === 'string' && entry.trim()).slice(0, 100).map(entry => entry.trim().slice(0, 320));
        if (input.nativeEventId != null && Number.isFinite(Number(input.nativeOccurrence))) {
            result.nativeEventId = value(input.nativeEventId, 2048);
            result.nativeOccurrence = Number(input.nativeOccurrence);
        }
        return result;
    }

    function nativeEntry(entry) {
        const id = value(entry.eventId ?? entry.id, 2048);
        const occurrence = Number(entry.occurrence);
        if (!id || !Number.isFinite(occurrence)) throw new TypeError('Invalid Android history identifier.');
        return normalizeEntry({
            id: `native:${id}:${occurrence}`, kind: 'notification',
            title: entry.title || 'VIKI notification', body: entry.body || '',
            at: entry.at ?? occurrence, status: entry.status,
            read: typeof entry.read === 'boolean' ? entry.read : ['seen', 'snoozed'].includes(entry.status),
            nativeEventId: id, nativeOccurrence: occurrence
        });
    }

    function mergeNative(existing, incoming, dismissed = []) {
        const ignored = new Set(dismissed);
        const entries = new Map(existing.map(entry => [entry.id, entry]));
        for (const raw of incoming) {
            const entry = nativeEntry(raw);
            if (!ignored.has(entry.id)) entries.set(entry.id, { ...entries.get(entry.id), ...entry });
        }
        return [...entries.values()].sort((a, b) => b.at - a.at);
    }

    function migrateLedger(existing, ledger = {}, dismissed = []) {
        const ignored = new Set(dismissed), entries = new Map(existing.map(entry => [entry.id, entry]));
        for (const [key, entry] of Object.entries(ledger)) {
            const id = `browser:${key}`;
            if (!entry || !entry.body || entries.has(id) || ignored.has(id)) continue;
            try { entries.set(id, normalizeEntry({ ...entry, id, kind: 'notification', read: ['seen', 'snoozed', 'read'].includes(entry.status) })); }
            catch (error) { /* Empty or corrupt old ledger rows never reset the current inbox. */ }
        }
        return [...entries.values()].sort((a, b) => b.at - a.at);
    }

    async function migrateBrowserHistory() {
        const current = entries();
        const ledger = { ...(state().notificationHistory || {}) };
        const migrated = migrateLedger(current, ledger, state().inboxDismissed || []);
        const ids=new Set([...migrated.map(e=>e.id), ...(state().inboxDismissed || [])]);
        for(const reminder of state().reminders || [])for(const [number,sent,scheduled] of [[1,reminder.first_sent_at,reminder.reminder_datetime],[2,reminder.second_sent_at,reminder.second_reminder_datetime]]){
            if(!sent||!scheduled||!Number.isFinite(Date.parse(sent)))continue;
            const id=`email:reminder:${reminder.id}:${number}:${scheduled}`;
            if(!ids.has(id)){migrated.push(normalizeEntry({id,kind:'email',title:reminder.subject,body:reminder.body,recipients:reminder.recipients,at:Date.parse(sent),status:'sent'}));ids.add(id);}
        }
        migrated.sort((a,b)=>b.at-a.at);
        if (JSON.stringify(migrated) === JSON.stringify(current)) return;
        state().inbox = migrated;
        try { await save(); } catch (error) { state().inbox = current; throw error; }
    }

    function filterEntries(entries, filter = 'all') {
        return entries.filter(entry => filter === 'unread' ? !entry.read : filter === 'notifications' ? entry.kind === 'notification' : filter === 'email' ? entry.kind === 'email' : true)
            .sort((a, b) => b.at - a.at);
    }

    function state() {
        if (!config) throw new Error('Activity inbox is not initialized.');
        return config.getState();
    }
    function entries() { return Array.isArray(state().inbox) ? state().inbox : []; }
    async function save() { await config.save(); }
    function report(error) { if (errorLabel) errorLabel.textContent = `History could not be saved: ${error.message || error}`; }

    async function record(input) {
        const now = Date.now();
        const entry = normalizeEntry({ ...input, id: input.id || `activity:${now}:${++sequence}`, at: input.at ?? now });
        const current = entries();
        const previous = current.find(item => item.id === entry.id);
        const updated = previous ? { ...entry, read: previous.read } : entry;
        state().inbox = [updated, ...current.filter(item => item.id !== entry.id)].sort((a, b) => b.at - a.at);
        try { await save(); render(); return updated; }
        catch (error) { state().inbox = current; report(error); throw error; }
    }

    async function markRead(id, read = true) {
        const current = entries();
        const entry = current.find(item => item.id === id);
        if (!entry) return;
        const native = root.VikiNative;
        if (entry.nativeEventId && native?.markNotificationRead) {
            if (native.markNotificationRead(entry.nativeEventId, entry.nativeOccurrence, Boolean(read)) === false) throw new Error('Android could not save the read state.');
        }
        state().inbox = current.map(item => item.id === id ? { ...item, read: Boolean(read) } : item);
        revealed.delete(id);
        try { await save(); render(); }
        catch (error) { state().inbox = current; report(error); throw error; }
    }

    async function markAllRead() {
        const current = entries();
        for (const entry of current.filter(item => !item.read && item.nativeEventId)) {
            if (root.VikiNative?.markNotificationRead && root.VikiNative.markNotificationRead(entry.nativeEventId, entry.nativeOccurrence, true) === false) throw new Error('Android could not save the read state.');
        }
        state().inbox = current.map(entry => ({ ...entry, read: true }));
        revealed.clear();
        try { await save(); render(); }
        catch (error) { state().inbox = current; report(error); throw error; }
    }

    async function clearRead() {
        const current = entries(), removed = current.filter(entry => entry.read);
        if (!removed.length) return;
        if (!root.confirm(`Remove ${removed.length} read message(s) from this device’s activity inbox? Scheduled reminders are kept.`)) return;
        for(const entry of removed)if(entry.nativeEventId&&root.VikiNative?.clearNotificationHistoryEntry){
            if(root.VikiNative.clearNotificationHistoryEntry(entry.nativeEventId,entry.nativeOccurrence)===false)throw new Error('Android could not clear the selected archive entry.');
        }
        const previousDismissed = state().inboxDismissed;
        state().inboxDismissed = [...new Set([...(previousDismissed || []), ...removed.map(entry => entry.id)])];
        state().inbox = current.filter(entry => !entry.read);
        try { await save(); render(); }
        catch (error) { state().inbox = current; state().inboxDismissed = previousDismissed || []; report(error); throw error; }
    }

    function node(tag, className, text) {
        const element = root.document.createElement(tag);
        if (className) element.className = className;
        if (text != null) element.textContent = text;
        return element;
    }
    function button(text, action) {
        const element = node('button', 'config-button', text); element.type = 'button';
        element.addEventListener('click', () => { Promise.resolve().then(action).catch(report); });
        return element;
    }

    function setSection(next) { section = next === 'history' ? 'history' : 'scheduled'; render(); applyVisibility(); }
    function applyVisibility() {
        if (!panel || !tabs) return;
        panel.hidden = !visible || section !== 'history';
        tabs.hidden = !visible;
        const inventory = root.document.getElementById('inventoryList');
        if (inventory) inventory.hidden = visible && section === 'history';
        const recipientFilter = root.document.getElementById('reminderFilterContent');
        if (visible && recipientFilter) recipientFilter.hidden = section === 'history';
        tabs.querySelectorAll('button').forEach(item => {
            const active = item.dataset.section === section;
            item.classList.toggle('active', active);
            item.setAttribute('aria-selected', String(active));
        });
    }
    function setVisible(value) { visible = Boolean(value); applyVisibility(); if (visible) void enqueue(refresh).catch(report); }

    function render() {
        if (!panel || !config) return;
        const current = entries();
        const unread = current.filter(entry => !entry.read).length;
        const historyTab = tabs.querySelector('[data-section="history"]');
        historyTab.textContent = unread ? `History · ${unread} unread` : 'History';
        const heading = panel.querySelector('h2');
        heading.textContent = `Activity inbox · ${unread} unread`;
        const shown = filterEntries(current, selectedFilter);
        list.replaceChildren();
        if (!shown.length) list.append(node('p', 'config-help viki-inbox-empty', 'No activity here yet. Delivered notifications and email attempts will appear on this device.'));
        for (const entry of shown.slice(0, displayCount)) {
            const card = node('article', `viki-inbox-card ${entry.read ? 'is-read' : 'is-unread'}`);
            card.dataset.inboxId = entry.id;
            const meta = node('div', 'viki-inbox-meta', `${entry.kind === 'email' ? 'EMAIL' : 'NOTIFICATION'} · ${new Date(entry.at).toLocaleString()} · ${entry.status}`);
            const message = node('div', 'viki-inbox-message');
            message.append(node('h3', '', entry.title), node('p', '', entry.body));
            if (entry.recipients?.length) message.append(node('p', 'viki-inbox-recipients', `To: ${entry.recipients.join(', ')}`));
            const concealed = entry.read && !revealed.has(entry.id);
            message.style.filter = concealed ? 'blur(5px)' : '';
            message.style.userSelect = concealed ? 'none' : '';
            message.setAttribute('aria-hidden', String(concealed));
            card.classList.toggle('is-revealed', !concealed);
            const actions = node('div', 'viki-inbox-actions');
            if (entry.read) {
                actions.append(button(concealed ? 'Reveal read message' : 'Hide read message', () => {
                    if (revealed.has(entry.id)) revealed.delete(entry.id); else revealed.add(entry.id);
                    render();
                }));
            }
            actions.append(button(entry.read ? 'Mark unread' : 'Mark read', () => enqueue(() => markRead(entry.id, !entry.read))));
            card.append(meta, message, actions); list.append(card);
        }
        if (shown.length > displayCount) list.append(button(`Show more (${shown.length - displayCount})`, () => { displayCount += 30; render(); }));
        panel.querySelector('#inboxClearReadButton').disabled = !current.some(entry => entry.read);
        panel.querySelector('#inboxMarkAllReadButton').disabled = unread === 0;
        applyVisibility();
    }

    async function refresh() {
        render();
        const native = root.VikiNative;
        if (!config || importing || !native?.listNotificationHistory) return;
        importing = true;
        try {
            const incoming = JSON.parse(native.listNotificationHistory());
            if (!Array.isArray(incoming)) throw new Error('Invalid Android history response.');
            const current = entries();
            const merged = mergeNative(current, incoming, state().inboxDismissed || []);
            if (JSON.stringify(merged) !== JSON.stringify(current)) { state().inbox = merged; try { await save(); } catch (error) { state().inbox = current; throw error; } }
            render();
        } finally { importing = false; }
    }

    function init(options) {
        if (!options || typeof options.getState !== 'function' || typeof options.save !== 'function') throw new TypeError('Inbox needs local state and save callbacks.');
        config = options;
        if (!root.document) return enqueue(migrateBrowserHistory);
        panel = root.document.getElementById('reminderHistoryPanel');
        const inventory = root.document.getElementById('inventoryList');
        if (!panel) {
            panel = node('section', 'viki-inbox'); panel.id = 'reminderHistoryPanel';
            (root.document.getElementById('registrySidebar') || inventory?.parentElement || root.document.body).append(panel);
        }
        panel.classList.add('viki-inbox'); panel.setAttribute('aria-label', 'Notification and email activity history');
        panel.replaceChildren(node('h2', '', 'Activity inbox'));
        const toolbar = node('div', 'viki-inbox-toolbar');
        const filter = node('select', 'config-select'); filter.id = 'inboxFilter'; filter.setAttribute('aria-label', 'Filter activity history');
        for (const [key, label] of [['all','All activity'],['unread','Unread'],['notifications','Notifications'],['email','Email']]) {
            const option = node('option', '', label); option.value = key; filter.append(option);
        }
        filter.value = selectedFilter;
        filter.addEventListener('change', () => { selectedFilter = filter.value; displayCount = 30; render(); });
        const allRead = button('Mark all read', () => enqueue(markAllRead)); allRead.id = 'inboxMarkAllReadButton';
        const clear = button('Clear read', () => enqueue(clearRead)); clear.id = 'inboxClearReadButton';
        toolbar.append(filter, allRead, clear); panel.append(toolbar);
        panel.append(node('p', 'config-help', 'Read message contents are blurred. Reveal them when needed. Email entries track this app’s sends and failures; VIKI does not read your mailbox.'));
        errorLabel = node('p', 'config-help'); errorLabel.id = 'inboxStatus'; errorLabel.setAttribute('role', 'status'); panel.append(errorLabel);
        list = node('div', 'viki-inbox-list'); list.id = 'inboxList'; panel.append(list);
        tabs = root.document.getElementById('reminderInboxTabs');
        if (!tabs) { tabs = node('div', 'viki-inbox-tabs'); tabs.id = 'reminderInboxTabs'; inventory?.before(tabs); }
        tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Reminder views'); tabs.replaceChildren();
        for (const [key, label] of [['scheduled','Scheduled'],['history','History']]) {
            const tab = button(label, () => setSection(key)); tab.dataset.section = key; tab.setAttribute('role', 'tab'); tabs.append(tab);
        }
        applyVisibility();
        root.addEventListener?.('viki-native-resume', () => { void enqueue(refresh).catch(report); });
        return enqueue(async () => { await migrateBrowserHistory(); await refresh(); });
    }

    return Object.freeze({ init, record: input => enqueue(() => record(input)), markRead: (id, read) => enqueue(() => markRead(id, read)), markAllRead: () => enqueue(markAllRead), refresh: () => enqueue(refresh), setVisible, setSection, normalizeEntry, nativeEntry, mergeNative, migrateLedger, filterEntries });
});
