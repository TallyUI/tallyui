import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Avatar, avatarInitials } from '../ui/avatar';

// react-native-web atomizes className into hashed classes, so copy it to a data attribute.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => <Base ref={ref} {...props} dataSet={{ class: props.className }} />);
  return { ...rn, View: withClass(rn.View), Text: withClass(rn.Text) };
});

afterEach(() => cleanup());

const fallback = (text: string) => {
  const label = screen.getByText(text);
  return { text: label.getAttribute('data-class'), circle: label.parentElement!.getAttribute('data-class') };
};

describe('Avatar', () => {
  it('draws the fallback muted by default', () => {
    render(<Avatar fallback="AL" />);
    const { text, circle } = fallback('AL');
    expect(circle).toContain('bg-muted');
    expect(text).toContain('text-muted-foreground');
    expect(circle).not.toContain('bg-primary');
  });

  it('draws the fallback on a primary circle with tone="primary"', () => {
    render(<Avatar fallback="AL" tone="primary" />);
    const { text, circle } = fallback('AL');
    expect(circle).toContain('bg-primary');
    expect(text).toContain('text-primary-foreground');
    expect(circle).not.toContain('bg-muted');
  });
});

describe('avatarInitials', () => {
  it.each([
    ['Ada Lovelace', 'AL'],
    ['  cher ', 'C'],
    ['Mary Ann Evans', 'MA'],
    ['', ''],
  ])('%j gives %j', (name, expected) => {
    expect(avatarInitials(name)).toBe(expected);
  });
});
