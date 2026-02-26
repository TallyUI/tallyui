import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChangeDisplay } from '../checkout/change-display';

describe('ChangeDisplay', () => {
  it('displays change due', () => {
    render(<ChangeDisplay tendered={50} total={42.5} />);
    expect(screen.getByText('7.50')).toBeDefined();
    expect(screen.getByText('Change Due')).toBeDefined();
  });

  it('displays zero when tendered equals total', () => {
    render(<ChangeDisplay tendered={20} total={20} />);
    expect(screen.getByText('0.00')).toBeDefined();
  });

  it('displays zero when tendered is less than total', () => {
    render(<ChangeDisplay tendered={10} total={20} />);
    expect(screen.getByText('0.00')).toBeDefined();
  });
});
