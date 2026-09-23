import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChangeDisplay } from '../checkout/change-display';

describe('ChangeDisplay', () => {
  it('displays the supplied change due', () => {
    render(<ChangeDisplay change={{ amount: 1549, currency: 'EUR' }} locale="en" />);
    expect(screen.getByText('€15.49')).toBeDefined();
    expect(screen.getByText('Change Due')).toBeDefined();
  });

  it('displays supplied zero change', () => {
    render(<ChangeDisplay change={{ amount: 0, currency: 'EUR' }} locale="en" />);
    expect(screen.getByText('€0.00')).toBeDefined();
  });

  it('formats supplied negative change without clamping', () => {
    render(<ChangeDisplay change={{ amount: -100, currency: 'EUR' }} locale="en" />);
    expect(screen.getByText('-€1.00')).toBeDefined();
  });

  it('uses a dash for unknown currency', () => {
    render(<ChangeDisplay change={{ amount: 1549, currency: 'XXX' }} />);
    expect(screen.getByText('—')).toBeDefined();
  });
});
