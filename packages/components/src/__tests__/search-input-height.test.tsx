import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SearchInput } from '../input/search-input';

// react-native-web atomizes className into hashed classes, so copy it to a data attribute.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => (
      <Base ref={ref} {...props} dataSet={{ class: props.className }} />
    ));
  return { ...rn, View: withClass(rn.View) };
});

afterEach(cleanup);

describe('SearchInput height', () => {
  it('defaults to h-11 with centred content and no vertical padding', () => {
    render(<SearchInput value="" onChangeText={() => {}} />);
    const classes = screen.getByRole('searchbox').parentElement!.getAttribute('data-class')!.split(/\s+/);
    expect(classes).toContain('h-11');
    expect(classes).toContain('items-center');
    expect(classes).not.toContain('py-2.5');
  });

  it('lets the caller override the container height', () => {
    render(<SearchInput value="" onChangeText={() => {}} className="h-9" />);
    const classes = screen.getByRole('searchbox').parentElement!.getAttribute('data-class')!.split(/\s+/);
    expect(classes).toContain('h-9');
    expect(classes).not.toContain('h-11');
  });

  it('keeps border-border while unfocused', () => {
    render(<SearchInput value="" onChangeText={() => {}} />);
    const classes = screen.getByRole('searchbox').parentElement!.getAttribute('data-class')!.split(/\s+/);
    expect(classes).toContain('border-border');
  });
});
