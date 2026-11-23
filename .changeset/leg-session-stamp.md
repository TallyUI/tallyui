---
"@tallyui/pos": major
---

A payment leg is stamped with the session that took it, and counts only on that session's Z: a part-paid sale parked across a close, or a taken leg left in the cart by `cancelTender`, counts its cash in the session that took it. A pending or authorized leg is stamped when it is captured.

**Breaking:** `useRegisterSession` now requires two options:

- `drafts`: the app's `order_drafts` collection, or `null` if it never parks a sale.
- `liveSale`: a getter returning `sale.registerView()` (`{ takenLegs, saving }`), or `null` if it has no live sale. The register is created before the sale, so read the sale through a ref:

```ts
const saleRef = useRef<ReturnType<typeof useSale> | null>(null)
const register = useRegisterSession({ …, liveSale: () => saleRef.current?.registerView() ?? { takenLegs: [], saving: false } })
const sale = useSale(…)
saleRef.current = sale
```

Why: without them, cash taken in a session but not yet on an order (a parked sale's, or one still in the cart) is missing from that session's Z.

`useSale` gains `registerView()`, `writeClosure` gains an optional `liveLegs` (callers other than `useRegisterSession` must pass both `drafts` and `liveLegs`), and `takingsByMethod` gains an optional third argument, `extra`, for taken legs no order holds yet.

`startCounting` and `closeSession` throw `RegisterSaleSavingError` while the getter says `saving`: a completion is in flight or its failed save has not been cleared. Live figures omit its legs while saving, since the stored order may already count them.

`useSale`'s `onSaleCompleted` is now bounded by `SAVE_TIMEOUT_MS` (60 s). After that the sale shows a failed save with Retry. `onSaleCompleted` must therefore be safe to call again with the same `posOrder` (same `posOrder.id`) while an earlier call is still running.
