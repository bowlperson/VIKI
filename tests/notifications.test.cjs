const test = require('node:test');
const assert = require('node:assert/strict');
const {plan, digestBody, occurrenceAt} = require('../viki-notifications.js');
const DAY = 86400000;
const now = Date.parse('2026-11-06T12:00:00Z');
const item = (age, days = 100) => ({id: 1, name: 'beans', quantity: 1, addedDate: new Date(now - age * DAY).toISOString(), shelfLife: days});
const config = {enabled: true, dailySummary: false, milestones: true};
test('notifications are opt-in', () => assert.deepEqual(plan({inventory:[item(90)]}, {}, now), []));
test('offline catch-up only includes latest crossed stage; future expiry retained', () => {
 const events = plan({inventory:[item(90)]}, config, now);
 assert.equal(events.length, 2); assert.match(events[0].id, /:15$/); assert.match(events[1].id, /:expired$/);
 assert.deepEqual(events, plan({inventory:[item(90)]}, config, now + 1000));
});
test('expired stock gets one stable event, no old milestones', () => {
 const state = {inventory:[item(110)]};
 const events = plan(state, config, now); assert.equal(events.length,1); assert.match(events[0].id, /:expired$/);
 assert.equal(events[0].id,plan(state,config,now + DAY)[0].id);
});
test('short-lived stock avoids percentage warnings; zero quantity ignored', () => {
 assert.equal(plan({inventory:[item(1,7)]},config,now).length,1);
 assert.deepEqual(plan({inventory:[{...item(110),quantity:0}]},config,now),[]);
});
test('retired reminders never enter notification plans', () => {
 const reminder = {id:3,subject:'Check mail',reminder_datetime:new Date(now+DAY).toISOString(),second_reminder_datetime:new Date(now+2*DAY).toISOString(),repeat:'weekly',status:'sent'};
 const events=plan({reminders:[reminder]}, {enabled:true,dailySummary:false},now);
 assert.equal(events.length,0);
});
test('daily digest evaluates current inventory and skips empty inventory',()=>{
 assert.equal(digestBody({},now),'');
 assert.equal(digestBody({inventory:[item(99),item(10)]},now),'beans: 1 day left');
 const events=plan({}, {enabled:true},now);assert.equal(events[0].kind,'digest');assert.ok(events[0].at>now);
});
test('recurring occurrence keys advance and monthly dates clamp without drifting',()=>{
 const at=Date.parse('2026-01-31T16:00:00Z');
 assert.equal(occurrenceAt({at,repeat:'monthly'},Date.parse('2026-03-30T17:00:00Z')),Date.parse('2026-02-28T16:00:00Z'));
 assert.equal(occurrenceAt({at,repeat:'monthly'},Date.parse('2026-03-31T17:00:00Z')),Date.parse('2026-03-31T16:00:00Z'));
 assert.equal(occurrenceAt({at:now,repeat:'daily'},now+2.5*DAY),now+2*DAY);
});

test('monthly recurrence follows Phoenix calendar across UTC month boundaries', () => {
 const at = Date.parse('2026-01-31T23:30:00-07:00');
 const event = {at,repeat:'monthly'};
 assert.equal(occurrenceAt(event,Date.parse('2026-03-01T07:00:00Z')), Date.parse('2026-02-28T23:30:00-07:00'));
 assert.equal(occurrenceAt(event,Date.parse('2026-04-01T07:00:00Z')), Date.parse('2026-03-31T23:30:00-07:00'));
 const february = {at:Date.parse('2026-02-28T17:00:00-07:00'),repeat:'monthly'};
 assert.equal(occurrenceAt(february,Date.parse('2026-03-29T02:00:00Z')),Date.parse('2026-03-28T17:00:00-07:00'));
});
