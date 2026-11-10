---
'@tallyui/pos': minor
---

Adds ESC/POS printing for thermal printers: `encodeEscPos` lays a receipt out in the printer's columns and code page, `escpos` is the command builder it uses, and `createEscPosTransport` sends the bytes to a sink the app supplies (USB, serial, network or Bluetooth) through the print queue.
