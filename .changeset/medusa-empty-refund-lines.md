---
"@tallyui/connector-medusa": patch
---

A till refund the MedusaPOS plugin reports with no lines (shipping or adjustment only) now reaches the till as known, empty lines rather than unknown (medusapos#644).
An order whose plugin row names the same refund twice gets no refund lines.
