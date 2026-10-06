import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Slider } from '../ui/slider';

describe('Slider', () => {
  it('renders a slider at the value', () => {
    render(<Slider value={30} onValueChange={vi.fn()} />);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('30');
  });

  it('ArrowRight changes the value through onValueChange', () => {
    const onValueChange = vi.fn();
    render(<Slider value={30} onValueChange={onValueChange} />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
    expect(onValueChange).toHaveBeenCalledWith(31);
  });
});
