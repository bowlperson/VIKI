/* Shared, side-effect-free notification planning for browsers and Android. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.VikiNotifications = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const DAY = 86400000;
    const DEFAULTS = Object.freeze({ enabled: false, dailySummary: true, summaryTime: '09:00', milestones: false, reminders: true });
    const timestamp = value => typeof value === 'number' ? value : Date.parse(value);
    const identity = value => encodeURIComponent(String(value));
    const repeatOf = value => ['daily', 'weekly', 'monthly'].includes(value) ? value : null;
    function options(settings) {
        const result = { ...DEFAULTS, ...settings };
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(result.summaryTime)) result.summaryTime = DEFAULTS.summaryTime;
        return result;
    }
    function digestBody(state, now = Date.now(), warningDays = 3) {
        const entries = (state.inventory || []).filter(item => Number(item.quantity) > 0).map(item => ({ item, left: (timestamp(item.addedDate) + Number(item.shelfLife) * DAY - now) / DAY })).filter(({left}) => Number.isFinite(left) && left <= warningDays);
        if (!entries.length) return '';
        const lines = entries.slice(0, 8).map(({item, left}) => `${String(item.name).slice(0, 100)}: ${left <= 0 ? 'expired' : `${Math.ceil(left)} day${Math.ceil(left) === 1 ? '' : 's'} left`}`);
        if (entries.length > 8) lines.push(`and ${entries.length - 8} more`);
        return lines.join('\n');
    }
    function plan(state = {}, settings = {}, now = Date.now()) {
        now = Number(now);
        if (!Number.isFinite(now)) throw new TypeError('A valid notification clock is required.');
        const config = options(settings);
        if (!config.enabled) return [];
        const events = [];
        if (config.dailySummary) {
            const [hour, minute] = config.summaryTime.split(':').map(Number);
            // Midnight-relative local calendar scheduling follows the phone's timezone.
            const next = new Date(now); next.setHours(hour, minute, 0, 0);
            if (next.getTime() <= now) next.setDate(next.getDate() + 1);
            events.push({ id: 'inventory-digest', at: next.getTime(), title: 'VIKI inventory summary', body: 'Review items approaching their shelf-life limit.', repeat: 'daily', kind: 'digest', warningDays: 3, calendarLocal: true, localTime: config.summaryTime });
        }
        if (config.milestones) for (const item of state.inventory || []) {
            const added = timestamp(item.addedDate), life = Number(item.shelfLife) * DAY;
            if (!Number.isFinite(added) || !Number.isFinite(life) || life <= 0 || Number(item.quantity) <= 0) continue;
            const batch = `${identity(item.id ?? item.name)}:${added}:${life}`;
            const stages = [
                { key: '30', at: added + life * .70, left: life * .30, body: '30% of shelf life remains.' },
                { key: '15', at: added + life * .85, left: life * .15, body: '15% of shelf life remains.' },
                { key: 'expired', at: added + life, left: 0, body: 'The stored shelf-life estimate has elapsed. Check this item.' }
            ].filter(stage => stage.key === 'expired' || stage.left > 3 * DAY);
            // Catch up only the most recent crossed milestone after offline time.
            const past = stages.filter(stage => stage.at <= now).pop();
            for (const stage of stages.filter(stage => stage === past || stage.at > now)) events.push({
                id: `inventory:${batch}:${stage.key}`, at: Math.round(stage.at), title: `VIKI: ${String(item.name).slice(0, 100)}`, body: stage.body, repeat: null, kind: 'milestone'
            });
        }
        // Refuse rather than silently lose schedules in pathological imports.
        if (events.length > 4096) throw new RangeError('Too many notification events. Reduce inventory alerts or reminders.');
        return events.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
    }
    // Returns the latest occurrence at/before now, or the future first occurrence.
    // Ledger keys must include this timestamp for recurring events, and only id for one-shots.
    function occurrenceAt(event, now = Date.now()) {
        const start = Number(event.at);
        if (!repeatOf(event.repeat) || now < start) return start;
        if (event.calendarLocal) {
            const first = new Date(start), date = new Date(now);
            date.setHours(first.getHours(), first.getMinutes(), first.getSeconds(), first.getMilliseconds());
            if (date.getTime() > now) date.setDate(date.getDate() - 1);
            return Math.max(start, date.getTime());
        }
        if (event.repeat !== 'monthly') {
            const interval = DAY * (event.repeat === 'weekly' ? 7 : 1);
            return start + Math.floor((now - start) / interval) * interval;
        }
        // Reminder calendar dates belong to Phoenix (UTC−07 year-round),
        // including evening reminders whose UTC date falls in the next month.
        const phoenixOffset = -7 * 60 * 60 * 1000;
        const first = new Date(start + phoenixOffset), current = new Date(now + phoenixOffset);
        let months = (current.getUTCFullYear() - first.getUTCFullYear()) * 12 + current.getUTCMonth() - first.getUTCMonth();
        function atMonth(offset) {
            const date = new Date(start + phoenixOffset); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + offset);
            const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
            date.setUTCDate(Math.min(first.getUTCDate(), lastDay)); return date.getTime() - phoenixOffset;
        }
        if (atMonth(months) > now) months--;
        return atMonth(Math.max(0, months));
    }
    return Object.freeze({ DEFAULTS, options, plan, digestBody, occurrenceAt });
});
