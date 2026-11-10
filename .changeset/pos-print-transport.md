---
'@tallyui/pos': minor
---

POS now prints through a `PrintTransport` interface, with `createPrintQueue` running each printer's jobs one at a time so a failed or stalled printer never holds up another. A device-local `printer_profiles` collection stores the printers set up on a till, and `createSystemPrintTransport` prints receipt HTML through the browser's print dialog, or through a `printHtml` function the app passes in on native (such as expo-print).
