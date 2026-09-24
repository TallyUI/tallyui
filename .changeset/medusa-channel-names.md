---
"@tallyui/connector-medusa": patch
---

`medusaStoreSettings`'s `choice_required` channel choices are named after the publishable key's sales channel(s) (joined with ", " when there is more than one), not the key's own developer-facing title. A key with no sales channel, or only blank channel names, still falls back to its title.
