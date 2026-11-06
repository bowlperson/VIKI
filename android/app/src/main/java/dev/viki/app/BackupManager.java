package dev.viki.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** User-selected SAF folders contain portable snapshots, never a live external SQLite file. */
final class BackupManager {
    static final long WEEK=7L*24*60*60*1000;
    private static final ExecutorService WORKER=Executors.newSingleThreadExecutor();
    private static boolean running;
    private static SharedPreferences prefs(Context c){return c.getSharedPreferences("viki-backups",Context.MODE_PRIVATE);}
    static boolean due(Context c){SharedPreferences p=prefs(c);return p.getBoolean("weekly",false)&&p.contains("folder")&&BackupPolicy.due(true,true,p.getLong("lastCheck",0),System.currentTimeMillis());}
    static void setFolder(Context c,Uri uri){prefs(c).edit().putString("folder",uri.toString()).remove("lastHash").putLong("lastCheck",0).putLong("backupBytes",0).putInt("backupCount",0).putLong("lastBackup",0).apply();}
    static void setWeekly(Context c,boolean enabled){prefs(c).edit().putBoolean("weekly",enabled).apply();schedule(c);if(due(c))enqueue(c,false,null);}
    static void setRetention(Context c,int count,Runnable completed){
        int keep=Math.max(1,Math.min(12,count));prefs(c).edit().putInt("retention",keep).apply();
        WORKER.execute(()->{try{Uri selected=tree(c);if(selected!=null)maintain(c,selected,keep);}catch(Exception e){prefs(c).edit().putString("error","Could not rotate older automatic backups.").apply();}finally{if(completed!=null)completed.run();}});
    }
    static void schedule(Context c){
        PendingIntent intent=PendingIntent.getBroadcast(c,71,new Intent(c,BackupReceiver.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        AlarmManager alarms=c.getSystemService(AlarmManager.class);alarms.cancel(intent);
        SharedPreferences p=prefs(c);if(!p.getBoolean("weekly",false)||!p.contains("folder"))return;
        long next=Math.max(System.currentTimeMillis()+60_000,p.getLong("lastCheck",0)+WEEK);
        // Weekly housekeeping is intentionally approximate and needs no exact-alarm access.
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next,intent);
    }
    static synchronized void enqueue(Context context,boolean force,Runnable completed){
        Context c=context.getApplicationContext();
        if(running){if(force)WORKER.execute(()->enqueue(c,true,completed));else if(completed!=null)completed.run();return;}
        running=true;
        WORKER.execute(()->{
            try{backup(c,force);prefs(c).edit().remove("error").apply();}
            catch(Exception e){prefs(c).edit().putLong("lastCheck",System.currentTimeMillis()-WEEK+86400000L).putString("error",e.getMessage()==null?"Backup failed":e.getMessage()).apply();}
            finally{ synchronized(BackupManager.class){running=false;}schedule(c);if(completed!=null)completed.run(); }
        });
    }
    private static Uri tree(Context c){String saved=prefs(c).getString("folder",null);return saved==null?null:Uri.parse(saved);}
    private static Uri document(Uri tree,String id){return DocumentsContract.buildDocumentUriUsingTree(tree,id);}
    private static String digest(byte[] data)throws Exception{
        return BackupPolicy.sha256(data);
    }
    private static JSONObject portable(JSONObject envelope)throws Exception{
        JSONObject state=envelope.optJSONObject("state");if(state==null)state=envelope;
        JSONObject out=new JSONObject().put("schemaVersion",1)
            .put("viki_inventory_v2",state.getJSONArray("inventory")).put("viki_categories",state.getJSONObject("presets"))
            .put("favoriteRules",state.getJSONObject("favoriteRules")).put("reminders",state.getJSONArray("reminders"))
            .put("cashProfiles",state.optJSONArray("cashProfiles")==null?new org.json.JSONArray():state.getJSONArray("cashProfiles"))
            .put("modelSettings",new JSONObject());
        org.json.JSONArray inbox=state.optJSONArray("inbox");
        if(inbox!=null){org.json.JSONArray copy=new org.json.JSONArray(inbox.toString());for(int i=0;i<copy.length();i++){JSONObject e=copy.optJSONObject(i);if(e!=null){e.remove("nativeEventId");e.remove("nativeOccurrence");}}out.put("inbox",copy);}
        return out;
    }
    private static void backup(Context c,boolean force)throws Exception{
        SharedPreferences p=prefs(c);long now=System.currentTimeMillis();
        if(!force&&!due(c))return;
        Uri selected=tree(c);if(selected==null)throw new java.io.IOException("Choose a backup folder first.");
        String raw=VikiDatabase.get(c).readState();if(raw==null)return;
        JSONObject data=portable(new JSONObject(raw));String hash=digest(data.toString().getBytes(StandardCharsets.UTF_8));
        // Checking once a week is enough. Unchanged data creates no extra file.
        p.edit().putLong("lastCheck",now).apply();
        if(!BackupPolicy.shouldWrite(force,p.getString("lastHash",""),hash))return;
        data.put("exportedAt",Instant.ofEpochMilli(now).toString());
        byte[] bytes=data.toString().getBytes(StandardCharsets.UTF_8);
        String stamp=DateTimeFormatter.ofPattern("uuuu-MM-dd_HH-mm-ss").withZone(ZoneOffset.UTC).format(Instant.ofEpochMilli(now));
        String name=(force?"viki-backup-":"viki-weekly-")+stamp+"-"+java.util.UUID.randomUUID().toString().substring(0,8)+".json";
        Uri created=DocumentsContract.createDocument(c.getContentResolver(),document(selected,DocumentsContract.getTreeDocumentId(selected)),"application/json",name);
        if(created==null)throw new java.io.IOException("The folder provider could not create a backup.");
        boolean complete=false;
        try{
            try(OutputStream stream=c.getContentResolver().openOutputStream(created,"wt")){if(stream==null)throw new java.io.IOException("Cannot write the selected folder.");stream.write(bytes);}
            try(InputStream stream=c.getContentResolver().openInputStream(created)){
                if(stream==null)throw new java.io.IOException("Cannot verify the saved backup.");
                java.io.ByteArrayOutputStream check=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[8192];int n;
                while((n=stream.read(buffer))!=-1){if(check.size()+n>bytes.length)throw new java.io.IOException("Backup verification failed.");check.write(buffer,0,n);}
                if(!digest(bytes).equals(digest(check.toByteArray())))throw new java.io.IOException("Backup verification failed.");
            }
            complete=true;p.edit().putString("lastHash",hash).putLong("lastBackup",now).putString("lastFile",name).apply();
        }finally{if(!complete)try{DocumentsContract.deleteDocument(c.getContentResolver(),created);}catch(Exception ignored){/* Keep prior valid backups. */}}
        maintain(c,selected,p.getInt("retention",8));
    }
    private static void maintain(Context c,Uri selected,int keep)throws Exception{
        prune(c,selected,keep);long total=0;int count=0;for(FileEntry e:files(c,selected)){total+=e.bytes;count++;}
        prefs(c).edit().putLong("backupBytes",total).putInt("backupCount",count).apply();
    }
    private static final class FileEntry{String id,name;long bytes;FileEntry(String i,String n,long b){id=i;name=n;bytes=b;}}
    private static ArrayList<FileEntry> files(Context c,Uri selected)throws Exception{
        ArrayList<FileEntry> result=new ArrayList<>();
        Uri children=DocumentsContract.buildChildDocumentsUriUsingTree(selected,DocumentsContract.getTreeDocumentId(selected));
        try(Cursor cursor=c.getContentResolver().query(children,new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_SIZE},null,null,null)){
            if(cursor==null)throw new java.io.IOException("Cannot read the selected backup folder.");
            while(cursor.moveToNext()){String name=cursor.getString(1);if(name!=null&&(name.startsWith("viki-weekly-")||name.startsWith("viki-backup-"))&&name.endsWith(".json"))result.add(new FileEntry(cursor.getString(0),name,Math.max(0,cursor.getLong(2))));}
        }
        return result;
    }
    private static void prune(Context c,Uri selected,int keep)throws Exception{
        ArrayList<FileEntry> all=files(c,selected);ArrayList<String> names=new ArrayList<>();for(FileEntry e:all)names.add(e.name);
        for(String name:BackupPolicy.expiredNames(names,keep))for(FileEntry e:all)if(e.name.equals(name))DocumentsContract.deleteDocument(c.getContentResolver(),document(selected,e.id));
    }
    static JSONObject info(Context c)throws Exception{
        SharedPreferences p=prefs(c);java.io.File database=c.getDatabasePath("viki.db");long size=0;
        for(String suffix:new String[]{"","-wal","-shm","-journal"})size+=new java.io.File(database.getPath()+suffix).length();
        String raw=VikiDatabase.get(c).readState();
        JSONObject result=new JSONObject().put("databasePath",database.getPath()).put("databaseBytes",size).put("payloadBytes",raw==null?0:raw.getBytes(StandardCharsets.UTF_8).length)
            .put("weeklyEnabled",p.getBoolean("weekly",false)).put("retention",p.getInt("retention",8)).put("lastBackupAt",p.getLong("lastBackup",0)).put("lastFile",p.getString("lastFile",""))
            .put("error",p.getString("error","")).put("folderUri",p.getString("folder",""));
        Uri selected=tree(c);
        if(selected!=null)result.put("folderName",DocumentsContract.getTreeDocumentId(selected));
        return result.put("backupBytes",p.getLong("backupBytes",0)).put("backupCount",p.getInt("backupCount",0));
    }
}
