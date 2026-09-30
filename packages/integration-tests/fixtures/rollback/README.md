# Rollback round-trip fixture

`pos-orders-rollback.sqlite` is a till that was upgraded, rolled back and upgraded
again (`docs/DECISIONS.md`, "`pos_orders` storage is one-way at 3.0.0"):

1. `forward.mjs` (RxDB 17.5.0, this workspace's built `@tallyui/pos` and
   `@tallyui/storage-sqlite`) opens a copy of `../rxdb16/pos-orders-v3.sqlite`,
   which migrates it to v4, and adds the pending order `order-0101` with
   `serverFailures`.
2. `../rxdb16/rollback.mjs` (RxDB 16.21.1 and `@tallyui/pos` 2.0.0) opens that
   file, asserts it shows 0 orders without an error, and adds `order-0102`.

`pos-orders-rollback.expected.json` holds `order-0101` and `order-0102` as stored;
`src/rxdb-rollback-sqlite.test.ts` opens a copy with this branch's
`addPosOrderCollection` and expects them and the v3 fixture's orders at v4.

Regenerate both steps, in order:
```sh
pnpm build   # from the workspace root
node forward.mjs   # from this directory
cd ../rxdb16 && ~/.claude/bin/rxdb-premium-install.sh "$PWD" --frozen-lockfile && node rollback.mjs
```
