import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { medusaConnector } from '@tallyui/connector-medusa';
import { Catalogue } from '../sale/catalogue';
import type { ViewfinderProps } from '../product/scanner-viewfinder';

const traits = medusaConnector.traits.product;
const FakeViewfinder = (_props: ViewfinderProps) => null;

function renderCatalogue(props: Partial<Parameters<typeof Catalogue>[0]> = {}) {
  return render(<Catalogue products={[]} traits={traits} currency="EUR" onSelect={vi.fn()} lastSyncedAt={null} {...props} />);
}

describe('Catalogue camera scan', () => {
  afterEach(() => { cleanup(); });

  it('has no camera scan button by default, nor without the cameraScanner wiring', () => {
    renderCatalogue();
    expect(screen.queryByTestId('camera-scan-button')).toBeNull();
    expect(screen.queryByTestId('camera-scanner-panel')).toBeNull();
    cleanup();
    renderCatalogue({ cameraScan: true });
    expect(screen.queryByTestId('camera-scan-button')).toBeNull();
  });

  it('keeps the camera scan button off when only the cameraScanner wiring is passed', () => {
    renderCatalogue({ cameraScanner: { viewfinder: FakeViewfinder, onDetected: vi.fn(), onOpen: vi.fn(), scanCount: 0 } });
    expect(screen.queryByTestId('camera-scan-button')).toBeNull();
    expect(screen.queryByTestId('camera-scanner-panel')).toBeNull();
  });

  it('opens and closes the camera scanner from the button and the panel', () => {
    const onOpen = vi.fn();
    renderCatalogue({ cameraScan: true, cameraScanner: { viewfinder: FakeViewfinder, height: 200, onDetected: vi.fn(), onOpen } });
    expect(onOpen).not.toHaveBeenCalled();
    const button = screen.getByTestId('camera-scan-button');
    expect(button.getAttribute('aria-label')).toBe('Scan barcode with camera');
    expect(screen.queryByTestId('camera-scanner-panel')).toBeNull();
    fireEvent.click(button);
    expect(screen.getByTestId('camera-scanner-panel').style.height).toBe('200px');
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('camera-scan-button').getAttribute('aria-label')).toBe('Close barcode scanner');
    fireEvent.click(screen.getByTestId('camera-scanner-close'));
    expect(screen.queryByTestId('camera-scanner-panel')).toBeNull();
    expect(screen.getByTestId('camera-scan-button').getAttribute('aria-label')).toBe('Scan barcode with camera');
    fireEvent.click(screen.getByTestId('camera-scan-button'));
    expect(screen.getByTestId('camera-scanner-panel')).toBeTruthy();
    expect(onOpen).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByTestId('camera-scan-button'));
    expect(screen.queryByTestId('camera-scanner-panel')).toBeNull();
  });
});
