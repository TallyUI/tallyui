---
'@tallyui/core': patch
'@tallyui/pos': patch
---

The `DisplaySignalling` docs now say the till's `deviceId` is a bearer secret on some backends (ADR-085, #753): an implementation never logs it, puts it in an error, a response or a display's view, or returns it to another device. The pairing and display service options say the same.
