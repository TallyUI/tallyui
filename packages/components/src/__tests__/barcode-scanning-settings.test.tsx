import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TraceAnalysis } from '@tallyui/pos';
import { BarcodeScanningSettings, type BarcodeScanningValues } from '../settings';
import { Text } from '../ui/text';

afterEach(cleanup);

const VALUES: BarcodeScanningValues = { threshold: 24, minChars: 8, prefix: '#', suffix: '' };

function setup(values: BarcodeScanningValues = VALUES) {
  const onChange = vi.fn();
  const view = render(<BarcodeScanningSettings values={values} onChange={onChange} />);
  return { onChange, view };
}
const field = (id: string) => screen.getByTestId(`settings-barcode-${id}`) as HTMLInputElement;
const type = (id: string, value: string) => fireEvent.change(field(id), { target: { value } });

describe('BarcodeScanningSettings', () => {
  it("shows v2's four Scanning rows with the current values", () => {
    setup();
    expect(screen.getByText('Scanning')).toBeTruthy();
    for (const label of ['Barcode Average Time Input Threshold (ms)', 'Barcode Minimum Length',
      'Barcode Scanner Prefix', 'Barcode Scanner Suffix']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(['threshold', 'min-chars', 'prefix', 'suffix'].map((id) => field(id).value)).toEqual(['24', '8', '#', '']);
  });

  it('a number field reports a whole number and drops other characters', () => {
    const { onChange } = setup();
    type('threshold', '30');
    expect(onChange).toHaveBeenLastCalledWith({ threshold: 30 });
    type('min-chars', '1a2');
    expect(onChange).toHaveBeenLastCalledWith({ minChars: 12 });
    expect(field('min-chars').value).toBe('12');
    type('min-chars', '-5');
    expect(onChange).toHaveBeenLastCalledWith({ minChars: 5 });
    expect(onChange).toHaveBeenCalledTimes(3);
    for (const [patch] of onChange.mock.calls) {
      for (const value of Object.values(patch)) expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('an emptied number field reports nothing and shows the saved value again on blur', () => {
    const { onChange } = setup();
    type('threshold', '');
    expect(field('threshold').value).toBe('');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(field('threshold'));
    expect(field('threshold').value).toBe('24');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('prefix and suffix report their own key as typed', () => {
    const { onChange } = setup();
    type('prefix', ' ]C1');
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ prefix: ' ]C1' });
    onChange.mockClear();
    type('suffix', '\t');
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ suffix: '\t' });
  });

  it('a number field follows a new value from the app', () => {
    const { onChange, view } = setup();
    expect(field('threshold').value).toBe('24');
    view.rerender(<BarcodeScanningSettings values={{ ...VALUES, threshold: 40 }} onChange={onChange} />);
    expect(field('threshold').value).toBe('40');
  });
});

describe('test verdict', () => {
  function analysis(over: Partial<TraceAnalysis>): TraceAnalysis {
    return {
      raw: '', code: '', avgGapMs: 200, gaps: [], detectedAsScan: false, tooShort: false,
      nearMiss: false, leadingSymbol: null, trailingEnter: false, shiftMangled: false, suggestions: [],
      ...over,
    };
  }

  it('V0: has no test section without test, and shows capture before any analysis', () => {
    const { onChange, view } = setup();
    expect(screen.queryByText('Barcode Scanning Test')).toBeNull();
    view.rerender(<BarcodeScanningSettings values={VALUES} onChange={onChange}
      test={{ analysis: null, capture: <Text testID="cap">c</Text> }} />);
    expect(screen.getByText('Barcode Scanning Test')).toBeTruthy();
    expect(screen.getByTestId('cap').textContent).toBe('c');
    expect(screen.queryByTestId('barcode-test-verdict')).toBeNull();
  });

  it('V1: shows a scan and its rounded gap under the current threshold', () => {
    render(<BarcodeScanningSettings values={VALUES} onChange={vi.fn()}
      test={{ analysis: analysis({ detectedAsScan: true, code: '0123', avgGapMs: 9.4 }) }} />);
    expect(screen.getByTestId('barcode-test-headline').textContent).toBe('Detected as a scan → 0123');
    expect(screen.getByTestId('barcode-test-detail').textContent)
      .toBe('Average keystroke gap 9ms, under the 24ms threshold');
  });

  it('V2: shows a near miss with its rounded gap and current threshold', () => {
    render(<BarcodeScanningSettings values={VALUES} onChange={vi.fn()}
      test={{ analysis: analysis({ nearMiss: true, avgGapMs: 31.2 }) }} />);
    expect(screen.getByTestId('barcode-test-headline').textContent)
      .toContain('Treated as typing — average gap 31ms is above your 24ms threshold');
  });

  it('V3: explains that a single key has no gaps to measure', () => {
    render(<BarcodeScanningSettings values={VALUES} onChange={vi.fn()}
      test={{ analysis: analysis({ avgGapMs: Infinity }) }} />);
    expect(screen.getByTestId('barcode-test-headline').textContent)
      .toBe('Treated as typing — only one key pressed, so there are no gaps to measure');
  });

  it('V4: shows correctly ignored typing', () => {
    render(<BarcodeScanningSettings values={VALUES} onChange={vi.fn()}
      test={{ analysis: analysis({ avgGapMs: 180 }) }} />);
    expect(screen.getByTestId('barcode-test-headline').textContent)
      .toBe('Treated as typing (average gap 180ms) — correctly ignored');
  });

  it('V5: renders exactly one headline, with scan taking precedence', () => {
    render(<BarcodeScanningSettings values={VALUES} onChange={vi.fn()}
      test={{ analysis: analysis({ detectedAsScan: true, nearMiss: true, code: 'X', avgGapMs: 10 }) }} />);
    expect(screen.getAllByTestId('barcode-test-headline')).toHaveLength(1);
    expect(screen.getByTestId('barcode-test-headline').textContent).toBe('Detected as a scan → X');
  });

  it('V6: Apply passes exactly the suggestion settings once', () => {
    const onChange = vi.fn();
    render(<BarcodeScanningSettings values={VALUES} onChange={onChange} test={{ analysis: analysis({
      nearMiss: true, avgGapMs: 31.2,
      suggestions: [{ kind: 'raise-threshold', value: 40, settings: { threshold: 40 } }],
    }) }} />);
    expect(screen.getByTestId('barcode-test-suggestion-raise-threshold-title').textContent)
      .toBe('Raise threshold to 40ms — your scanner averages 31ms');
    fireEvent.click(screen.getByTestId('barcode-test-apply-raise-threshold'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ threshold: 40 });
  });

  it('V7: shows Shift and trailing Enter notes only when their flags are true', () => {
    const onChange = vi.fn();
    const view = render(<BarcodeScanningSettings values={VALUES} onChange={onChange}
      test={{ analysis: analysis({ shiftMangled: true, trailingEnter: true }) }} />);
    expect(screen.getByTestId('barcode-test-shift').textContent)
      .toContain('Scanner is sending Shift as separate keys');
    expect(screen.getByTestId('barcode-test-shift').textContent)
      .toContain('Reconfigure it to a US-keyboard / no-modifier mode.');
    expect(screen.getByTestId('barcode-test-trailing-enter').textContent)
      .toBe('Trailing Enter detected and ignored — no suffix needed');
    view.rerender(<BarcodeScanningSettings values={VALUES} onChange={onChange}
      test={{ analysis: analysis({ shiftMangled: false, trailingEnter: false }) }} />);
    expect(screen.queryByTestId('barcode-test-shift')).toBeNull();
    expect(screen.queryByTestId('barcode-test-trailing-enter')).toBeNull();
  });
});
