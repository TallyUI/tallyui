---
'@tallyui/components': minor
'@tallyui/core': patch
'@tallyui/pos': patch
---

The tender pane offers every manual-capture payment method the host passes, records each as its wire method plus its own `methodId`, and labels ledger, takings and report rows with the method's title; takings and report rows key by kind and id (`legMethodId`), so two methods never merge. `takingsByMethod` returns an object with no prototype; read it with `Object.hasOwn`, not `hasOwnProperty`.
