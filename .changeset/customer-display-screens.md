---
'@tallyui/components': minor
---

The second-device customer display's two screens (ADR-085 U5, #684). `CustomerDisplaySettings` is the till's Settings › Customer display: it takes `useTillPairing(pairing)` and `useTillDisplays(service)` and lists the paired displays with their state (Connected, Connecting…, Waiting for the display, Offline), forgets one after an `AlertDialog` confirm, mints a code with its expiry, and shows each "wants to pair" claim with its check code and Confirm and Decline (#705). Every pairing and forget refusal, and the offline and paused statuses, show a line. `CustomerDisplayPairing` is the display device's screen: it takes `useDisplayClient(client)`, enters the code and the display's name, shows the check code while the cashier confirms, then shows the sale through `CustomerDisplayScreen` with a small Offline notice when the store can't be reached. A forgotten display goes back to enter-code with its message.
