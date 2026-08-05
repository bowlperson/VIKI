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
