---
"@tallyui/pos": major
---

A payment leg is stamped with the session that took it, and counts only on that session's Z: a part-paid sale parked across a close, or a taken leg left in the cart by `cancelTender`, counts its cash in the session that took it. A pending or authorized leg is stamped when it is captured.

**Breaking:** `useRegisterSession` now requires two options:

- `drafts`: the app's `order_drafts` collection, or `null` if it never parks a sale.
- `liveSale`: a getter returning `sale.takenLegs()`, or `null` if it has no live sale. The register is created before the sale, so read the sale through a ref:

```ts
const saleRef = useRef<ReturnType<typeof useSale> | null>(null)
const register = useRegisterSession({ …, liveSale: () => saleRef.current?.takenLegs() ?? [] })
const sale = useSale(…)
saleRef.current = sale
```

Why: without them, cash taken in a session but not yet on an order (a parked sale's, or one still in the cart) is missing from that session's Z.

`useSale` gains `takenLegs()`, `writeClosure` gains an optional `liveLegs` (callers other than `useRegisterSession` must pass both `drafts` and `liveLegs`), and `takingsByMethod` gains an optional third argument, `extra`, for taken legs no order holds yet.
