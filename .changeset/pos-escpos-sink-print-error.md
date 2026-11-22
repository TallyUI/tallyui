---
"@tallyui/pos": patch
---

`createEscPosTransport` passes a sink's `PrintError` on unchanged, so a printer the WebUSB or Web Bluetooth sink cannot print to fails its job with code `unsupported` instead of `failed`.
