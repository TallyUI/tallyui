import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RegisterPicker } from '../register/register-picker';

afterEach(() => cleanup());

it('lists every register and picks on tap', () => {
  const onPick = vi.fn();
  render(
    <RegisterPicker
      registers={[
        { id: 'front', name: 'Front' },
        { id: 'back', name: 'Back office' },
      ]}
      onPick={onPick}
    />,
  );
  expect(screen.getByText('Front')).toBeTruthy();
  expect(screen.getByText('Back office')).toBeTruthy();
  fireEvent.click(screen.getByTestId('register-picker-row-back'));
  expect(onPick).toHaveBeenCalledWith('back');
});

it('says so when there are no registers to choose', () => {
  render(<RegisterPicker registers={[]} onPick={vi.fn()} />);
  expect(screen.getByTestId('register-picker-empty')).toBeTruthy();
});
