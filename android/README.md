# VIKI Android

This native Java shell bundles the same HTML and JavaScript used by the desktop browser version. It needs Android 8/API 26 or newer; compile/target SDK is 35. No Firebase, Google Play Services, Google account, or runtime third-party library is included. The Android Gradle plugin and SDK are build-time tools only.

## Build

Install JDK 17 or newer, Android SDK platform 35 and Build Tools 35.0.0, and point `ANDROID_HOME` at that SDK. From this directory run:

```sh
./gradlew testDebugUnitTest assembleDebug
```

Gradle is pinned to 8.11.1 with a distribution checksum. `bundleWebAssets` copies only `index.html`, the shared storage, notification, inbox, and help modules, the mobile theme/layout files, `manifest.json`, and the dedicated `assets/` directory into the APK at build time. Dependency manifests, repository files, arbitrary JSON files, and the browser service worker are excluded. Rebuild after editing the shared app. The output is `app/build/outputs/apk/debug/app-debug.apk`. Install using `adb install -r app/build/outputs/apk/debug/app-debug.apk`, or transfer it and use Android's APK installer.

Debug APKs use a development signing key and are suitable for testing. For distribution, configure a private release signing key outside the repository and sign a release build; retain that key for future upgrades. Never commit signing keys. Device testing is required before claiming reliable reminder delivery.

## Native responsibilities

* Native viewport margins reserve the display cutout, visible system bars, and keyboard area before HTML is laid out. Fullscreen defaults on, hides system bars automatically, and allows transient bars with an edge swipe. The Appearance setting persists fullscreen changes. Unlike WebView padding, margins protect fixed Settings headers too.
* Private SQLite database `viki.db` stores the shared versioned state document, notification schedule, and per-occurrence delivery/action history. All state writes commit before returning success. Notification history is not overwritten when browser state is saved. Schema v2 adds archived message text, delivery timestamps, and read/unread state while preserving v1 data and suppression history. The reminder inbox can blur read messages without deleting them.
* The trusted WebView origin is `https://appassets.androidplatform.net/`; its files are bundled, and no web server is needed. External document navigation, frames, file/content access, mixed content, and remote executable scripts are blocked. Optional provider HTTPS requests are allowed. The APK does not use the browser service worker.
* A single pending `AlarmManager` alarm points at the earliest saved event. With exact-alarm access, it uses `setExactAndAllowWhileIdle`; otherwise it uses `setAndAllowWhileIdle`, which may be delayed by Doze. No polling service runs.
* Each delivered occurrence is recorded. Replanning cannot replay a recorded occurrence. Missed recurring events collapse to the latest due occurrence rather than generating a backlog. Notification actions support **Seen** and **Snooze 1 day**. Deleting/revising a source event cancels its old schedule and snoozes.
* Daily inventory summaries calculate their text from the current SQLite inventory when delivered, skipping empty summaries. They run at the device's local clock time; user reminders retain VIKI's documented America/Phoenix scheduling. Reboot, app updates and clock changes restore/recalculate the next alarm.
* Backups use Android's system document picker, requiring no broad storage access. The import limit is 16 MiB. Device preferences and provider credentials are not included in the inventory backup.

## Permissions and limits

`INTERNET` is declared for optional provider connections; local inventory and notifications do not need networking. `POST_NOTIFICATIONS` is explained in Android-only first-launch setup on Android 13+, and requested only after selecting Enable notifications. The setup also explains exact-alarm access; Continue without alerts leaves inventory usable. Reopen setup from alert settings. Permission choices are checked again after returning from Android settings. `SCHEDULE_EXACT_ALARM` opens the system's special-access screen only when precise delivery is requested. `RECEIVE_BOOT_COMPLETED` restores schedules after the first unlock following reboot. Exact-alarm revocation may cancel scheduled exact alarms; open VIKI to reconcile and fall back to approximate delivery.

The app requests no microphone, contacts, location, broad file access, battery-exemption, advertising, or Google account permission. Voice is not a native feature in this first build. Screen-locked notification contents are private. Device encryption protects app storage while locked; VIKI does not add a separate database password.

Android force-stop prevents reminders until the user opens the app again. Powered-off devices cannot notify. Normal alarms are restored after unlock on reboot, not before first unlock. User-disabled notification channels or permissions prevent delivery. Android may throttle closely spaced idle alarms. Exact-alarm access improves scheduling during Doze but does not override these boundaries.

## Pixel/GrapheneOS acceptance checks

After installing over v0.1.0 with the same signing key, verify existing inventory and notification history migrate. Verify first-launch setup, permission denial, returning from system settings, fullscreen on/off, transient system bars, portrait/landscape display cutouts, keyboard appearance, and Settings buttons remain reachable. Then verify inventory/presets/favorites/reminders survive app process removal, reopening, offline use and reboot. Verify backup export and import through the system picker. Enable notifications, create a near-term reminder, lock the phone, and check delivery both with and without exact-alarm access. Verify Seen, Snooze, deleting a pending event, repeated app openings without duplicates, missed repeating reminders, timezone changes and daily summary time changes. Test real extended idle periods and revoked permissions. `adb shell dumpsys deviceidle force-idle` / `unforce` can supplement physical idle testing; do not claim those device checks passed merely because unit tests or compilation passed.

## Mobile update and backups

Version 0.2.0 (versionCode 2) upgrades the notification archive database in place from schema 1 to 2. Native viewport margins replace WebView padding, so fixed web controls sit inside status-bar, cutout, and keyboard insets. Fullscreen immersive mode is configurable; transient bars can be shown by swipe. First-launch permission setup is Android-only.

The system folder picker persists a user-granted backup directory. The live `viki.db` remains app-private; JSON snapshots can be saved in a different directory without moving SQLite onto a document provider. Weekly checks use a separate inexact AlarmManager event (no exact-alarm or notification permission needed for backups). They skip unchanged content, verify written bytes, and rotate only recognized automatic weekly files. Manual copies are retained. Folder access and real Doze behavior require device testing.

Run `python3 android/tests/test_notification_migration.py` from the repository root for host-SQLite migration coverage. Native JVM tests cover recurrence and backup retention/integrity policy. Filesystem-picker UI, cutout/IME behavior, and native weekly delivery still need Pixel 7a/GrapheneOS acceptance checks.
