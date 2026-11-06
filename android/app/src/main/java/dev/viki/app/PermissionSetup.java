package dev.viki.app;

import android.app.AlertDialog;
import android.graphics.Color;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Android-only first-launch explanation. Optional grants never lock out local data. */
final class PermissionSetup {
    private final MainActivity activity;
    private AlertDialog dialog;
    private TextView notifications, exact;
    private Button notificationButton, exactButton, continueButton;
    private boolean optedIn;
    PermissionSetup(MainActivity activity){this.activity=activity;optedIn=activity.getPreferences(0).getBoolean("setupNotificationOptInPending",false);}
    private int dp(int value){return Math.round(value*activity.getResources().getDisplayMetrics().density);}
    private TextView text(String value,int size,int color){TextView view=new TextView(activity);view.setText(value);view.setTextSize(size);view.setTextColor(color);view.setPadding(0,dp(8),0,dp(8));return view;}
    private Button button(String value){Button view=new Button(activity);view.setText(value);view.setAllCaps(false);view.setMinHeight(dp(52));return view;}
    void show(){
        if(activity.isFinishing()||(dialog!=null&&dialog.isShowing())){refresh();return;}
        if(activity.getPreferences(0).getBoolean("permissionSetupV2Complete",false))optedIn=false;
        LinearLayout content=new LinearLayout(activity);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(dp(22),dp(14),dp(22),dp(18));content.setBackgroundColor(Color.rgb(10,17,28));
        content.addView(text("VIKI // DEVICE SETUP",21,Color.rgb(104,245,215)));
        content.addView(text("Choose how VIKI can reach you",17,Color.WHITE));
        content.addView(text("Your inventory stays on this phone. No Google services, account, or network permission prompt is needed for local inventory. Android asks separately about alerts and precise timing.",15,Color.rgb(199,213,229)));
        notifications=text("",15,Color.WHITE);content.addView(notifications);
        notificationButton=button("Enable notifications");notificationButton.setOnClickListener(view->{optedIn=true;activity.getPreferences(0).edit().putBoolean("setupNotificationOptInPending",true).apply();activity.requestNotifications();});content.addView(notificationButton);
        content.addView(text("Notifications display scheduled reminders and inventory summaries while VIKI is closed. You can decline and keep using local inventory.",14,Color.rgb(168,186,207)));
        exact=text("",15,Color.WHITE);content.addView(exact);
        exactButton=button("Allow precise reminders");exactButton.setOnClickListener(view->activity.requestPreciseAlarms());content.addView(exactButton);
        content.addView(text("Precise alarm access improves delivery while the phone is idle. Without it, reminders can be delayed. Force-stopping, powering off, or disabling notifications prevents delivery. Enable VIKI's notification options in Settings when you are ready.",14,Color.rgb(168,186,207)));
        continueButton=button("Continue");continueButton.setOnClickListener(view->{dialog.dismiss();activity.setupFinished(optedIn);});content.addView(continueButton);
        ScrollView scroll=new ScrollView(activity);scroll.setFillViewport(false);scroll.addView(content,new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT));
        dialog=new AlertDialog.Builder(activity).setView(scroll).setCancelable(false).create();dialog.show();
        if(dialog.getWindow()!=null){dialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);dialog.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT);}
        refresh();
    }
    void refresh(){
        if(dialog==null||!dialog.isShowing())return;
        boolean notify=NotificationScheduler.notificationsAllowed(activity),precise=NotificationScheduler.exactAllowed(activity);
        notifications.setText(notify?R.string.setup_notifications_allowed:R.string.setup_notifications_blocked);
        exact.setText(precise?R.string.setup_exact_allowed:R.string.setup_exact_optional);
        notificationButton.setText(notify?"Enable VIKI alerts":"Enable notifications");
        exactButton.setEnabled(!precise);
        exactButton.setText(precise?"Precise alarms enabled":"Allow precise reminders");
        continueButton.setText(!notify?"Continue without alerts":!optedIn?"Continue":precise?"Continue to VIKI":"Continue with approximate timing");
    }
}
