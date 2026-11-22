---
'@tallyui/pos': minor
---

`createWebUsbSink({ device })` writes ESC/POS bytes to a USB receipt printer over WebUSB, through `createEscPosTransport`. The app supplies the `USBDevice` from `navigator.usb.requestDevice` (which needs a user gesture) and keeps it between jobs; the sink opens it, selects configuration 1 if none is set, claims the first printer-class interface with a bulk OUT endpoint, or else the first interface with one, and writes in 4096-byte transfers; a stalled transfer tries to clear the endpoint's halt so the next job can print. No dependency is added.
