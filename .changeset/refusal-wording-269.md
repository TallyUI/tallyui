---
'@tallyui/components': patch
'@tallyui/pos': patch
---

`OrdersList` shows a rejected sale's refusal in the cashier's words, one sentence per error code (#269), in both Needs attention and Recent, and never the store's own message. An unknown code, or a rejected sale with no error, shows `platform_error`'s sentence: "The online store refused this sale. Ask the store owner to look at the till's sync log." An `idempotency_mismatch` shows its sentence ("… Don't send it again; ask the store owner to compare the two.") in place of the old "This sale needs checking against the store before it can be sent again." line, and still has no Retry. The order outbox logs every refusal once to the sync log as "Order refused by the store" with the order id, the code and the store's message: a warning, or an error for `unsupported_version` (whose log previously used the message itself as its text).
