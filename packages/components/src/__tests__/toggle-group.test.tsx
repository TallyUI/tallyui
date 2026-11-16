import * as React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';

// react-native-web atomizes className into hashed classes, so copy it to a data attribute.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => <Base ref={ref} {...props} dataSet={{ class: props.className }} />);
  return { ...rn, Pressable: withClass(rn.Pressable) };
});
afterEach(() => cleanup());

it('marks the selected item of a single group pressed, and moves it on press', () => {
  render(<ToggleGroup type="single" defaultValue="b"><ToggleGroupItem value="a" testID="a"><Text>A</Text></ToggleGroupItem><ToggleGroupItem value="b" testID="b"><Text>B</Text></ToggleGroupItem></ToggleGroup>);
  expect(screen.getByTestId('b').getAttribute('data-class')).toContain('bg-accent');
  expect(screen.getByTestId('a').getAttribute('data-class')).not.toContain('bg-accent');
  fireEvent.click(screen.getByTestId('a'));
  expect(screen.getByTestId('a').getAttribute('data-class')).toContain('bg-accent');
  expect(screen.getByTestId('b').getAttribute('data-class')).not.toContain('bg-accent');
});

it('marks every selected item of a multiple group pressed', () => {
  render(<ToggleGroup type="multiple" defaultValue={['a', 'c']}><ToggleGroupItem value="a" testID="a"><Text>A</Text></ToggleGroupItem><ToggleGroupItem value="b" testID="b"><Text>B</Text></ToggleGroupItem><ToggleGroupItem value="c" testID="c"><Text>C</Text></ToggleGroupItem></ToggleGroup>);
  expect(screen.getByTestId('a').getAttribute('data-class')).toContain('bg-accent');
  expect(screen.getByTestId('c').getAttribute('data-class')).toContain('bg-accent');
  expect(screen.getByTestId('b').getAttribute('data-class')).not.toContain('bg-accent');
});
