# VIKI

VIKI (Virtual Inventory Keeper Intelligence) is a browser-based household inventory assistant for tracking nutritional assets, degradation timelines, locations, and quantities.

## Run the desktop HTML app

VIKI shares one HTML/JavaScript interface between the browser version and the Android APK. Inventory, presets, favorites, reminders, and cash profiles save locally by default: IndexedDB in the browser and SQLite in Android. No account, Supabase project, AI service, or Google service is needed for core operation. New installations start in **NO_LLM mode**; unknown items ask for shelf-life days locally.

From the repository root, run:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open the locally served app in a modern browser. Keep the same hostname and port when returning: browser storage belongs to that origin. Only one writable tab per origin is allowed, preventing stale tabs from overwriting each other; close the first tab and reload the second to switch. The file is named `index.html` in lowercase. Serve over localhost or HTTPS for IndexedDB and the service worker; double-clicking a `file://` document is not the supported workflow.

The service worker caches the app shell for offline browser use after the first successful load. Fonts use installed system fonts. Supporting browsers offer PWA installation; on iPhone/iPad use Safari's Share → **Add to Home Screen**. The APK bundles the same assets and does not need an initial website download.

### Development checks

Python 3 serves the app without an installation or build step. The test suite additionally uses Node.js and Playwright:

```sh
npm ci
npx playwright install chromium
npm test
```

`npm test` runs storage/planning tests and browser checks for local inventory, favorites, reminder creation, persistence, backups, notification duplicate suppression, and mocked optional Supabase transfers. `CHROMIUM_PATH` can select an installed Chromium executable instead of Playwright's downloaded browser. Browser tests do not establish Android or GrapheneOS behavior.

## Android APK

The native Java wrapper uses Android WebView, SQLite, AlarmManager, and notification channels. It has no Google Play Services, Firebase, advertising, or analytics dependency. It targets a Google-independent installation on devices such as a Pixel 7a running GrapheneOS; physical-device validation is still required.

See [Android build and device checks](android/README.md) for toolchain, APK generation, signing, and device-test instructions. With Java 17 or newer and Android SDK 35 installed, run:

```sh
cd android
./gradlew testDebugUnitTest assembleDebug
```

In the prepared cloud workspace, `npm run android:build` (or `bash scripts/android-build.sh`) selects the installed JDK/SDK and runs native tests, APK assembly, and lint. The helper also accepts individual Gradle task names.

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk` relative to the repository root. The Android build copies the root web assets, so browser and APK development use the same application source. Rebuild the APK to include web changes. A debug APK is for development; a distributable release requires your own signing key, retained securely for future updates.

The initial APK does not request microphone access and does not provide browser voice recognition or background wake-word listening. Optional hosted integrations use HTTPS; cleartext local Ollama access is not supported by this APK.

### Downloading the test APK

The deployed website serves the development APK at `downloads/`, with its SHA-256 checksum and installation notes. The same files are committed in [downloads](downloads/) so the testing build is accessible from GitHub before deployment. This is a debug-signed build, not a production release.

Pages publishes from `main`; merge this branch and let the existing Pages workflow finish to publish the web app and APK download together. `bash scripts/stage-site.sh` prepares the same public files locally, verifying the APK checksum and excluding source tooling and build caches. When updating the downloadable APK, replace `downloads/viki-debug.apk` and its checksum together.

## Local data and backups

Use **EXPORT** or **Settings → Export data** to save a versioned JSON backup. Browser and APK exports use the same format, retaining inventory, presets, favorite rules, reminders, cash profiles, and model preferences. Import validates the package before replacing those fields; export first if you need to retain the current registry. Android uses the system document picker, and the browser downloads/uploads a file. No broad file-access permission is required.

Connection credentials and device notification permissions/history are not part of the portable backup. Reconfigure notification choices on each device. Clearing browser site data, clearing Android app data, uninstalling, or losing the device can remove the local database. Browser storage may also be evicted by the browser. Keep exported backups outside the app; optional cloud copies are another explicit backup path. Save failures are shown in the app rather than silently switching to temporary storage.

## Supabase — optional cloud copy

Supabase is disconnected by default. Existing Email authentication, Auth/PostgREST endpoints, the `viki_state` JSON state column, and owner-based Row Level Security remain supported. Local changes do not automatically upload, download, or merge with another device.

1. Create a Supabase project and enable Email authentication.
2. Run [`supabase-schema.sql`](supabase-schema.sql) once in the project's SQL editor. It creates `viki_state`, enables Row Level Security, and restricts each row to its authenticated owner. Existing projects with that schema do not need a different storage table.
3. Create an Email user in Supabase Authentication.
4. Open **Settings → Supabase — Optional Cloud Copy**, enter the project URL, browser-safe anon key, login email, and password, then select **CONNECT**. Connecting authenticates without replacing local data.
5. Choose **UPLOAD_LOCAL_COPY** to replace the account's cloud registry, or **DOWNLOAD_CLOUD_COPY** to replace this device's registry. Both transfers require an explicit confirmation. Export a backup first if both copies matter.

There is no automatic conflict resolution: the selected whole-registry copy wins. Device notification settings/history stay on the device. Disconnecting preserves local inventory and reminders. Restarting the app does not automatically connect to Supabase; saved connection/session information is used only when explicitly connecting.

Never enter a `service_role` key. The password is used for sign-in and is not persisted; connection details and the resulting refresh session are retained in the app's browser storage. Credentials are excluded from exports. No Supabase SDK or npm runtime dependency is required: the app uses documented HTTPS Auth and PostgREST requests. Testing against mocked endpoints does not validate authorization or schema in your live project.

## Local notifications and reminders

Open **Settings → On-device Notifications** and enable alerts explicitly. Choose daily summaries, item milestones, and scheduled reminders independently, then select **SAVE_NOTIFICATIONS**.

- Daily summaries use the device's local time and list items with three days or less remaining, including expired stock. Empty summaries are skipped. Keeping daily summaries enabled deliberately repeats that daily review.
- Optional item milestones fire once per inventory batch/shelf-life revision at 30%, 15%, and expiration. Percentage warnings apply only when more than three days remain. Catch-up chooses the most recent crossed milestone rather than sending every old stage; delivery history prevents the same stage repeating hourly.
- Scheduled reminders retain their Tucson/Phoenix time semantics and can repeat daily, weekly, or monthly. Local delivery does not depend on email delivery or Supabase.
- **Seen** acknowledges a delivered occurrence; **Snooze** requests one follow-up the next day. Deleting an item/reminder cancels its pending schedule. Editing its shelf-life timeline can create a new set of milestones.

Android persists schedules and delivery history in SQLite and schedules the next needed alarm instead of polling hourly. Grant notification permission to display alerts. **ALLOW_PRECISE_REMINDERS** opens Android's separate exact-alarm access setting; with that access the scheduler uses alarms allowed during Doze. Without it, scheduling is approximate and may be delayed. Android's own alarm limits still apply; exact-alarm access is not an unconditional delivery guarantee.

The app restores schedules after reboot, app updates, and clock/timezone changes. Storage is credential-protected: reboot recovery occurs after the first unlock. Powering off, force-stopping the app, revoking permissions, or disabling notifications can prevent delivery. Open VIKI again after a force-stop. Test locked-screen and extended-idle delivery on the actual target phone before relying on important reminders.

The APK declares `INTERNET` for optional integrations, `POST_NOTIFICATIONS` for visible alerts, `RECEIVE_BOOT_COMPLETED` to restore schedules, and `SCHEDULE_EXACT_ALARM` for optional precise delivery. It does not request Google account, contacts, SMS, location, microphone, broad storage, or unrestricted battery access.

In the HTML version, reminder checks and notifications operate only while VIKI is open, and background tabs may be throttled. There is no browser closed-tab scheduling guarantee. Android's notification shade supplies native actions; browser notification history in Settings supplies Seen/Snooze controls.

## Date and time behavior

VIKI derives the current date and time from the browser device with `new Date()`. The synchronized device timestamp is visible in the header and is used for degradation calculations, added dates, last-used dates, and AI context. Existing `addedDate` values are preserved unless an explicit edit action changes them.

## Filters and sorting

The **Search assets // Filters** area starts closed. Use its arrow to show or hide the complete search and filter area without clearing the active view.

The asset registry can be filtered by:

- Location: all, fridge, freezer, or cupboard.
- Search text across name, category, and location.
- Category.
- Status: all, fresh, expiring soon, expired, or hide expired.
- Quantity: all, low quantity, stocked, or fractional.
- Age: all, added today, added this week, added this month, or never used.
- Days left: minimum and maximum degradation days remaining.
- Added date range: added on/after and added on/before.

Sort options include expiration soonest, name, location, recently added, quantity low-to-high, quantity high-to-low, and oldest added.

## AI configuration

AI is optional and disabled through **NO_LLM mode** by default. To opt in, disable NO_LLM mode, enter a Venice API key in **Settings**, then select **Save AI settings**. The desktop HTML version can also use local Ollama mode; the APK blocks its cleartext HTTP endpoint. No API key is included in the source or data exports. The key is stored only in the current browser's `localStorage`. VIKI sends the current inventory snapshot and browser device timestamp to the configured service.

AI responses are required to be JSON objects with this shape:

```json
{
  "message": "Acknowledged, Operator. ...",
  "actions": []
}
```

Supported actions are validated before being applied:

- `add_item`
- `consume_item`
- `modify_item`
- `remove_item`
- `set_view`
- `update_settings`

VIKI receives a persistent identity system prompt and recent conversation context on every model request. Venice requests automatically enable web search and citations when the model determines that current information is needed, allowing VIKI to answer forecast, headline, and other live-information questions. Local Ollama can answer from its own knowledge but does not gain a web-search backend from VIKI.

VIKI can propose changes to registry content, filters, the unknown-item fallback, matching priority, and voice settings. Registry removals, consumption, modifications, and application-setting changes are staged for explicit Operator confirmation before they execute. Browser and operating-system security boundaries remain in force: this web application cannot edit the Windows registry, arbitrary system files, or settings outside its own browser storage.

If an action is rejected, VIKI displays an error and does not silently mutate unrelated inventory data.

## Conversation and sorting rules

Where browser speech recognition is available, VIKI executes its transcripts immediately, so voice capture does not require a separate confirmation control. Confirmations that are still appropriate for destructive or ambiguous operations happen in the conversation: reply with the requested value, `CONFIRM`, or `CANCEL`.

To queue several additions, use one natural list, for example: `add milk, 2 bread, and eggs`. VIKI recognizes the commas and conjunction, recalls every item on its own line, and waits without changing the registry. Reply `CONFIRM` to add the entire list, `CANCEL` to add nothing, or send a complete revised comma-separated list to adjust names or quantities. VIKI repeats a revised list for confirmation and, after adding, repeats only the final item list.

New items do not require a location or quantity. Quantity defaults to one. Every single-item or batch addition first searches **Tags & Preset Info** by canonical name and tag keywords, even when an LLM is enabled. Preset matches always win and do not invoke an LLM.

Historical additions accept `today`, `yesterday`, and relative day phrases such as `add eggs from two days ago` or `add 3 milk. I bought it two days ago`. Purchase/storage attribution clauses are removed before the item name is normalized, so the latter stores the asset as `milk`, not `milk i bought it`. VIKI stores the derived historical timestamp and calculates degradation from that actual stored date. For example, an item with a seven-day shelf life entered as stored two days ago displays approximately five days remaining. Explicitly dated stock is kept as a separate batch from same-name stock received on another date so each batch retains the correct degradation timeline.

Local parsing runs before powered enrichment for both single- and multi-item additions. Only items missing from Tags & Preset Info are sent for powered storage/category/shelf-life determination. Malformed commands and other local command errors can still be sent with the original request to VIKI for a “Did you mean…” review; any proposed corrective action is staged until confirmation.

Enable **NO_LLM mode** in Settings during a Venice, Ollama, API, or network outage. VIKI skips powered requests immediately. Unfamiliar items never receive a hard-coded fallback: VIKI asks the Operator for shelf-life days and saves the answer into Tags & Preset Info.

Unit-removal phrases such as `remove 3 eggs`, `used 3 eggs`, `tossed 3 eggs`, and `threw away 3 eggs` reduce the stored quantity instead of deleting the entire item. VIKI shows the exact registry spelling, requested quantity, and projected remainder before confirmation. `Remove eggs` and `remove all eggs` mean the full stored quantity and always require confirmation. If a name does not exactly match the registry, VIKI suggests the closest spelling or asks for the exact name again; it does not change inventory until the spelling and removal are confirmed.

When an item has no preset/tag match, VIKI automatically uses the configured powered service to determine its location, category, and shelf life. It saves that result as a new preset and then asks for final confirmation; there is no POWERED-versus-DEFAULT question. If powered inference is disabled or unavailable, VIKI asks how many shelf-life days to use, saves the answer as a reusable preset, and then presents the final addition review. In a batch, known items retain their presets while this process runs only for missing items.

Use `analyze ITEM` for a web-supported shelf-life review. Inventory cards do not trigger analysis when selected. If current sources suggest that the stored total timeline is wrong, VIKI shows the current and proposed timelines and their calculated days remaining, then waits for confirmation. Analysis can update only `shelfLife`; it explicitly preserves `addedDate`, quantity, and location.

VIKI remains the conversational identity when a request needs model-powered interpretation. During that processing the header and response label display `VIKI [POWERED]`, without presenting a separate assistant persona. Approximate commands can be resolved with a natural “Did you mean…?” question and confirmed by replying `yes`. Common variants such as `delete everything`, `remove all items`, `clear the whole inventory`, and `wipe all assets` request a full registry clear and always require confirmation before any data is removed.

## Voice output and quick editing

VIKI speaks assistant and powered responses with the browser Web Speech Synthesis API. The `VOICE ON` / `VOICE OFF` control beside the chat input immediately mutes playback and stops queued speech. Settings provide a persistent speech enable switch, installed system voice selection, rate, and volume. Available voices depend on the browser and operating system; unsupported browsers continue to display text normally.

The chat shortcuts provide direct access to reminder creation, degradation status, and the full registry. The **CUSTOM** shortcut sends the exact message configured under **Settings → Custom**; it does nothing when that setting is blank.

The **DAILY** shortcut sends the exact `Daily briefing` command. That exact command retrieves only the current day's conditions, high, low, and precipitation from Open-Meteo, followed by six recent world stories from The Guardian Open Platform with each article's headline, source, date, and summary. It renders once under **DAILY BRIEFING** directly from verified API fields and never invokes the language model. Under **Settings → Daily Briefing APIs**, configure the location, choose Fahrenheit (the default) or Celsius, and enter the Guardian developer key. Other weather phrasings—including `what's the weather tomorrow?` and the apostrophe-free `whats the weather tomorrow?`—retrieve the required Open-Meteo forecast days before the configured language model responds. Other briefing and headline requests similarly use fresh Guardian data. After a briefing, commands such as `read article 5`, `expand on article 2`, or `summarize article 1` send only the selected article's full Guardian text to the model for a detailed original summary; VIKI reports when API data or article text is unavailable rather than inventing details.

The separate **Wake Word** settings enable hands-free speech recognition, use `VIKI` (pronounced “Vicky”) by default, and allow a custom wake name. The silence timeout defaults to four seconds and can be set from 1–30 seconds. Say the wake word followed by a command, or say the wake word alone and speak after the visual/audio signal. After the configured silence interval, the recognition session stops; while wake-word mode is enabled, VIKI resumes monitoring where the browser permits it. Microphone permission and Web Speech Recognition support are required, and mobile browsers may suspend listening when the PWA is backgrounded or the screen is locked.

Submitting a new message immediately cancels current and queued speech. Responses from an older in-flight command are ignored after a newer command begins, so the newest VIKI response receives audio priority.

Long-press or long-click an asset quantity or degradation timer to enter a replacement value through the conversation. Keyboard users can focus either value and press Enter or Space. Quantity accepts zero or a positive decimal, while degradation timelines must be greater than zero.

Select the registry lock to open the asset registry as a full-page manual editor. Editable entries retain the normal asset-card structure and provide fields for names, quantities, units, categories, locations, shelf-life days, and stored date/time. **REMOVE** marks a card for deletion, **RESTORE** reverses that choice, and **SAVE** validates and persists all edits and removals together. Future stored dates are rejected. Selecting the unlocked icon discards unsaved edits. **EXPORT** downloads the same complete JSON backup available in Settings. While the page remains open, degradation values refresh every minute and again whenever the tab becomes visible, with remaining days always derived from the stored date plus total shelf life.

Every asset card displays both its days remaining and percentage of total shelf life remaining. The indicator continuously shifts from green toward orange and becomes red at 30% or less. This proportional threshold means, for example, that an item with a 180-day timeline becomes red at 54 days remaining rather than waiting for a fixed short-day warning.

Each card also has a pixel-style heart. Favoriting an item saves its current shelf-life duration as that item name’s custom degradation rule. Future additions with that name always use the custom duration and ask only for final confirmation while identifying the favorited custom setting. Unfavoriting removes the saved rule when no other batch of that item remains favorited.

Settings include optional EmailJS degradation alerts. When enabled and fully configured, VIKI sends a one-time alert when an asset displays exactly 30% remaining and another one-time alert when it displays exactly 15% remaining, but only while more than three days remain. These percentage milestones do not fire merely because an asset is below either percentage, and they are suppressed at three days or less to avoid duplicating the short-term alert. VIKI continues to send one alert per item/day for assets with fewer than four days remaining, including degraded assets, until the item is removed from inventory. Supply recipient addresses plus an EmailJS service ID, template ID, and public key; the template receives `to_email`, `item_name`, `quantity`, `location`, `days_left`, `percentage_remaining`, `alert_type`, and `message`. EmailJS browser public keys are supported, but Twilio SendGrid secret API keys must remain on a trusted server and must not be placed in this browser application.

Open **Settings** in the application header to edit the AI configuration, tag matching priority, unknown-item fallback, data tools, and preset rules in this format:

```text
food name | tag one, tag two | category | fridge | 7
```

The matching priority can prefer exact food names or tags. Preset names, tags, categories, locations, shelf lives, inventory, and favorite rules save in the local database. They are included in explicit optional Supabase copy transfers. Device-only UI preferences and service credentials remain in browser storage.

## Reminders

Enter `Add Reminder` to create a local reminder without an LLM. Reply **LOCAL** at the recipient question to avoid email entirely, or enter optional email recipients. Enable scheduled reminders in On-device Notifications for local delivery. VIKI collects the subject and optional notes verbatim, then asks for **Reminder 1** and **Reminder 2 in separate messages**. Reminder 1 is required. Reply `NONE` when asked for Reminder 2 to opt out. At the end of setup, VIKI asks whether the schedule should repeat; reply `Once`/`None`, `Daily`, `Weekly`, or `Monthly`. If both reminder times are supplied, Reminder 2 must be later than Reminder 1 and both times produce local notifications when enabled; optional configured email delivery uses the same subject, body, and recipients.

```text
VIKI: When should Reminder 1 send?
OPERATOR: October 10, 2026 at 9:00 AM
VIKI: When should Reminder 2 send? Enter a Tucson date/time, or reply NONE.
OPERATOR: October 10, 2026 at 1:00 PM
```

Common ISO, US numeric, month-name, `today`, `tomorrow`, and relative inputs such as `in 2 hours` are handled locally. Reminder date parsing never calls the configured model.

Reminder scheduling uses Tucson, Arizona (`America/Phoenix`, UTC−07:00/MST year-round) regardless of the device's configured timezone. On the hosted app, VIKI periodically reads the same-origin HTTP `Date` response header as a server-clock reference and falls back to the device clock if the network is unavailable. Inputs such as `today @ 5:30pm` and confirmation corrections such as `set it to 5:30pm` therefore mean 5:30 PM Tucson time. Explicit offsets such as `Z`, `-04:00`, or `+01:00` remain absolute instants. Validation messages, registry fields, reports, and EmailJS reminder timestamps are all displayed in MST.

For optional email delivery, configure the independent **Reminder Emails [EmailJS]** section with Abel's and Anna's reference addresses plus a reminder-specific EmailJS service ID, template ID, and public key. A reminder can target Abel, Anna, both, or one or more custom addresses entered during creation. The reminder EmailJS template should use:

```text
To Email: {{to_email}}
Subject: {{reminder_subject}}
Body/notes: {{reminder_body}}
Reminder send time: {{reminder_datetime}}
Which send: {{reminder_number}}
Reminder 1 time: {{reminder_1_datetime}}
Reminder 2 time: {{reminder_2_datetime}}
```

Pending and sent reminders save locally and are included in explicit optional Supabase transfers. EmailJS delivery checks run when VIKI loads and once per minute while it remains open; they are separate from native local notifications. Email is not guaranteed while the APK is closed, and GitHub Pages cannot execute scheduled browser JavaScript while every VIKI tab is closed. Enter `Reminders` or `List reminders` to review pending schedules.

Select the **ASSET_REGISTRY** title to switch to **REMINDER_REG**. Reminder cards expose the subject, optional email body, recipients, required Reminder 1 time, optional Reminder 2 time, and Once/None, Daily, Weekly, or Monthly repeat setting for direct editing. Each card can be saved or deleted, and the registry can be filtered to all reminders or those addressed to the configured Abel or Anna email. Select the title again to return to assets. The shortened reminder title remains on one line beside the registry actions at default zoom, while the stacked mobile layout and installable PWA use the same controls.
