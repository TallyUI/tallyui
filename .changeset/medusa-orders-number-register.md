---
'@tallyui/core': minor
'@tallyui/connector-medusa': minor
---

`ServerCapabilities.pluginContract` carries `/tally/v1/info`'s top-level `pluginContract`. The Medusa connector's `listOrders` sends register filters and 1-6 digit searches (display numbers) through the MedusaPOS plugin's `GET /tally/v1/orders` at plugin contract 3, reading the rows from the admin API so every order maps the same way; `medusaOrderFilters(capabilities)` gives the filter fields a store honours (#1114).
