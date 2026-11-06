package dev.viki.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class NotificationScheduler {
    static final String CHANNEL="viki-reminders";
    private NotificationScheduler() {}
    static boolean notificationsAllowed(Context c) {
        return (Build.VERSION.SDK_INT<33 || c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)
            && c.getSystemService(NotificationManager.class).areNotificationsEnabled()
            && (c.getSystemService(NotificationManager.class).getNotificationChannel(CHANNEL)==null || c.getSystemService(NotificationManager.class).getNotificationChannel(CHANNEL).getImportance()!=NotificationManager.IMPORTANCE_NONE);
    }
    static boolean exactAllowed(Context c) { return Build.VERSION.SDK_INT<31 || c.getSystemService(AlarmManager.class).canScheduleExactAlarms(); }
    static JSONObject status(Context c) throws JSONException {
        return new JSONObject().put("platform","android").put("notificationsGranted",notificationsAllowed(c)).put("exactAlarmsGranted",exactAllowed(c))
            .put("enabled",notificationsAllowed(c)).put("exactAlarms",exactAllowed(c)).put("nextAt",VikiDatabase.get(c).nextTime());
    }
    static synchronized void reschedule(Context c) {
        AlarmManager alarms=c.getSystemService(AlarmManager.class);
        PendingIntent pending=PendingIntent.getBroadcast(c,0,new Intent(c,AlarmReceiver.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        alarms.cancel(pending);
        long next=VikiDatabase.get(c).nextTime();
        if(next<0 || !notificationsAllowed(c))return;
        long at=Math.max(next,System.currentTimeMillis()+1000);
        if(exactAllowed(c)) {
            try { alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending);return; }
            catch(SecurityException ignored) { /* Permission may be revoked between check and call. */ }
        }
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending);
    }
    static synchronized void deliver(Context c) {
        if(!notificationsAllowed(c))return;
        VikiDatabase db=VikiDatabase.get(c);
        NotificationManager manager=c.getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(CHANNEL,"Inventory and reminders",NotificationManager.IMPORTANCE_DEFAULT));
        try {
            long now=System.currentTimeMillis();JSONArray due=db.due(now);
            for(int i=0;i<due.length();i++) {
                JSONObject event=due.getJSONObject(i);String id=event.getString("id");
                if(Recurrence.isRepeating(event.optString("repeat"))){
                    long latest=event.optBoolean("calendarLocal")&&event.has("localTime")?Recurrence.localOccurrence(event.getString("localTime"),now):Recurrence.occurrence(event.optLong("anchor",event.getLong("at")),event.optString("repeat"),now);
                    event.put("at",latest);
                }
                long at=event.getLong("at");
                if(!db.wasPosted(id,at)) {
                    String body="digest".equals(event.optString("kind"))?digest(db,event,now):event.getString("body");
                    if(!body.isEmpty()) {
                        Intent launch=new Intent(c,MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
                        PendingIntent open=PendingIntent.getActivity(c,0,launch,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
                        Notification notification=new Notification.Builder(c,CHANNEL)
                            .setSmallIcon(android.R.drawable.ic_popup_reminder).setContentTitle(event.getString("title"))
                            .setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body)).setContentIntent(open)
                            .setVisibility(Notification.VISIBILITY_PRIVATE).setAutoCancel(true)
                            .addAction(new Notification.Action.Builder(null,"Seen",action(c,event,"seen")).build())
                            .addAction(new Notification.Action.Builder(null,"Snooze 1 day",action(c,event,"snooze")).build()).build();
                        manager.notify(id,0,notification);
                    }
                    db.mark(id,at,body.isEmpty()?"empty":"posted");
                }
                db.completed(event,now);
            }
        }catch(JSONException e){android.util.Log.e("VIKI","Invalid saved notification data",e);}
        catch(SecurityException e){android.util.Log.w("VIKI","Notification permission changed during delivery");}
        reschedule(c);
    }
    static void cancelRemoved(Context context,String json) throws JSONException {
        java.util.HashSet<String> retained=new java.util.HashSet<>();JSONArray events=new JSONArray(json);
        for(int i=0;i<events.length();i++)retained.add(events.getJSONObject(i).getString("id"));
        NotificationManager manager=context.getSystemService(NotificationManager.class);
        for(android.service.notification.StatusBarNotification notification:manager.getActiveNotifications()){
            String tag=notification.getTag();if(tag==null)continue;
            int suffix=tag.indexOf(":snooze:");String source=suffix<0?tag:tag.substring(0,suffix);
            if(!retained.contains(source))manager.cancel(tag,notification.getId());
        }
    }
    private static PendingIntent action(Context c,JSONObject event,String action) throws JSONException {
        Intent intent=new Intent(c,NotificationActionReceiver.class).setAction(action)
            .setData(android.net.Uri.parse("viki://notification/"+android.net.Uri.encode(event.getString("id"))+"/"+event.getLong("at")+"/"+action))
            .putExtra("event",event.toString());
        return PendingIntent.getBroadcast(c,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    private static String digest(VikiDatabase db,JSONObject event,long now) throws JSONException {
        String json=db.readState();if(json==null)return "";
        JSONObject envelope=new JSONObject(json);JSONObject state=envelope.optJSONObject("state");if(state==null)state=envelope;
        JSONArray inventory=state.optJSONArray("inventory");if(inventory==null)return "";
        StringBuilder text=new StringBuilder();int count=0;
        for(int i=0;i<inventory.length();i++) {
            JSONObject item=inventory.optJSONObject(i);if(item==null||item.optDouble("quantity",1)<=0)continue;
            long added;
            try { added=java.time.Instant.parse(item.getString("addedDate")).toEpochMilli(); }catch(Exception ignored){continue;}
            double shelf=item.optDouble("shelfLife",-1);if(shelf<=0)continue;
            double remaining=(added+shelf*86400000.0-now)/86400000.0;
            if(remaining>event.optDouble("warningDays",3))continue;
            count++;if(count<=12)text.append(item.optString("name","Item")).append(remaining<=0?": expired":": "+(int)Math.ceil(remaining)+" day(s) left").append('\n');
        }
        if(count>12)text.append("And ").append(count-12).append(" more items.");
        return text.toString().trim();
    }
}
