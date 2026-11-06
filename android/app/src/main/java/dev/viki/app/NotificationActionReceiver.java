package dev.viki.app;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import org.json.JSONObject;
public final class NotificationActionReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent) {
        try {
            JSONObject event=new JSONObject(intent.getStringExtra("event"));String id=event.getString("id");long at=event.getLong("at");
            VikiDatabase db=VikiDatabase.get(context);db.mark(id,at,"snooze".equals(intent.getAction())?"snoozed":"seen");
            context.getSystemService(NotificationManager.class).cancel(id,0);
            if("snooze".equals(intent.getAction())) {
                long next=System.currentTimeMillis()+86_400_000L;
                event.put("sourceId",event.optString("sourceId",id)).put("id",id+":snooze:"+at).put("at",next).put("anchor",next).put("repeat",JSONObject.NULL).put("calendarLocal",false);
                db.putEvent(event,true);
            }
            NotificationScheduler.reschedule(context);
        }catch(Exception e){android.util.Log.e("VIKI","Unable to update notification",e);}
    }
}
