import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DIGIT_ROWS, Keypad } from '../input/keypad';

afterEach(cleanup);

it('draws each key as a button by its label with its text, and a press reports its name', () => {
  const onPress = vi.fn();
  render(<Keypad testID="pad" rows={[...DIGIT_ROWS, [{ name: 'clear', label: 'Clear', text: 'C' }, { name: '0', label: '0', span: 2 }]]} onPress={onPress} />);
  expect(screen.getAllByRole('button').map((key) => key.getAttribute('aria-label')))
    .toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0']);
  expect(screen.getByRole('button', { name: 'Clear' }).textContent).toBe('C');
  fireEvent.click(screen.getByRole('button', { name: '7' }));
  fireEvent.click(screen.getByTestId('pad-key-clear'));
  expect(onPress.mock.calls).toEqual([['7'], ['clear']]);
});
