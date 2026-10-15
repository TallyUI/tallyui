---
"@tallyui/components": minor
---

`OrdersList` takes `onOpen`. When it is set, each order row, from the till or the store's history, gets an Open button that passes that row to `onOpen`, so an app can open the order and reprint its receipt. A till row's press still expands its lines, and without `onOpen` the list is unchanged.
