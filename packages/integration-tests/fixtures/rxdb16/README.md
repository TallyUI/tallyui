# RxDB 16 till fixtures

`pos-orders-v2.sqlite` and `pos-orders-v3.sqlite` contain ten orders written
by RxDB and RxDB Premium 16.21.1 using `@tallyui/pos` 2.0.0's schema and v2 opener.
The v3 file adds main's exact v3 schema changes. Each has eight pending orders,
one applied order (with `serverRefs` and `warnings`) and one rejected order; one
pending line has a 300-character name. Between them the orders set every optional
field of their version: `sessionId`, `lateSessionId`, `display`, `taxByRate`, a
customer, a payment reference, `note`, `registerId` and `cashierRef`. In the v3
file `order-0007` was downgraded (`sentVersion: 2`, `downgradedFrom: 3`).
`pos-orders-v2.expected.json` and `pos-orders-v3.expected.json` hold every order as
RxDB stored it, without `_meta` and `_rev`; the carry-over test compares with them.

TallyUI ships no parked-sales (`draftsCollection`) schema: the app supplies it,
so these fixtures cover `pos_orders` only.

Regenerate from this directory with licensed dependency access, from the
committed lockfile:
```sh
~/.claude/bin/rxdb-premium-install.sh "$PWD" --frozen-lockfile
node generate.mjs
```

The `.sqlite` files are committed binaries so RxDB 17 tests read real old-version
storage, including its schema metadata, without generating it with the new writer.
The local `node_modules` directory is never committed.
