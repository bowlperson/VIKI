package dev.viki.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
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
    private static final int EXPORT=100,IMPORT=101,NOTIFICATIONS=102;
    private WebView web;
    private String pendingExport;
    // JavaScript runs only in the bundled app origin; CSP blocks remote scripts and frames.
    @android.annotation.SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web=new WebView(this);setContentView(web);
        // Insets keep the shared UI outside Android 15's mandatory edge-to-edge system bars.
        web.setOnApplyWindowInsetsListener((view,insets)->{view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
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
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !trusted(request.getUrl());}
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){return bundled(request.getUrl());}
        });
        web.loadUrl("https://"+HOST+"/index.html");
    }
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
    @Override protected void onResume(){super.onResume();NotificationScheduler.reschedule(this);if(web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('viki-native-resume'))",null);}
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);NotificationScheduler.reschedule(this);web.evaluateJavascript("window.dispatchEvent(new Event('viki-native-resume'))",null);}
    @Override public void onBackPressed(){web.evaluateJavascript("(()=>{const p=document.getElementById('settingsPage');if(p&&!p.hidden){document.getElementById('closeSettingsButton').click();return true;}return false;})()",value->{if(!"true".equals(value))super.onBackPressed();});}
    private void error(String message){web.evaluateJavascript("window.dispatchEvent(new CustomEvent('viki-native-error',{detail:"+JSONObject.quote(message)+"}))",null);}
    private void openNotificationSettings(){startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getPackageName()));}
    final class Bridge {
        @JavascriptInterface public String readState(){return VikiDatabase.get(MainActivity.this).readState();}
        @JavascriptInterface public boolean writeState(String json){try{VikiDatabase.get(MainActivity.this).writeState(json);return true;}catch(Exception e){return false;}}
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
