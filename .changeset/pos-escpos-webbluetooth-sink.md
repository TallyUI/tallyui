---
'@tallyui/pos': minor
---

`createWebBluetoothSink({ device })` writes ESC/POS bytes to a BLE receipt printer over Web Bluetooth, through `createEscPosTransport`. The app supplies the `BluetoothDevice` from `navigator.bluetooth.requestDevice`, listing `BLUETOOTH_PRINT_SERVICES` in `optionalServices`, and decides when to disconnect; the sink connects if needed, finds the first known print service whose characteristic takes writes, and writes 20-byte chunks 20 ms apart, the last with response, then gives the printer 300 ms before resolving. No dependency is added.
