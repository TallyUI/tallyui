---
'@tallyui/core': major
'@tallyui/pos': major
---

**4.0.0: the till's customer-display API takes a device key.** This is a breaking change for apps that implement `DisplaySignalling` or call `createTillPairing` or `createTillDisplayService`.

Migration:
- `DisplaySignalling`'s nine till methods take `TillDevice { deviceId, deviceKey }` in place of `deviceId`. Implement the new `registerDevice`, and handle the `device_refused` refusal.
- `createTillPairing` and `createTillDisplayService` take `device` (from `createTillDevice`) in place of `deviceId`.
- Store the device key next to the device id, and never replicate it. An existing till registers on first use and keeps its paired displays.
