package dev.viki.app;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
public final class BackupReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent){
        PendingResult pending=goAsync();BackupManager.enqueue(context,false,pending::finish);
    }
}
