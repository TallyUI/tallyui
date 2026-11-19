---
'@tallyui/pos': minor
---

The till sends a sale's untaxed customer addresses at order.create 11 (`UNTAXED_ADDRESS_ORDER_CREATE_VERSION`, now `ORDER_CREATE_MAX_VERSION`) when the store's cap is 11 or more and the sale meets 10's requirements; every other sale's version and bytes are unchanged, and below 11 the addresses are dropped, never an error. `finalizeOrder` stores the customer's non-empty addresses on every order. `pos_orders` goes to schema 17 (identity migration, one-way like 16): `sentVersion` and `downgradedFrom` may be 11.
