# VIKI

VIKI (Virtual Inventory Keeper Intelligence) is a browser-based household inventory assistant for tracking nutritional assets, degradation timelines, locations, and quantities.

## Run the app

Serve `Index.html` in a modern browser. Inventory, presets, and favorite rules are stored in Supabase rather than browser storage. Run `supabase-schema.sql` in the Supabase SQL editor, create an email/password user in Supabase Auth, and enter the project URL, anon key, email, and password in **Settings → Supabase Database**. VIKI does not ship with credentials and does not persist the account password.

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

New items do not require a location or quantity. Quantity defaults to one. For every single or batch addition, VIKI first checks exact preset names and keyword tags in **Tags & Preset Info**, even when an LLM is enabled. It invokes the configured LLM only for items missing from presets, saves each usable powered result as a new preset, and then presents the addition for confirmation. In NO_LLM mode, VIKI asks for shelf-life days for every missing item instead of silently assigning a 14-day default; the answer is saved as a preset for future additions.

Historical additions accept `today`, `yesterday`, and relative day phrases such as `add eggs from two days ago` or `add 3 milk. I bought it two days ago`. Purchase/storage attribution clauses are removed before the item name is normalized, so the latter stores the asset as `milk`, not `milk i bought it`. VIKI stores the derived historical timestamp and calculates degradation from that actual stored date. For example, an item with a seven-day shelf life entered as stored two days ago displays approximately five days remaining. Explicitly dated stock is kept as a separate batch from same-name stock received on another date so each batch retains the correct degradation timeline.

Single- and multi-word additions use the local parser and preset lookup first. Only missing preset entries are routed through the configured AI before any registry change. Malformed commands, validation failures, thrown processing anomalies, and other local command errors can still be sent with the original request to VIKI for a “Did you mean…” review; any proposed corrective action is staged until confirmation.

Enable **NO_LLM mode** in Settings during a Venice, Ollama, API, or network outage. VIKI then skips powered requests immediately: additions use the local parser, unfamiliar items prompt for shelf-life days, and returned errors remain local rather than waiting for an unavailable service.

Unit-removal phrases such as `remove 3 eggs`, `used 3 eggs`, `tossed 3 eggs`, and `threw away 3 eggs` reduce the stored quantity instead of deleting the entire item. VIKI shows the exact registry spelling, requested quantity, and projected remainder before confirmation. `Remove eggs` and `remove all eggs` mean the full stored quantity and always require confirmation. If a name does not exactly match the registry, VIKI suggests the closest spelling or asks for the exact name again; it does not change inventory until the spelling and removal are confirmed.

When a new item does not match a preset name or tag, VIKI automatically uses the configured AI to fill only that missing preset. It never asks the Operator to choose between preset and powered behavior. If powered inference is disabled or unavailable, VIKI asks for a shelf-life day count, saves that answer to presets, and proceeds to the normal confirmation. In a mixed batch, known items retain their preset data while only missing items are inferred or queried.

Use `analyze ITEM` (or select an inventory card) for a web-supported shelf-life review. If current sources suggest that the stored total timeline is wrong, VIKI shows the current and proposed timelines and their calculated days remaining, then waits for confirmation. Analysis can update only `shelfLife`; it explicitly preserves `addedDate`, quantity, and location.

VIKI remains the conversational identity when a request needs model-powered interpretation. During that processing the header and response label display `VIKI [POWERED]`, without presenting a separate assistant persona. Approximate commands can be resolved with a natural “Did you mean…?” question and confirmed by replying `yes`. Common variants such as `delete everything`, `remove all items`, `clear the whole inventory`, and `wipe all assets` request a full registry clear and always require confirmation before any data is removed.

## Voice output and quick editing

VIKI speaks assistant and powered responses with the browser Web Speech Synthesis API. The `VOICE ON` / `VOICE OFF` control beside the chat input immediately mutes playback and stops queued speech. Settings provide a persistent speech enable switch, installed system voice selection, rate, and volume. Available voices depend on the browser and operating system; unsupported browsers continue to display text normally.

Submitting a new message immediately cancels current and queued speech. Responses from an older in-flight command are ignored after a newer command begins, so the newest VIKI response receives audio priority.

Long-press or long-click an asset quantity or degradation timer to enter a replacement value through the conversation. Keyboard users can focus either value and press Enter or Space. Quantity accepts zero or a positive decimal, while degradation timelines must be greater than zero.

Select the registry lock to open the asset registry as a full-page manual editor. Editable entries retain the normal asset-card structure and provide fields for names, quantities, units, categories, locations, shelf-life days, and stored date/time. **REMOVE** marks a card for deletion, **RESTORE** reverses that choice, and **SAVE** validates and persists all edits and removals together. Future stored dates are rejected. Selecting the unlocked icon discards unsaved edits. **EXPORT** downloads the same complete JSON backup available in Settings. While the page remains open, degradation values refresh every minute and again whenever the tab becomes visible, with remaining days always derived from the stored date plus total shelf life.

Every asset card displays both its days remaining and percentage of total shelf life remaining. The indicator continuously shifts from green toward orange and becomes red at 30% or less. This proportional threshold means, for example, that an item with a 180-day timeline becomes red at 54 days remaining rather than waiting for a fixed short-day warning.

Each card also has a pixel-style heart. Favoriting an item saves its current shelf-life duration as that item name’s custom degradation rule. Future additions with that name always use the custom duration; VIKI skips the POWERED/DEFAULT/custom choice and asks only for final confirmation while identifying the favorited custom setting. Unfavoriting removes the saved rule when no other batch of that item remains favorited.

Settings include optional EmailJS degradation alerts. When enabled and fully configured, VIKI sends one alert per item/day for assets with fewer than four days remaining. Supply recipient addresses plus an EmailJS service ID, template ID, and public key; the template receives `to_email`, `item_name`, `quantity`, `location`, `days_left`, and `message`. EmailJS browser public keys are supported, but Twilio SendGrid secret API keys must remain on a trusted server and must not be placed in this browser application.

Open **Settings** in the application header to edit the AI configuration, tag matching priority, unknown-item fallback, data tools, and preset rules in this format:

```text
food name | tag one, tag two | category | fridge | 7
```

The matching priority can prefer exact food names or tags. Preset names, tags, categories, locations, shelf lives, and favorite rules are synchronized to the authenticated Operator's Supabase row and are included in the context sent to the configured AI. Browser storage is used only for connection and interface preferences; the Supabase account password is not persisted.
