package dev.viki.app;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class VikiDatabase extends SQLiteOpenHelper {
    private static VikiDatabase instance;
    static synchronized VikiDatabase get(Context context) {
        if (instance == null) instance = new VikiDatabase(context.getApplicationContext());
        return instance;
    }
    private VikiDatabase(Context context) { super(context, "viki.db", null, 2); }
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE app_state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)");
        db.execSQL("CREATE TABLE events (id TEXT PRIMARY KEY, at INTEGER NOT NULL, value TEXT NOT NULL, snooze INTEGER NOT NULL DEFAULT 0)");
        db.execSQL("CREATE INDEX events_due ON events(at)");
        db.execSQL("CREATE TABLE history (event_id TEXT NOT NULL, occurrence INTEGER NOT NULL, status TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', delivered_at INTEGER NOT NULL DEFAULT 0, is_read INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(event_id, occurrence))");
        db.execSQL("CREATE INDEX history_delivered ON history(delivered_at)");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if (oldVersion < 2 && newVersion >= 2) {
            // Add archive fields without rebuilding tables or losing state/schedule/dedup keys.
            db.execSQL("ALTER TABLE history ADD COLUMN title TEXT NOT NULL DEFAULT ''");
            db.execSQL("ALTER TABLE history ADD COLUMN body TEXT NOT NULL DEFAULT ''");
            db.execSQL("ALTER TABLE history ADD COLUMN delivered_at INTEGER NOT NULL DEFAULT 0");
            db.execSQL("ALTER TABLE history ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0");
            db.execSQL("UPDATE history SET delivered_at=occurrence, is_read=CASE WHEN status IN ('seen','snoozed') THEN 1 ELSE 0 END");
            db.execSQL("CREATE INDEX history_delivered ON history(delivered_at)");
            oldVersion = 2;
        }
        if (oldVersion != newVersion) throw new IllegalStateException("Unsupported database version");
    }
    synchronized String readState() {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT value FROM app_state WHERE id=1", null)) { return c.moveToFirst() ? c.getString(0) : null; }
    }
    synchronized void writeState(String value) throws JSONException {
        JSONObject state = new JSONObject(value);
        if (!state.has("inventory") && !state.has("state")) throw new JSONException("Invalid state document");
        ContentValues values = new ContentValues(); values.put("id", 1); values.put("value", value);
        if (getWritableDatabase().insertWithOnConflict("app_state", null, values, SQLiteDatabase.CONFLICT_REPLACE)<0) throw new IllegalStateException("State could not be saved");
    }
    synchronized boolean wasPosted(String id, long at) {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT 1 FROM history WHERE event_id=? AND occurrence=?", new String[]{id, Long.toString(at)})) { return c.moveToFirst(); }
    }
    synchronized void mark(String id, long at, String status) {
        SQLiteDatabase db = getWritableDatabase();
        ContentValues initial = new ContentValues(); initial.put("event_id", id); initial.put("occurrence", at); initial.put("status", status); initial.put("delivered_at",at);
        // Actions must update, never REPLACE: replacement would erase archived content.
        db.insertWithOnConflict("history", null, initial, SQLiteDatabase.CONFLICT_IGNORE);
        ContentValues values = new ContentValues(); values.put("status", status);
        if ("seen".equals(status) || "snoozed".equals(status)) values.put("is_read", 1);
        if (db.update("history", values, "event_id=? AND occurrence=?", new String[]{id, Long.toString(at)}) != 1) throw new IllegalStateException("Notification history could not be saved");
    }
    synchronized void recordDelivery(JSONObject event, String body, long deliveredAt) throws JSONException {
        String id = event.getString("id"); long occurrence = event.getLong("at");
        SQLiteDatabase db = getWritableDatabase();
        ContentValues initial = new ContentValues(); initial.put("event_id",id); initial.put("occurrence",occurrence); initial.put("status",body.isEmpty()?"empty":"posted");
        db.insertWithOnConflict("history", null, initial, SQLiteDatabase.CONFLICT_IGNORE);
        ContentValues values = new ContentValues(); values.put("title",event.optString("title","VIKI notification")); values.put("body",body); values.put("delivered_at",deliveredAt);
        if (db.update("history", values, "event_id=? AND occurrence=?", new String[]{id,Long.toString(occurrence)}) != 1) throw new IllegalStateException("Notification archive could not be saved");
    }
    synchronized JSONArray listNotificationHistory() throws JSONException {
        JSONArray result = new JSONArray();
        try (Cursor c = getReadableDatabase().rawQuery("SELECT event_id,occurrence,delivered_at,title,body,status,is_read FROM history WHERE status!='empty' AND status!='removed' ORDER BY delivered_at DESC, occurrence DESC LIMIT 2000", null)) {
            while (c.moveToNext()) {
                String title = c.getString(3), body = c.getString(4);
                if (title.isEmpty()) title = "Previous VIKI notification";
                if (body.isEmpty()) body = "Details were not retained by the previous app version.";
                result.put(new JSONObject().put("id",c.getString(0)).put("eventId",c.getString(0)).put("occurrence",c.getLong(1))
                    .put("at",c.getLong(2)).put("title",title).put("body",body).put("status",c.getString(5)).put("read",c.getInt(6)!=0).put("kind","notification"));
            }
        }
        return result;
    }
    synchronized boolean clearNotificationContent(String id,long occurrence){
        ContentValues values=new ContentValues();values.put("title","");values.put("body","");values.put("status","removed");values.put("is_read",1);
        // Retain the small deduplication key so deleting history never replays an alert.
        return getWritableDatabase().update("history",values,"event_id=? AND occurrence=?",new String[]{id,Long.toString(occurrence)})==1;
    }
    synchronized boolean markNotificationRead(String id, long occurrence, boolean read) {
        ContentValues values = new ContentValues(); values.put("is_read",read?1:0);
        return getWritableDatabase().update("history",values,"event_id=? AND occurrence=?",new String[]{id,Long.toString(occurrence)}) == 1;
    }
    synchronized void replaceSchedule(String json) throws JSONException {
        JSONArray incoming = new JSONArray(json);
        if (incoming.length() > 4096) throw new JSONException("Too many scheduled events");
        SQLiteDatabase db = getWritableDatabase(); db.beginTransaction();
        try {
            java.util.HashMap<String,JSONObject> previous=new java.util.HashMap<>();
            try(Cursor c=db.rawQuery("SELECT id,value FROM events WHERE snooze=0",null)){while(c.moveToNext())previous.put(c.getString(0),new JSONObject(c.getString(1)));}
            db.delete("events", "snooze=0", null);
            long now = System.currentTimeMillis();
            java.util.HashSet<String> retained = new java.util.HashSet<>();
            for (int i=0; i<incoming.length(); i++) {
                JSONObject e = incoming.getJSONObject(i); String id=e.getString("id"); long anchor=e.getLong("at");
                if (id.length()>512 || id.isEmpty() || anchor<0 || !e.has("title") || !e.has("body")) throw new JSONException("Invalid scheduled event");
                retained.add(id);
                String repeat = e.optString("repeat", "");
                if(e.optBoolean("calendarLocal")&&e.has("localTime"))java.time.LocalTime.parse(e.getString("localTime"));
                JSONObject old=previous.get(id);
                // Opening the UI must not discard an overdue summary that Doze delayed.
                if("digest".equals(e.optString("kind"))&&old!=null&&e.optString("localTime").equals(old.optString("localTime"))
                    &&old.getLong("at")<anchor&&!wasPosted(id,old.getLong("at")))anchor=old.getLong("at");
                long at = e.optBoolean("calendarLocal") && e.has("localTime") ? anchor : Recurrence.occurrence(anchor, repeat, now);
                if (wasPosted(id,at)) at = Recurrence.next(anchor,repeat,now);
                if (at<0) continue;
                e.put("anchor",anchor);e.put("at",at);
                putEvent(e,false);
            }
            // Editing/deleting the source event also cancels its snoozes.
            try (Cursor c=db.rawQuery("SELECT id,value FROM events WHERE snooze=1",null)) {
                while(c.moveToNext()) if (!retained.contains(new JSONObject(c.getString(1)).optString("sourceId"))) db.delete("events","id=?",new String[]{c.getString(0)});
            }
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
    }
    synchronized void putEvent(JSONObject event, boolean snooze) throws JSONException {
        ContentValues values=new ContentValues();values.put("id",event.getString("id"));values.put("at",event.getLong("at"));values.put("value",event.toString());values.put("snooze",snooze?1:0);
        if (getWritableDatabase().insertWithOnConflict("events",null,values,SQLiteDatabase.CONFLICT_REPLACE)<0) throw new IllegalStateException("Notification could not be saved");
    }
    synchronized JSONArray due(long now) throws JSONException {
        JSONArray result = new JSONArray();
        try(Cursor c=getReadableDatabase().rawQuery("SELECT value FROM events WHERE at<=? ORDER BY at LIMIT 100",new String[]{Long.toString(now)})) { while(c.moveToNext()) result.put(new JSONObject(c.getString(0))); }
        return result;
    }
    synchronized long nextTime() {
        try(Cursor c=getReadableDatabase().rawQuery("SELECT MIN(at) FROM events",null)) { return c.moveToFirst()&&!c.isNull(0)?c.getLong(0):-1; }
    }
    synchronized void reanchorLocal() throws JSONException {
        JSONArray values=new JSONArray();
        try(Cursor c=getReadableDatabase().rawQuery("SELECT value FROM events WHERE snooze=0",null)){while(c.moveToNext())values.put(new JSONObject(c.getString(0)));}
        long now=System.currentTimeMillis();
        for(int i=0;i<values.length();i++){
            JSONObject e=values.getJSONObject(i);
            if(e.optBoolean("calendarLocal")&&e.has("localTime")){e.put("at",Recurrence.nextLocal(e.getString("localTime"),now));putEvent(e,false);}
        }
    }
    synchronized void completed(JSONObject event,long now) throws JSONException {
        String id=event.getString("id");long next=event.optBoolean("calendarLocal") && event.has("localTime") ? Recurrence.nextLocal(event.optString("localTime"),now) : Recurrence.next(event.optLong("anchor",event.getLong("at")),event.optString("repeat"),now);
        if(next<0)getWritableDatabase().delete("events","id=?",new String[]{id});
        else {event.put("at",next);putEvent(event,false);}
    }
}
