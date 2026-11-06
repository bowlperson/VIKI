package dev.viki.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.graphics.Color;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.widget.FrameLayout;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public final class MainActivity extends Activity {
    private static final String HOST="appassets.androidplatform.net";
    private static final int EXPORT=100,IMPORT=101,NOTIFICATIONS=102,BACKUP_FOLDER=103;
    private WebView web;
    private String pendingExport;
    private FrameLayout frame;
    private PermissionSetup permissionSetup;
    private boolean webReady;
    private volatile boolean keyboardVisible;
    private String pendingSetupStatus;
    // JavaScript runs only in the bundled app origin; CSP blocks remote scripts and frames.
    @android.annotation.SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        frame=new FrameLayout(this);frame.setBackgroundColor(Color.rgb(8,12,20));
        web=new WebView(this);web.setBackgroundColor(Color.rgb(8,12,20));
        frame.addView(web,new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT,FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(frame);
        if(Build.VERSION.SDK_INT>=30)getWindow().setDecorFitsSystemWindows(false);
        // WebView padding does not protect fixed-position HTML from edge-to-edge bars.
        // Native margins shrink the actual web viewport, including its fixed Settings header.
        frame.setOnApplyWindowInsetsListener((view,insets)->{
            int left,top,right,bottom;
            boolean ime=Build.VERSION.SDK_INT>=30?insets.isVisible(WindowInsets.Type.ime()):insets.getSystemWindowInsetBottom()-insets.getStableInsetBottom()>dpKeyboardThreshold();
            if(ime!=keyboardVisible){keyboardVisible=ime;web.evaluateJavascript("window.dispatchEvent(new CustomEvent('viki-ime-change',{detail:{visible:"+ime+"}}))",null);}
            if(Build.VERSION.SDK_INT>=30){
                android.graphics.Insets safe=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());
                left=safe.left;top=safe.top;right=safe.right;bottom=safe.bottom;
                // Keep transient status-bar gestures from covering the fixed Settings header.
                top=Math.max(top,insets.getInsetsIgnoringVisibility(WindowInsets.Type.statusBars()).top);
                if(insets.getDisplayCutout()!=null){
                    top=Math.max(top,insets.getDisplayCutout().getSafeInsetTop());
                    left=Math.max(left,insets.getDisplayCutout().getSafeInsetLeft());
                    right=Math.max(right,insets.getDisplayCutout().getSafeInsetRight());
                    bottom=Math.max(bottom,insets.getDisplayCutout().getSafeInsetBottom());
                }
            }else{
                left=insets.getSystemWindowInsetLeft();right=insets.getSystemWindowInsetRight();
                top=Math.max(insets.getSystemWindowInsetTop(),insets.getStableInsetTop());bottom=insets.getSystemWindowInsetBottom();
                if(Build.VERSION.SDK_INT>=28&&insets.getDisplayCutout()!=null){
                    top=Math.max(top,insets.getDisplayCutout().getSafeInsetTop());
                    left=Math.max(left,insets.getDisplayCutout().getSafeInsetLeft());right=Math.max(right,insets.getDisplayCutout().getSafeInsetRight());
                    bottom=Math.max(bottom,insets.getDisplayCutout().getSafeInsetBottom());
                }
            }
            FrameLayout.LayoutParams layout=(FrameLayout.LayoutParams)web.getLayoutParams();
            if(layout.leftMargin!=left||layout.topMargin!=top||layout.rightMargin!=right||layout.bottomMargin!=bottom){
                layout.setMargins(left,top,right,bottom);web.setLayoutParams(layout);
            }
            return Build.VERSION.SDK_INT>=30?WindowInsets.CONSUMED:insets.consumeSystemWindowInsets();
        });
        markOpenedNotification(getIntent());
        permissionSetup=new PermissionSetup(this);
        applyFullscreen();
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);settings.setSupportMultipleWindows(false);settings.setMediaPlaybackRequiresUserGesture(true);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.setWebChromeClient(new android.webkit.WebChromeClient(){
            @Override public boolean onJsConfirm(WebView view,String url,String message,android.webkit.JsResult result){
                if(!trusted(Uri.parse(url))){result.cancel();return true;}
                new android.app.AlertDialog.Builder(MainActivity.this).setTitle("VIKI").setMessage(message)
                    .setPositiveButton("Confirm",(dialog,which)->result.confirm()).setNegativeButton("Cancel",(dialog,which)->result.cancel())
                    .setOnCancelListener(dialog->result.cancel()).show();return true;
            }
            @Override public boolean onJsAlert(WebView view,String url,String message,android.webkit.JsResult result){
                if(!trusted(Uri.parse(url))){result.cancel();return true;}
                new android.app.AlertDialog.Builder(MainActivity.this).setTitle("VIKI").setMessage(message)
                    .setPositiveButton("OK",(dialog,which)->result.confirm()).setOnCancelListener(dialog->result.cancel()).show();return true;
            }
        });
        web.addJavascriptInterface(new Bridge(),"VikiNative");
        web.setWebViewClient(new WebViewClient(){
            @Override public void onPageFinished(WebView view,String url){if(trusted(Uri.parse(url))){webReady=true;dispatchSetupResult();}}
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !trusted(request.getUrl());}
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){return bundled(request.getUrl());}
        });
        web.loadUrl("https://"+HOST+"/index.html");
        if(!getPreferences(MODE_PRIVATE).getBoolean("permissionSetupV2Complete",false))frame.post(()->permissionSetup.show());
    }
    private int dpKeyboardThreshold(){return Math.round(130*getResources().getDisplayMetrics().density);}
    private void markOpenedNotification(Intent intent){if(intent!=null&&intent.hasExtra("notificationEventId")){VikiDatabase.get(this).markNotificationRead(intent.getStringExtra("notificationEventId"),intent.getLongExtra("notificationOccurrence",0),true);}}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);markOpenedNotification(intent);if(web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('viki-native-resume'))",null);}
    private static boolean trusted(Uri uri){return "https".equals(uri.getScheme())&&HOST.equals(uri.getHost())&&(uri.getPort()==-1||uri.getPort()==443);}
    private WebResourceResponse bundled(Uri uri){
        if(!trusted(uri))return null;
        String path=uri.getPath();if(path==null||path.equals("/"))path="/index.html";
        if(path.contains("..")||path.indexOf('\0')>=0)return response("text/plain",404,new ByteArrayInputStream(new byte[0]));
        try {
            String mime=path.endsWith(".html")?"text/html":path.endsWith(".js")?"text/javascript":path.endsWith(".json")?"application/json":path.endsWith(".css")?"text/css":path.endsWith(".svg")?"image/svg+xml":"application/octet-stream";
            return response(mime,200,getAssets().open(path.substring(1)));
        }catch(Exception ignored){return response("text/plain",404,new ByteArrayInputStream(new byte[0]));}
    }
    private WebResourceResponse response(String mime,int code,InputStream stream){
        Map<String,String> headers=new HashMap<>();
        // The bridge is never exposed to remote frames/documents. Only bundled code may execute.
        headers.put("Content-Security-Policy","default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https:; media-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'");
        headers.put("X-Content-Type-Options","nosniff");
        headers.put("Date",java.time.format.DateTimeFormatter.RFC_1123_DATE_TIME.format(java.time.ZonedDateTime.now(java.time.ZoneOffset.UTC)));
        return new WebResourceResponse(mime,"UTF-8",code,code==200?"OK":"Not Found",headers,stream);
    }
    private boolean fullscreen(){return getPreferences(MODE_PRIVATE).getBoolean("fullscreen",true);}
    @android.annotation.SuppressLint("ObsoleteSdkInt")
    private void applyFullscreen(){
        if(Build.VERSION.SDK_INT>=30){
            WindowInsetsController controller=getWindow().getInsetsController();
            if(controller!=null){
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                if(fullscreen())controller.hide(WindowInsets.Type.systemBars());else controller.show(WindowInsets.Type.systemBars());
            }
        }else{
            int flags=View.SYSTEM_UI_FLAG_LAYOUT_STABLE|View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
            if(fullscreen())flags|=View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
            getWindow().getDecorView().setSystemUiVisibility(flags);
        }
        if(frame!=null)frame.requestApplyInsets();
    }
    @Override public void onWindowFocusChanged(boolean focused){super.onWindowFocusChanged(focused);if(focused)applyFullscreen();}
    @Override protected void onResume(){super.onResume();applyFullscreen();NotificationScheduler.reschedule(this);BackupManager.schedule(this);if(BackupManager.due(this))BackupManager.enqueue(this,false,null);if(permissionSetup!=null)permissionSetup.refresh();if(web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('viki-native-resume'))",null);}
    void setupFinished(boolean optedIn){
        getPreferences(MODE_PRIVATE).edit().putBoolean("permissionSetupV2Complete",true).apply();
        getPreferences(MODE_PRIVATE).edit().remove("setupNotificationOptInPending").apply();
        applyFullscreen();
        try{pendingSetupStatus=NotificationScheduler.status(this).put("optedIn",optedIn).toString();dispatchSetupResult();}catch(Exception ignored){/* Status is available again on next focus. */}
    }
    private void dispatchSetupResult(){
        if(webReady&&pendingSetupStatus!=null){web.evaluateJavascript("window.dispatchEvent(new CustomEvent('viki-permission-setup',{detail:"+pendingSetupStatus+"}));window.dispatchEvent(new Event('viki-native-resume'))",null);pendingSetupStatus=null;}
    }
    void requestNotifications(){new Bridge().requestNotificationPermission();}
    void requestPreciseAlarms(){new Bridge().requestExactAlarmPermission();}
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);NotificationScheduler.reschedule(this);BackupManager.schedule(this);if(BackupManager.due(this))BackupManager.enqueue(this,false,null);if(permissionSetup!=null)permissionSetup.refresh();web.evaluateJavascript("window.dispatchEvent(new Event('viki-native-resume'))",null);}
    @Override public void onBackPressed(){web.evaluateJavascript("(()=>{const p=document.getElementById('settingsPage');if(p&&!p.hidden){document.getElementById('closeSettingsButton').click();return true;}return false;})()",value->{if(!"true".equals(value))super.onBackPressed();});}
    private void error(String message){web.evaluateJavascript("window.dispatchEvent(new CustomEvent('viki-native-error',{detail:"+JSONObject.quote(message)+"}))",null);}
    private void openNotificationSettings(){startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getPackageName()));}
    final class Bridge {
        @JavascriptInterface public String storageInfo(){try{return BackupManager.info(MainActivity.this).toString();}catch(Exception e){return "{\"error\":\"Storage information unavailable\"}";}}
        @JavascriptInterface public void chooseBackupFolder(){runOnUiThread(()->startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION),BACKUP_FOLDER));}
        @JavascriptInterface public void setWeeklyBackups(boolean enabled){BackupManager.setWeekly(MainActivity.this,enabled);}
        @JavascriptInterface public void setBackupRetention(int count){BackupManager.setRetention(MainActivity.this,count,()->runOnUiThread(()->web.evaluateJavascript("window.dispatchEvent(new Event('viki-storage-change'))",null)));}
        @JavascriptInterface public void backupNow(){BackupManager.enqueue(MainActivity.this,true,()->runOnUiThread(()->web.evaluateJavascript("window.dispatchEvent(new Event('viki-storage-change'))",null)));}
        @JavascriptInterface public boolean keyboardVisible(){return keyboardVisible;}
        @JavascriptInterface public boolean fullscreenStatus(){return fullscreen();}
        @JavascriptInterface public void setFullscreen(boolean enabled){getPreferences(MODE_PRIVATE).edit().putBoolean("fullscreen",enabled).apply();runOnUiThread(()->applyFullscreen());}
        @JavascriptInterface public void showPermissionSetup(){runOnUiThread(()->permissionSetup.show());}
        @JavascriptInterface public String listNotificationHistory(){try{return VikiDatabase.get(MainActivity.this).listNotificationHistory().toString();}catch(Exception e){return "[]";}}
        @JavascriptInterface public boolean clearNotificationHistoryEntry(String id,long occurrence){try{boolean result=VikiDatabase.get(MainActivity.this).clearNotificationContent(id,occurrence);getSystemService(android.app.NotificationManager.class).cancel(id,0);return result;}catch(Exception e){return false;}}
        @JavascriptInterface public boolean markNotificationRead(String id,long occurrence,boolean read){try{return VikiDatabase.get(MainActivity.this).markNotificationRead(id,occurrence,read);}catch(Exception e){return false;}}
        @JavascriptInterface public String readState(){return VikiDatabase.get(MainActivity.this).readState();}
        @JavascriptInterface public boolean writeState(String json){try{VikiDatabase.get(MainActivity.this).writeState(json);if(BackupManager.due(MainActivity.this))BackupManager.enqueue(MainActivity.this,false,null);return true;}catch(Exception e){return false;}}
        @JavascriptInterface public boolean scheduleNotifications(String json){try{VikiDatabase.get(MainActivity.this).replaceSchedule(json);NotificationScheduler.cancelRemoved(MainActivity.this,json);NotificationScheduler.reschedule(MainActivity.this);return true;}catch(Exception e){return false;}}
        @JavascriptInterface public String notificationStatus(){try{return NotificationScheduler.status(MainActivity.this).toString();}catch(Exception e){return "{}";}}
        @JavascriptInterface public void requestNotificationPermission(){runOnUiThread(()->{
            if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){
                boolean asked=getPreferences(MODE_PRIVATE).getBoolean("notificationPermissionRequested",false);
                if(asked&&!shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS))openNotificationSettings();
                else{getPreferences(MODE_PRIVATE).edit().putBoolean("notificationPermissionRequested",true).apply();requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},NOTIFICATIONS);}
            }else if(!NotificationScheduler.notificationsAllowed(MainActivity.this))openNotificationSettings();
            else NotificationScheduler.reschedule(MainActivity.this);
        });}
        @JavascriptInterface public void requestExactAlarmPermission(){runOnUiThread(()->{if(Build.VERSION.SDK_INT>=31&&!NotificationScheduler.exactAllowed(MainActivity.this))startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getPackageName())));});}
        @JavascriptInterface public void exportBackup(String json){runOnUiThread(()->{pendingExport=json;Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE,"viki-backup.json");startActivityForResult(intent,EXPORT);});}
        @JavascriptInterface public void importBackup(){runOnUiThread(()->startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"),IMPORT));}
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);if(result!=RESULT_OK||data==null||data.getData()==null){pendingExport=null;return;}
        try {
            if(request==BACKUP_FOLDER){
                getContentResolver().takePersistableUriPermission(data.getData(),Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                BackupManager.setFolder(this,data.getData());
                BackupManager.enqueue(this,true,()->runOnUiThread(()->web.evaluateJavascript("window.dispatchEvent(new Event('viki-storage-change'))",null)));
                web.evaluateJavascript("window.dispatchEvent(new Event('viki-storage-change'))",null);
            }
            if(request==EXPORT&&pendingExport!=null){try(OutputStream out=getContentResolver().openOutputStream(data.getData(),"wt")){if(out==null)throw new java.io.IOException("Unable to open backup file");out.write(pendingExport.getBytes(StandardCharsets.UTF_8));}pendingExport=null;}
            if(request==IMPORT){try(InputStream in=getContentResolver().openInputStream(data.getData());ByteArrayOutputStream out=new ByteArrayOutputStream()){
                if(in==null)throw new java.io.IOException("Unable to read backup");byte[] buffer=new byte[8192];int n;
                while((n=in.read(buffer))!=-1){if(out.size()+n>16*1024*1024)throw new java.io.IOException("Backup exceeds 16 MB");out.write(buffer,0,n);}
                String json=out.toString(StandardCharsets.UTF_8.name());new JSONObject(json);
                web.evaluateJavascript("window.dispatchEvent(new CustomEvent('viki-backup-import',{detail:"+JSONObject.quote(json)+"}))",null);
            }}
        }catch(Exception e){pendingExport=null;error("Backup operation failed: "+e.getMessage());}
    }
}
