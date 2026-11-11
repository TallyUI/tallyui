---
'@tallyui/pos': minor
---

The second-device customer display's client (ADR-085 U5a, #684, #705), exported from the package root. `createDisplayClient` claims a pairing code, shows the check code while the till's cashier confirms, then collects and keeps the display's token through an injected `DisplayTokenStore`. Once paired it drains its signalling inbox, answers each offer from its till with a `createDisplayPeerLink`, says `display.hello` until the matching `display.config` arrives, and shows what the till sends. While no link is open it reads the snapshot fallback when the advertisement turns it on, applying a body only when its `seq` is not lower than the last one applied. A refused token clears the stored token and the screen and goes back to `enter-code` with `forgotten`; a `network` or `server` failure only marks the display offline. `useDisplayClient` gives its `phase` and `state` to React.
