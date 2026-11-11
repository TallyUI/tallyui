---
'@tallyui/pos': minor
---

The till's pairing flow for a second-device display (ADR-085 U5, d4, d5, #684), exported from the package root. `createTillPairing` takes a connector's `DisplaySignalling`, the cashier session, the till's device id and, optionally, the till display service. `start()` mints a code and shows it with its expiry; while it shows, the claims on it are listed every `PENDING_POLL_MS`, each with its display's check code (#705), and at its expiry the pairing goes idle with `expired`. `confirm` pairs a claim and refreshes the display service; `decline` drops it; `forget` removes a paired display and refreshes the service, and a refused forget shows in `forgetError`. Every refusal is named (`forbidden`, `limit`, `expired`, `not_found`, `network`, `server`), and with no cashier session nothing is called. `useTillPairing` and `useTillDisplays` render a pairing and a display service in React.
