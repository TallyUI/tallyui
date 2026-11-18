# PrintingSettings (Settings › Printing, Printers section)

TallyUI demo screen `apps/demo/app/pos/printing-settings.tsx`, Playwright Chromium at 1280x800, JPEG quality 70,
light and dark (`-light.jpg` / `-dark.jpg`).

- `list-*`: the Print Dialog (built-in, default), a network Epson printer at `192.168.1.40:9100` and a Bluetooth printer.
- `menu-*`: the Epson row's "More actions" menu open (the real DropdownMenu): Set Default, then Delete.
- `delete-dialog-*`: Delete chosen from that menu: "Delete Front counter?" with Cancel and a destructive Delete.
- `empty-*`: `?empty=1`, only the Print Dialog: "No printers configured" and a primary Add Printer.

v2 reference: `docs/v2-parity/screens/v2/settings-hardware.jpg` is v2's Settings › Printing with no printers (the
empty state, Add printer, then the template routing sections TallyUI leaves for a later row).
