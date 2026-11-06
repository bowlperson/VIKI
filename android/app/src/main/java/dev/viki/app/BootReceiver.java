package dev.viki.app;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
public final class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent) { if(Intent.ACTION_TIMEZONE_CHANGED.equals(intent.getAction())||Intent.ACTION_TIME_CHANGED.equals(intent.getAction())){
            try{VikiDatabase.get(context).reanchorLocal();}catch(Exception e){android.util.Log.e("VIKI","Unable to adjust local schedule",e);}
        }
        NotificationScheduler.reschedule(context); BackupManager.schedule(context); }
}
