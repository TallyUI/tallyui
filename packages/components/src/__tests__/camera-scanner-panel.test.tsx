import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CameraScannerPanel, type CameraScannerPanelProps } from '../product/camera-scanner-panel';
import { ScannerViewfinder, type ViewfinderProps } from '../product/scanner-viewfinder';

let viewfinder: ViewfinderProps;
function FakeViewfinder(props: ViewfinderProps) {
  viewfinder = props;
  return null;
}
/** The panel with the app's wiring stubbed; no ScanHubProvider, since the panel calls no pos hook. */
function renderPanel(props: Partial<CameraScannerPanelProps> = {}) {
  const all: CameraScannerPanelProps = { onClose: vi.fn(), onDetected: vi.fn(), viewfinder: FakeViewfinder, ...props };
  const view = render(<CameraScannerPanel {...all} />);
  return { ...view, rerenderPanel: (next: Partial<CameraScannerPanelProps>) => view.rerender(<CameraScannerPanel {...all} {...next} />) };
}

/** react-native-web drops accessibilityActions from the DOM, so run the handle's handler from its React props. */
function accessibilityAction(element: HTMLElement, actionName: string) {
  const key = Object.keys(element).find((name) => name.startsWith('__reactFiber$'))!;
  let fiber = (element as unknown as Record<string, { memoizedProps?: Record<string, unknown>; return?: unknown }>)[key];
  while (fiber && !fiber.memoizedProps?.onAccessibilityAction) fiber = fiber.return as typeof fiber;
  expect(fiber.memoizedProps?.accessibilityActions).toEqual([{ name: 'increment' }, { name: 'decrement' }]);
  const handler = fiber.memoizedProps!.onAccessibilityAction as (event: unknown) => void;
  act(() => handler({ nativeEvent: { actionName } }));
}

function stubMediaDevices(getUserMedia: () => Promise<unknown>) {
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn(getUserMedia) }, configurable: true });
}

describe('CameraScannerPanel', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  it('shows the copy for each status and none while scanning', () => {
    renderPanel({ readiness: 'Offline — only products already on this device will scan.' });
    expect(screen.getByTestId('camera-scanner-status').textContent).toBe('Starting camera…');
    expect(screen.getByTestId('camera-scanner-readiness').textContent).toBe('Offline — only products already on this device will scan.');
    const copy = {
      'camera-denied': 'Camera access was denied — allow it in the browser settings and reopen the scanner.',
      'camera-unavailable': 'Camera unavailable — check that no other app is using it.',
      'decoder-error': 'Barcode decoding is failing — close the scanner and try again.',
    } as const;
    for (const [status, text] of Object.entries(copy)) {
      act(() => viewfinder.onStatus(status as keyof typeof copy));
      expect(screen.getByTestId('camera-scanner-status').textContent).toBe(text);
    }
    act(() => viewfinder.onStatus('scanning'));
    expect(screen.queryByTestId('camera-scanner-status')).toBeNull();
  });

  it('passes decodes straight to onDetected and calls onOpen once on mount', () => {
    const onDetected = vi.fn();
    const onOpen = vi.fn();
    const { rerenderPanel } = renderPanel({ onDetected, onOpen });
    expect(viewfinder.onDetected).toBe(onDetected);
    expect(onOpen).toHaveBeenCalledTimes(1);
    rerenderPanel({ height: 200, scanCount: 1 });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('flashes for 350 ms on each scanCount change, restarting a running flash', () => {
    vi.useFakeTimers();
    const { rerenderPanel } = renderPanel({ scanCount: 0 });
    expect(screen.queryByTestId('camera-scanner-flash')).toBeNull();
    rerenderPanel({ scanCount: 1 });
    expect(screen.getByTestId('camera-scanner-flash')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(200); });
    rerenderPanel({ scanCount: 2 });
    act(() => { vi.advanceTimersByTime(349); });
    expect(screen.getByTestId('camera-scanner-flash')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByTestId('camera-scanner-flash')).toBeNull();
    rerenderPanel({ scanCount: 2, height: 300 });
    expect(screen.queryByTestId('camera-scanner-flash')).toBeNull();
  });

  it('never flashes for the scanCount it mounts with', () => {
    renderPanel({ scanCount: 5 });
    expect(screen.queryByTestId('camera-scanner-flash')).toBeNull();
  });

  it('resizes by 16 from the accessibility actions, within 96 to 480', () => {
    const onHeightChange = vi.fn();
    renderPanel({ height: 470, onHeightChange });
    const handle = screen.getByTestId('camera-scanner-resize-handle');
    expect(handle.getAttribute('aria-label')).toBe('Drag to resize the camera view');
    expect(screen.getByTestId('camera-scanner-panel').style.height).toBe('470px');
    accessibilityAction(handle, 'decrement');
    expect(onHeightChange).toHaveBeenLastCalledWith(454);
    accessibilityAction(handle, 'increment');
    accessibilityAction(handle, 'increment');
    expect(onHeightChange).toHaveBeenLastCalledWith(480);
    accessibilityAction(handle, 'increment');
    expect(onHeightChange).toHaveBeenLastCalledWith(480);
    expect(screen.getByTestId('camera-scanner-panel').style.height).toBe('480px');
    cleanup();

    renderPanel({ height: 100, onHeightChange });
    accessibilityAction(screen.getByTestId('camera-scanner-resize-handle'), 'decrement');
    expect(onHeightChange).toHaveBeenLastCalledWith(96);
    accessibilityAction(screen.getByTestId('camera-scanner-resize-handle'), 'decrement');
    expect(onHeightChange).toHaveBeenLastCalledWith(96);
  });

  it('asks for camera permission before showing the camera', () => {
    const request = vi.fn();
    renderPanel({ permission: { granted: false, request } });
    expect(screen.getByTestId('camera-permission-request').textContent).toContain('Camera access is needed to scan barcodes.');
    expect(screen.queryByTestId('camera-scanner-panel')).toBeNull();
    fireEvent.click(screen.getByText('Allow camera'));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('closes from its close button', () => {
    const onClose = vi.fn();
    renderPanel({ onClose, permission: { granted: true, request: vi.fn() } });
    const close = screen.getByTestId('camera-scanner-close');
    expect(close.getAttribute('aria-label')).toBe('Close barcode scanner');
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the denied copy when the browser refuses the camera', async () => {
    stubMediaDevices(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
    renderPanel({ viewfinder: undefined });
    expect(screen.getByTestId('scanner-viewfinder').querySelector('video')).toBeTruthy();
    expect(await screen.findByText('Camera access was denied — allow it in the browser settings and reopen the scanner.')).toBeTruthy();
  });

  it('stops the camera tracks on unmount, including a stream that arrives late', async () => {
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] };
    stubMediaDevices(() => Promise.resolve(stream));
    const decoder = { detect: vi.fn(async () => []) };
    const onStatus = vi.fn();
    const view = render(<ScannerViewfinder onDetected={vi.fn()} onStatus={onStatus} decoder={decoder} />);
    await vi.waitFor(() => expect(onStatus).toHaveBeenLastCalledWith('scanning'));
    expect(onStatus.mock.calls).toEqual([['initializing'], ['scanning']]);
    expect((view.container.querySelector('video') as HTMLVideoElement & { srcObject: unknown }).srcObject).toBe(stream);
    expect(track.stop).not.toHaveBeenCalled();
    view.unmount();
    expect(track.stop).toHaveBeenCalledTimes(1);

    let resolve!: (value: unknown) => void;
    const late = { stop: vi.fn() };
    stubMediaDevices(() => new Promise((done) => { resolve = done; }));
    const early = render(<ScannerViewfinder onDetected={vi.fn()} onStatus={onStatus} />);
    early.unmount();
    await act(async () => { resolve({ getTracks: () => [late] }); });
    expect(late.stop).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenLastCalledWith('initializing');
  });

  it('reports decoder-error and never scanning when the browser has no decoder', async () => {
    vi.stubGlobal('BarcodeDetector', undefined);
    stubMediaDevices(() => Promise.resolve({ getTracks: () => [] }));
    const onStatus = vi.fn();
    render(<ScannerViewfinder onDetected={vi.fn()} onStatus={onStatus} />);
    await vi.waitFor(() => expect(onStatus).toHaveBeenLastCalledWith('decoder-error'));
    expect(onStatus.mock.calls).toEqual([['initializing'], ['decoder-error']]);
    cleanup();
    renderPanel({ viewfinder: undefined });
    expect(await screen.findByText('Barcode decoding is failing — close the scanner and try again.')).toBeTruthy();
  });

  it('follows a web pointer drag and reports the height once, only when it changed', () => {
    const onHeightChange = vi.fn();
    renderPanel({ onHeightChange });
    const handle = screen.getByTestId('camera-scanner-resize-handle');
    const panelHeight = () => screen.getByTestId('camera-scanner-panel').style.height;
    expect(panelHeight()).toBe('176px');
    fireEvent.pointerDown(handle, { clientY: 100 });
    fireEvent.pointerMove(window, { clientY: 140 });
    expect(panelHeight()).toBe('216px');
    fireEvent.pointerUp(window, { clientY: 140 });
    expect(onHeightChange.mock.calls).toEqual([[216]]);
    expect(panelHeight()).toBe('216px');
    // The listeners went with the pointerup.
    fireEvent.pointerMove(window, { clientY: 300 });
    expect(panelHeight()).toBe('216px');
    expect(onHeightChange).toHaveBeenCalledTimes(1);

    // A drag that ends where it started reports nothing.
    fireEvent.pointerDown(handle, { clientY: 100 });
    fireEvent.pointerMove(window, { clientY: 140 });
    expect(panelHeight()).toBe('256px');
    fireEvent.pointerMove(window, { clientY: 100 });
    fireEvent.pointerUp(window, { clientY: 100 });
    expect(panelHeight()).toBe('216px');
    expect(onHeightChange).toHaveBeenCalledTimes(1);
  });
});
