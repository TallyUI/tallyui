---
'@tallyui/pos': minor
---

`createHidScanner` reads barcodes from a scanner in USB HID Point-of-Sale mode (usage page `0x8C`) through WebHID as a framework-agnostic controller, saving a scanner profile on connect and silently reopening the first granted device that matches a saved profile (#682).
