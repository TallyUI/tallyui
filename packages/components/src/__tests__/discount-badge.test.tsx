import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiscountBadge } from '../cart/discount-badge';

describe('DiscountBadge', () => {
  it('renders percentage discount', () => {
    render(<DiscountBadge label="10% off" />);
    expect(screen.getByText('10% off')).toBeDefined();
  });

  it('renders fixed discount', () => {
    render(<DiscountBadge label="$5.00 off" />);
    expect(screen.getByText('$5.00 off')).toBeDefined();
  });
});
