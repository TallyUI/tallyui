---
'@tallyui/database': patch
---

The stock, id and fingerprint reconciles read and write in bounded chunks, so app queries don't wait behind a whole pass.
