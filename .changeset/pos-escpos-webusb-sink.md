---
'@tallyui/pos': minor
---

`createWebUsbSink({ device })` writes ESC/POS bytes to a USB receipt printer over WebUSB, through `createEscPosTransport`. The app supplies the `USBDevice` from `navigator.usb.requestDevice` (which needs a user gesture) and keeps it between jobs; the sink opens it, selects configuration 1 if none is set, claims the first interface with a bulk OUT endpoint and writes in 4096-byte transfers. No dependency is added.
