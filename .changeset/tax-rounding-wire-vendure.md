---
"@tallyui/connector-vendure": minor
---

Read the store's capabilities and `taxRounding` from the Vendure plugin's `/tally/v1/info` (#287): `vendureSignIn` returns `capabilities`, and the connector gains `capabilities(context)` for a restored session or an API key.
