# RxDB 16 till fixtures

`pos-orders-v2.sqlite` and `pos-orders-v3.sqlite` contain the same six orders written
by RxDB and RxDB Premium 16.21.1 using `@tallyui/pos` 2.0.0's schema and v2 opener.
The v3 file adds main's exact v3 schema changes. Each has four pending orders,
one applied order and one rejected order; one pending line has a 300-character name.

Regenerate from this directory with licensed dependency access:
```sh
~/.claude/bin/rxdb-premium-install.sh "$PWD" --update-lockfile
node generate.mjs
```
The `.sqlite` files are committed binaries so RxDB 17 tests read real old-version
storage, including its schema metadata, without generating it with the new writer.
The local `node_modules` directory is never committed.
