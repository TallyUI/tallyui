---
'@tallyui/core': minor
---

Adds the optional `TallyConnector.productEdit` surface with `decideProductEdit` and the `editProducts` cashier permission (ADR-095).
No connector grants the permission yet.
`ProductEditPricesChangedError` (a `CustomerServiceError` with `priceIds`) reports a write whose answer shows other prices than those sent.
