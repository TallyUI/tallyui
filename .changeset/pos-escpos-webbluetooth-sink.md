---
'@tallyui/pos': minor
---

`createWebBluetoothSink({ device })` writes ESC/POS bytes to a BLE receipt printer over Web Bluetooth, through `createEscPosTransport`. The app supplies the `BluetoothDevice` from `navigator.bluetooth.requestDevice`, listing `BLUETOOTH_PRINT_SERVICES` in `optionalServices`, and decides when to disconnect; the sink connects if needed, finds the first known print service, and writes 20-byte chunks 20 ms apart, the last with response, then waits 300 ms for the printer to drain. No dependency is added.
