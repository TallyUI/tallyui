import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BarcodeScanningSettings, type BarcodeScanningValues } from '../settings';

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
