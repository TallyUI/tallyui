---
'@tallyui/components': patch
---

`CustomerPicker` selects nothing when a customer create resolves after the picker has unmounted (the host closed it mid-create).
