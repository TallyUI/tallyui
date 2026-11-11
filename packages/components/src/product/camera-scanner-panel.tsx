import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Platform, View, type AccessibilityActionEvent } from 'react-native';
import type { CameraDecoder, ViewfinderStatus } from '@tallyui/pos';
import { Button } from '../ui/button';
import { IconButton } from '../ui/icon-button';
import { GripIcon } from '../ui/icon/grip-icon';
import { XIcon } from '../ui/icon/x-icon';
import { Text } from '../ui/text';
import { VStack } from '../ui/vstack';
import { ScannerViewfinder, type ViewfinderProps } from './scanner-viewfinder';

// v2 pos/products/camera-scanner-panel.tsx:24-36.
export const FLASH_DURATION_MS = 350;
export const SCANNER_MIN_HEIGHT = 96;
export const SCANNER_MAX_HEIGHT = 480;
export const SCANNER_DEFAULT_HEIGHT = 176;
const STEP = 16;
const RESIZE_HANDLE_HEIGHT = 20;
const HANDLE_SLOP = (44 - RESIZE_HANDLE_HEIGHT) / 2;

const STATUS_TEXT: Record<ViewfinderStatus, string | undefined> = {
  initializing: 'Starting camera…',
  scanning: undefined,
  'camera-denied': 'Camera access was denied — allow it in the browser settings and reopen the scanner.',
  'camera-unavailable': 'Camera unavailable — check that no other app is using it.',
  'decoder-error': 'Barcode decoding is failing — close the scanner and try again.',
};

const clampHeight = (height: number) => Math.min(SCANNER_MAX_HEIGHT, Math.max(SCANNER_MIN_HEIGHT, Math.round(height)));

export interface CameraScannerPanelProps {
  onClose: () => void;
  /** Panel height; clamped to [96, 480]. Default 176. The app persists it from onHeightChange. */
  height?: number;
  onHeightChange?: (height: number) => void;
  /** Native permission flow; omit on web, where the browser asks on getUserMedia. */
  permission?: { granted: boolean; request: () => void };
  /** Default ScannerViewfinder; a native app passes its own (for example one built on expo-camera). */
  viewfinder?: ComponentType<ViewfinderProps>;
  decoder?: CameraDecoder;
  /** v2's readiness note (storage, offline, sync starting): the app picks the copy; shown under the status. */
  readiness?: string;
  /** Each decode, passed straight to the viewfinder: the app passes its useCameraScan offer. */
  onDetected: (code: string, symbology?: string) => void;
  /** Called once on mount (the scanner opened): the app passes its useCameraScan reset. */
  onOpen?: () => void;
  /** The app's useCameraScan scanCount: each change after mount flashes the panel. */
  scanCount?: number;
}

/** The inline camera scanner (v2 camera-scanner-panel.tsx). It calls no pos hook: the app owns useCameraScan (and
 * its ScanHubProvider) and passes { onDetected: camera.offer, onOpen: camera.reset, scanCount: camera.scanCount },
 * so accepted decodes reach the app's useBarcodeScanner like any device scan. */
export function CameraScannerPanel({ onClose, height: heightProp = SCANNER_DEFAULT_HEIGHT, onHeightChange, permission,
  viewfinder: Viewfinder = ScannerViewfinder, decoder, readiness, onDetected, onOpen, scanCount }: CameraScannerPanelProps) {
  const [status, setStatus] = useState<ViewfinderStatus>('initializing');
  const [height, setHeight] = useState(() => clampHeight(heightProp));
  useEffect(() => { setHeight(clampHeight(heightProp)); }, [heightProp]);
  const heightRef = useRef(height);
  heightRef.current = height;
  const onHeightChangeRef = useRef(onHeightChange);
  onHeightChangeRef.current = onHeightChange;

  // Opening the scanner mounts the panel: a code scanned before it was closed may be scanned again at once.
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  useEffect(() => { onOpenRef.current?.(); }, []);

  // Each scanCount change after mount (re)starts the flash; the value at mount never flashes.
  const [flashing, setFlashing] = useState(false);
  const seenCount = useRef(scanCount);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (scanCount === seenCount.current) return;
    seenCount.current = scanCount;
    if (flashTimer.current !== undefined) clearTimeout(flashTimer.current);
    setFlashing(true);
    flashTimer.current = setTimeout(() => { flashTimer.current = undefined; setFlashing(false); }, FLASH_DURATION_MS);
  }, [scanCount]);
  useEffect(() => () => { if (flashTimer.current !== undefined) clearTimeout(flashTimer.current); }, []);

  const adjust = (delta: number) => {
    const next = clampHeight(heightRef.current + delta);
    setHeight(next);
    onHeightChangeRef.current?.(next);
  };
  const onAccessibilityAction = ({ nativeEvent }: AccessibilityActionEvent) => {
    if (nativeEvent.actionName === 'increment') adjust(STEP);
    else if (nativeEvent.actionName === 'decrement') adjust(-STEP);
  };
  // Web pointer drag: the height follows the pointer and is reported once, when the drag ends.
  const dragCleanup = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => dragCleanup.current?.(), []);
  const startDrag = (startY: number) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    dragCleanup.current?.();
    const startHeight = heightRef.current;
    let last = startHeight;
    const move = (event: PointerEvent) => {
      last = clampHeight(startHeight + event.clientY - startY);
      setHeight(last);
    };
    const end = () => {
      dragCleanup.current?.();
      if (last !== startHeight) onHeightChangeRef.current?.(last);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    dragCleanup.current = () => {
      dragCleanup.current = undefined;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  };

  if (permission && !permission.granted) {
    return (
      <VStack space="md" className="border-border items-center rounded-md border p-4" testID="camera-permission-request">
        <Text className="text-center text-sm">Camera access is needed to scan barcodes.</Text>
        <Button onPress={permission.request}><Text>Allow camera</Text></Button>
      </VStack>
    );
  }

  const statusText = STATUS_TEXT[status];
  return (
    <View>
      <View className="relative w-full overflow-hidden rounded-md bg-black" style={{ height }} testID="camera-scanner-panel">
        <Viewfinder onDetected={onDetected} onStatus={setStatus} decoder={decoder} />
        {flashing ? <View className="border-success pointer-events-none absolute inset-0 rounded-md border-4"
          testID="camera-scanner-flash" /> : null}
        <View className="absolute top-1 right-1">
          <IconButton size="sm" onPress={onClose} accessibilityLabel="Close barcode scanner" testID="camera-scanner-close">
            <View className="text-white"><XIcon size={16} /></View>
          </IconButton>
        </View>
        {statusText || readiness ? (
          <View className="absolute inset-x-0 bottom-0 gap-1 bg-black/60 p-2">
            {statusText ? <Text className="text-center text-xs text-white" testID="camera-scanner-status">{statusText}</Text> : null}
            {readiness ? <Text className="text-center text-xs text-white/80" testID="camera-scanner-readiness">{readiness}</Text> : null}
          </View>
        ) : null}
      </View>
      <View className="web:cursor-ns-resize web:hover:opacity-100 items-center justify-center opacity-40"
        style={{ height: RESIZE_HANDLE_HEIGHT }} hitSlop={{ top: HANDLE_SLOP, bottom: HANDLE_SLOP }}
        accessible accessibilityRole="adjustable" accessibilityLabel="Drag to resize the camera view"
        accessibilityValue={{ min: SCANNER_MIN_HEIGHT, max: SCANNER_MAX_HEIGHT, now: height }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={onAccessibilityAction}
        onPointerDown={(event) => startDrag(event.nativeEvent.clientY)} testID="camera-scanner-resize-handle">
        <View className="-my-0.5 text-foreground"><GripIcon size={16} /></View>
      </View>
    </View>
  );
}
