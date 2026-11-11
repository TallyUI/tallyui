---
'@tallyui/pos': minor
---

The second-device customer display's WebRTC transport (ADR-085 U3, #684), exported from the package root. `createTillPeerLink` (the offerer) and `createDisplayPeerLink` (the answerer) give a `PeerLink`: a `DisplayTransport` over one ordered data channel labelled `DISPLAY_CHANNEL`, carrying the display envelopes unchanged, with a `state` of `connecting`, `open` or `closed` and `onStateChange`. Signalling goes through an injected `SignalPort`, and the connection comes from an injected `PeerFactory` (the browser's `RTCPeerConnection` by default). ICE candidates that arrive before the remote description are queued and applied after it, in order; a malformed or unexpected signal is ignored; a failed step, a failed connection or a closed channel closes the link for good.
