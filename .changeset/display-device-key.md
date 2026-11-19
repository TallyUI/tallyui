---
'@tallyui/core': minor
'@tallyui/pos': minor
'@tallyui/components': patch
---

**Breaking for DisplaySignalling implementers**
- The nine till methods take `TillDevice { deviceId, deviceKey }` in place of `deviceId`, and `registerDevice` and the `device_refused` refusal are new.
- `createTillPairing` and `createTillDisplayService` take `device` (from `createTillDevice`) in place of `deviceId`.
- Migration: a plugin adds the register route and checks the key on every till route; an app stores the key next to the device id (never replicated); an existing till registers on first use and keeps its paired displays.

A till now proves itself to the store with a key the store issued, so knowing a till's device id is no longer enough to act as that till on its customer displays.
