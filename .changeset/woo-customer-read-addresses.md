---
'@tallyui/connector-woocommerce': minor
---

A WooCommerce customer read by search, get, create or update now carries its `billing` and `shipping` address, mapped from the Woo address fields under `CustomerAddress` names. Empty and null fields are left out, an address with no field left is left out, and shipping never carries an email. An edit that saves a read customer's address back now sends the stored address instead of a blank one.

A customer whose Woo billing holds only contact details (name, company, email, phone) now reads with a `billing` of those fields. On a store that takes order.create 8, a picked customer's address now reaches the sale: its billing country, when present, sets the tax location, and its billing and shipping go on the order.
