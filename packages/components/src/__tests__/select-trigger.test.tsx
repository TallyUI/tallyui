import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { Select, SelectTrigger, SelectValue } from '../ui/select';

afterEach(() => cleanup());

const renderTrigger = (props: { chevron?: boolean } = {}) =>
  render(
    <Select>
      <SelectTrigger testID="trigger" {...props}>
        <SelectValue placeholder="Pick a fruit" />
      </SelectTrigger>
    </Select>,
  );

describe('SelectTrigger', () => {
  it('draws a chevron after the children by default', () => {
    renderTrigger();
    const trigger = screen.getByTestId('trigger');
    expect(screen.getByText('Pick a fruit')).toBeDefined();
    const svg = trigger.querySelector('svg');
    expect(svg?.querySelector('polyline')?.getAttribute('points')).toBe('6 9 12 15 18 9');
    expect(svg?.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(trigger.lastElementChild?.contains(svg!)).toBe(true);
  });

  it('draws no chevron with chevron={false}', () => {
    renderTrigger({ chevron: false });
    expect(screen.getByText('Pick a fruit')).toBeDefined();
    expect(screen.getByTestId('trigger').querySelector('svg')).toBeNull();
  });

  it('does not pass chevron through to the DOM', () => {
    renderTrigger({ chevron: true });
    expect(screen.getByTestId('trigger').hasAttribute('chevron')).toBe(false);
  });

  it('renders the one child, with no chevron, under asChild', () => {
    // Slot clones trigger props onto each Fragment child: a chevron would be a second combobox.
    const { container } = render(
      <Select>
        <SelectTrigger asChild>
          <Text testID="own">Own trigger</Text>
        </SelectTrigger>
      </Select>,
    );
    expect(screen.getAllByRole('combobox', { hidden: true })).toEqual([screen.getByTestId('own')]);
    expect(container.children).toHaveLength(1);
    expect(container.querySelector('svg')).toBeNull();
  });
});
