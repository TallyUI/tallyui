---
'@tallyui/connector-woocommerce': minor
---

A WooCommerce customer read by search, get, create or update now carries its `billing` and `shipping` address, mapped from the Woo address fields under `CustomerAddress` names. Empty and null fields are left out, an address with no field left is left out, and shipping never carries an email. An edit that saves a read customer's address back now sends the stored address instead of a blank one.
