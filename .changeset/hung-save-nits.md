---
"@tallyui/pos": minor
---

`useSale`'s hung-save check guard is now scoped per completion instead of a shared boolean: a sale whose `isStored` never settles can no longer block a later sale's own hung-save poll from ever confirming and offering Continue (medusapos's #85 review).

`useOrderOutbox`'s `isStored` now logs "A stored order has this id with different content" at most once per order id for the hook's lifetime, instead of on every 5 s poll of a hung save.

`useOrderOutbox` also exposes `savesInFlight: number`, the count of `record()` calls not yet settled, so an app can hold sign-out while a save is in flight.
