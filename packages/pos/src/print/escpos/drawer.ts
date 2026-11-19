/**
 * A standalone cash-drawer kick, ported from WCPOS v2 `packages/printer/src/printer-service.ts`
 * (`encodeEscposDrawerKick`, `openDrawer`) and `capabilities.ts` (`canOpenDrawer`), monorepo main.
 */
import type { PrinterProfile } from '../printer-profiles';
import { PrintError, type PrintJob } from '../types';
import { escpos } from './commands';

/** Whether a standalone drawer kick can go to this printer (v2 capabilities.ts canOpenDrawer). */
export function canOpenDrawer(profile: PrinterProfile | undefined): boolean {
  if (!profile || profile.connectionType === 'system') return false;
  // A profile with no language speaks ESC/POS, as `createEscPosTransport` treats it.
  return profile.language === undefined || profile.language === 'esc-pos';
}

/** The drawer-kick job for `profile`, to run through the printer's queue and `createEscPosTransport`. */
export function openDrawerJob(profile: PrinterProfile, id: string): PrintJob {
  if (!canOpenDrawer(profile)) throw new PrintError('unsupported', `Printer ${profile.name} cannot open a cash drawer`);
  const connector = profile.drawerConnector ?? 'pin2';
  // Epson gets the real-time kick (DLE DC4), which fires while busy; many clones ignore it, so others get ESC p.
  const bytes = profile.vendor === 'epson'
    ? Uint8Array.from([0x10, 0x14, 0x01, connector === 'pin5' ? 1 : 0, 0x03])
    : escpos().pulse(connector).bytes();
  return { id, kind: 'drawer', bytes };
}
