import { afterEach, describe, expect, it, vi } from 'vitest';
import { injectPrintStyle } from '../sale/print-style';

afterEach(() => {
  vi.unstubAllGlobals();
  document.getElementById('pos-print-style')?.remove();
});

describe('injectPrintStyle', () => {
  it('injects the print-hide style once on the web, even when called again', () => {
    injectPrintStyle();
    injectPrintStyle();
    const styles = document.querySelectorAll('#pos-print-style');
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toContain('@media print');
    expect(styles[0].textContent).toContain('[data-print="hide"]');
  });

  it('does nothing when document is missing', () => {
    vi.stubGlobal('document', undefined);
    expect(() => injectPrintStyle()).not.toThrow();
  });
});
