---
'@tallyui/connector-medusa': minor
---

The admin-user Medusa connector implements `productEdit` for a variant's base price in the till currency (ADR-095).
An edit is saved only when the store's answer shows every other price as read and the edited price at the amount sent; otherwise it rejects with `ProductEditPricesChangedError`.
