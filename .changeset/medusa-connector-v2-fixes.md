---
"@tallyui/connector-medusa": patch
---

Fix the Medusa connector against a real Medusa v2 (2.21) backend: send the secret API key over HTTP Basic auth (Medusa rejects it as a Bearer token), read prices as major units (v2 does not store cents), derive stock from inventory levels (the Admin API does not compute `inventory_quantity`), and pull products in `updated_at` order so the checkpoint is valid.
