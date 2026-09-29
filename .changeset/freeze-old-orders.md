---
"@tallyui/pos": patch
"@tallyui/components": patch
---

**The outbox freezes an order an older till stored before it first sends it** (`freezeSentForm`, which `finalizeOrder` uses too):
- line names, discount labels and payment references are cut to 255 characters, but ids never are;
- a customer email or id that `order.create` would refuse is left out;
- the frozen form is written back, so the receipt and the store see the same bytes.

So an order stored before the upgrade and still unsent is never refused as `invalid_payload`.

**New type:** `SentOrder`, an `Order` whose customer id may be missing. The receipt stage, `buildReceiptData` and `Receipt` take it, and a plain `Order` still fits.
