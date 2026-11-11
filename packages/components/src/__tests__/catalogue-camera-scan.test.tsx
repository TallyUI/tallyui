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

  it('has no camera scan button by default', () => {
    renderCatalogue();
    expect(screen.queryByTestId('camera-scan-button')).toBeNull();
    expect(screen.queryByTestId('camera-scanner-panel')).toBeNull();
  });

  it('opens and closes the camera scanner from the button and the panel', () => {
    const onHeightChange = vi.fn();
    renderCatalogue({ cameraScan: true, cameraScanner: { viewfinder: FakeViewfinder, height: 200, onHeightChange } });
    const button = screen.getByTestId('camera-scan-button');
    expect(button.getAttribute('aria-label')).toBe('Scan barcode with camera');
    expect(screen.queryByTestId('camera-scanner-panel')).toBeNull();
    fireEvent.click(button);
    expect(screen.getByTestId('camera-scanner-panel').style.height).toBe('200px');
    expect(screen.getByTestId('camera-scan-button').getAttribute('aria-label')).toBe('Close barcode scanner');
    fireEvent.click(screen.getByTestId('camera-scanner-close'));
    expect(screen.queryByTestId('camera-scanner-panel')).toBeNull();
    expect(screen.getByTestId('camera-scan-button').getAttribute('aria-label')).toBe('Scan barcode with camera');
    fireEvent.click(screen.getByTestId('camera-scan-button'));
    expect(screen.getByTestId('camera-scanner-panel')).toBeTruthy();
    fireEvent.click(screen.getByTestId('camera-scan-button'));
    expect(screen.queryByTestId('camera-scanner-panel')).toBeNull();
  });
});
