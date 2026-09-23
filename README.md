# VIKI

VIKI (Virtual Inventory Keeper Intelligence) is a browser-based household inventory assistant for tracking nutritional assets, degradation timelines, locations, and quantities.

## Run the app

Serve `Index.html` in a modern browser. VIKI stores inventory, presets, and favorite degradation rules in Supabase rather than browser local storage. Browser storage contains only device-specific preferences and the Supabase connection/session details required to reconnect.

## Supabase setup

1. Create a Supabase project and enable Email authentication.
2. Run [`supabase-schema.sql`](supabase-schema.sql) once in the project's SQL editor. It creates the `viki_state` table, enables Row Level Security, and restricts each state row to its authenticated owner.
3. Create an Email user in Supabase Authentication.
4. Open **Settings → Supabase Database** and enter the project URL, browser-safe anon key, login email, and password, then select **CONNECT_AND_SYNC**.

Never put the `service_role` key in VIKI. The settings form accepts the browser-safe anon key only. The password is sent directly to Supabase for sign-in and is not persisted; the resulting refresh session is stored in the browser. No npm dependency is required because this static application uses Supabase's documented Auth and PostgREST HTTP endpoints through the browser `fetch` API.

For installation and offline use, serve the repository over HTTPS (or localhost). VIKI includes a text-only web app manifest and service worker. The browser or operating system supplies its default home-screen icon so the update contains no image assets. Supporting desktop and Android browsers expose **INSTALL** when installation is available. On iPhone or iPad, select **INSTALL** for guidance and use Safari’s Share → **Add to Home Screen**. Direct `file://` use cannot register a service worker.

## Date and time behavior

VIKI derives the current date and time from the browser device with `new Date()`. The synchronized device timestamp is visible in the header and is used for degradation calculations, added dates, last-used dates, and AI context. Existing `addedDate` values are preserved unless an explicit edit action changes them.

## Filters and sorting

Use the arrow beside **Search assets // Filters** to minimize or restore the complete search and filter area without clearing the active view.

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

Enter a Venice API key in **Settings**, then select **Save AI settings**, or enable local Ollama mode. No API key is included in the source or data exports. The key is stored only in the current browser's `localStorage`. VIKI sends the current inventory snapshot and browser device timestamp to the configured service.

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

VIKI executes browser speech-recognition transcripts immediately, so voice capture does not require a separate confirmation control. Confirmations that are still appropriate for destructive or ambiguous operations happen in the conversation: reply with the requested value, `CONFIRM`, or `CANCEL`.

To queue several additions, use one natural list, for example: `add milk, 2 bread, and eggs`. VIKI recognizes the commas and conjunction, recalls every item on its own line, and waits without changing the registry. Reply `CONFIRM` to add the entire list, `CANCEL` to add nothing, or send a complete revised comma-separated list to adjust names or quantities. VIKI repeats a revised list for confirmation and, after adding, repeats only the final item list.

New items do not require a location or quantity. Quantity defaults to one. Every single-item or batch addition first searches **Tags & Preset Info** by canonical name and tag keywords, even when an LLM is enabled. Preset matches always win and do not invoke an LLM.

Historical additions accept `today`, `yesterday`, and relative day phrases such as `add eggs from two days ago` or `add 3 milk. I bought it two days ago`. Purchase/storage attribution clauses are removed before the item name is normalized, so the latter stores the asset as `milk`, not `milk i bought it`. VIKI stores the derived historical timestamp and calculates degradation from that actual stored date. For example, an item with a seven-day shelf life entered as stored two days ago displays approximately five days remaining. Explicitly dated stock is kept as a separate batch from same-name stock received on another date so each batch retains the correct degradation timeline.

Local parsing runs before powered enrichment for both single- and multi-item additions. Only items missing from Tags & Preset Info are sent for powered storage/category/shelf-life determination. Malformed commands and other local command errors can still be sent with the original request to VIKI for a “Did you mean…” review; any proposed corrective action is staged until confirmation.

Enable **NO_LLM mode** in Settings during a Venice, Ollama, API, or network outage. VIKI skips powered requests immediately. Unfamiliar items never receive a hard-coded fallback: VIKI asks the Operator for shelf-life days and saves the answer into Tags & Preset Info.

Unit-removal phrases such as `remove 3 eggs`, `used 3 eggs`, `tossed 3 eggs`, and `threw away 3 eggs` reduce the stored quantity instead of deleting the entire item. VIKI shows the exact registry spelling, requested quantity, and projected remainder before confirmation. `Remove eggs` and `remove all eggs` mean the full stored quantity and always require confirmation. If a name does not exactly match the registry, VIKI suggests the closest spelling or asks for the exact name again; it does not change inventory until the spelling and removal are confirmed.

When an item has no preset/tag match, VIKI automatically uses the configured powered service to determine its location, category, and shelf life. It saves that result as a new preset and then asks for final confirmation; there is no POWERED-versus-DEFAULT question. If powered inference is disabled or unavailable, VIKI asks how many shelf-life days to use, saves the answer as a reusable preset, and then presents the final addition review. In a batch, known items retain their presets while this process runs only for missing items.

Use `analyze ITEM` (or select an inventory card) for a web-supported shelf-life review. If current sources suggest that the stored total timeline is wrong, VIKI shows the current and proposed timelines and their calculated days remaining, then waits for confirmation. Analysis can update only `shelfLife`; it explicitly preserves `addedDate`, quantity, and location.

VIKI remains the conversational identity when a request needs model-powered interpretation. During that processing the header and response label display `VIKI [POWERED]`, without presenting a separate assistant persona. Approximate commands can be resolved with a natural “Did you mean…?” question and confirmed by replying `yes`. Common variants such as `delete everything`, `remove all items`, `clear the whole inventory`, and `wipe all assets` request a full registry clear and always require confirmation before any data is removed.

## Voice output and quick editing

VIKI speaks assistant and powered responses with the browser Web Speech Synthesis API. The `VOICE ON` / `VOICE OFF` control beside the chat input immediately mutes playback and stops queued speech. Settings provide a persistent speech enable switch, installed system voice selection, rate, and volume. Available voices depend on the browser and operating system; unsupported browsers continue to display text normally.

The separate **Wake Word** settings enable hands-free speech recognition, use `VIKI` (pronounced “Vicky”) by default, and allow a custom wake name. The silence timeout defaults to four seconds and can be set from 1–30 seconds. Say the wake word followed by a command, or say the wake word alone and speak after the visual/audio signal. After the configured silence interval, the recognition session stops; while wake-word mode is enabled, VIKI resumes monitoring where the browser permits it. Microphone permission and Web Speech Recognition support are required, and mobile browsers may suspend listening when the PWA is backgrounded or the screen is locked.

Submitting a new message immediately cancels current and queued speech. Responses from an older in-flight command are ignored after a newer command begins, so the newest VIKI response receives audio priority.

Long-press or long-click an asset quantity or degradation timer to enter a replacement value through the conversation. Keyboard users can focus either value and press Enter or Space. Quantity accepts zero or a positive decimal, while degradation timelines must be greater than zero.

Select the registry lock to open the asset registry as a full-page manual editor. Editable entries retain the normal asset-card structure and provide fields for names, quantities, units, categories, locations, shelf-life days, and stored date/time. **REMOVE** marks a card for deletion, **RESTORE** reverses that choice, and **SAVE** validates and persists all edits and removals together. Future stored dates are rejected. Selecting the unlocked icon discards unsaved edits. **EXPORT** downloads the same complete JSON backup available in Settings. While the page remains open, degradation values refresh every minute and again whenever the tab becomes visible, with remaining days always derived from the stored date plus total shelf life.

Every asset card displays both its days remaining and percentage of total shelf life remaining. The indicator continuously shifts from green toward orange and becomes red at 30% or less. This proportional threshold means, for example, that an item with a 180-day timeline becomes red at 54 days remaining rather than waiting for a fixed short-day warning.

Each card also has a pixel-style heart. Favoriting an item saves its current shelf-life duration as that item name’s custom degradation rule. Future additions with that name always use the custom duration and ask only for final confirmation while identifying the favorited custom setting. Unfavoriting removes the saved rule when no other batch of that item remains favorited.

Settings include optional EmailJS degradation alerts. When enabled and fully configured, VIKI sends one alert per item/day for assets with fewer than four days remaining. Supply recipient addresses plus an EmailJS service ID, template ID, and public key; the template receives `to_email`, `item_name`, `quantity`, `location`, `days_left`, and `message`. EmailJS browser public keys are supported, but Twilio SendGrid secret API keys must remain on a trusted server and must not be placed in this browser application.

Open **Settings** in the application header to edit the AI configuration, tag matching priority, unknown-item fallback, data tools, and preset rules in this format:

```text
food name | tag one, tag two | category | fridge | 7
```

The matching priority can prefer exact food names or tags. Preset names, tags, categories, locations, shelf lives, inventory, and favorite rules synchronize to the authenticated Supabase state. Device-only UI and service credentials remain in browser storage.

## Reminders

Enter `Add Reminder` in the conversation to create an email reminder without requiring an LLM. VIKI collects the subject verbatim, optional notes verbatim, two distinct timestamps, and recipients in sequence. The first timestamp (`reminder_datetime`) controls when the email is sent; the second (`event_datetime`) identifies when the actual event or deadline occurs. Dates may be entered with explicit labels separated by a pipe, semicolon, or new line, for example:

```text
REMINDER: October 10, 2026 at 9:00 AM | EVENT: October 10, 2026 at 2:00 PM
```

Common ISO, US numeric, month-name, `today`, `tomorrow`, and relative inputs such as `in 2 hours` are handled locally. If a combined date response remains ambiguous and AI is enabled, VIKI asks the configured model only to normalize the two timestamps; subjects and notes are never rewritten. With NO_LLM enabled, VIKI asks for the send time and event time separately instead.

Dates and times without an explicit timezone are constructed in the browser/device's local timezone rather than UTC. Explicit offsets such as `Z`, `-04:00`, or `+01:00` are preserved as absolute instants. The future-time validation and due-reminder check use that same browser clock, and a rejected time reports the locally interpreted value for easier correction.

Configure the independent **Reminder Emails [EmailJS]** section with Abel's and Anna's reference addresses plus a reminder-specific EmailJS service ID, template ID, and public key. A reminder can target Abel, Anna, both, or one or more custom addresses entered during creation. The reminder EmailJS template should use:

```text
To Email: {{to_email}}
Subject: {{reminder_subject}}
Body/notes: {{reminder_body}}
Reminder send time: {{reminder_datetime}}
Event/deadline time: {{event_datetime}}
```

Pending and sent reminders synchronize inside the authenticated Supabase state. Delivery checks run when VIKI loads and once per minute while the application remains open; GitHub Pages cannot execute scheduled browser JavaScript while every VIKI tab is closed. Enter `Reminders` or `List reminders` to review pending schedules.

Select the **ASSET_REGISTRY** title to switch to **REMINDER_REG**. Reminder cards expose the subject, optional email body, recipients, reminder send time, and separate event/deadline time for direct editing. Each card can be saved or deleted, and the registry can be filtered to all reminders or those addressed to the configured Abel or Anna email. Select the title again to return to assets. The shortened reminder title remains on one line beside the registry actions at default zoom, while the stacked mobile layout and installable PWA use the same controls.
