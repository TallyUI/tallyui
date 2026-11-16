---
'@tallyui/core': minor
---

`@tallyui/core/server` now ships a CommonJS build beside the ESM one, so CommonJS backend plugins can `require('@tallyui/core/server')`. The `./server` export map gains a `require` condition (`dist/server/index.cjs`, types `dist/server/index.d.cts`); `import` resolves exactly as before. The main entry and `./rxdb` stay ESM-only.
