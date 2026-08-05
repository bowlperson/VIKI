# VIKI

VIKI (Virtual Inventory Keeper Intelligence) is a browser-based household inventory assistant for tracking nutritional assets, degradation timelines, locations, and quantities.

## Run the app

Open `Index.html` in a modern browser. The app stores inventory in `localStorage`, so data persists in the browser profile on the device being used.

## Date and time behavior

VIKI derives the current date and time from the browser device with `new Date()`. The synchronized device timestamp is visible in the header and is used for degradation calculations, added dates, last-used dates, and AI context. Existing `addedDate` values are preserved unless an explicit edit action changes them.

## Filters and sorting

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

Enter a Venice API key in the configuration panel, or enable local Ollama mode. VIKI sends the current inventory snapshot and the browser device timestamp to the AI.

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

If an action is rejected, VIKI displays an error and does not silently mutate unrelated inventory data.

## Conversation and sorting rules

VIKI executes browser speech-recognition transcripts immediately, so voice capture does not require a separate confirmation control. Confirmations that are still appropriate for destructive or ambiguous operations happen in the conversation: reply with the requested value, `CONFIRM`, or `CANCEL`.

New items do not require a location or quantity. Quantity defaults to one, while location, category, and shelf life are inferred from exact food rules, configurable tags, built-in food-storage heuristics, and finally the configured unknown-item location.

Open **Sorting & Tag Settings** in the configuration section to edit rules in this format:

```text
food name | tag one, tag two | fridge | 7
```

Rules and the unknown-item default are stored locally in the browser and are included in the context sent to the configured AI.
