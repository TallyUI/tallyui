import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Switch } from '../ui/switch';

// Props the root Pressable receives, before react-native-web filters unknown ones.
const rootProps = vi.hoisted(() => [] as Record<string, unknown>[]);

// react-native-web atomizes className into hashed classes, so copy it to a data attribute.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType, seen?: Record<string, unknown>[]) =>
    React.forwardRef((props: { className?: string }, ref) => {
      seen?.push(props);
      return <Base ref={ref} {...props} dataSet={{ class: props.className }} />;
    });
  return { ...rn, View: withClass(rn.View), Pressable: withClass(rn.Pressable, rootProps) };
});

afterEach(() => {
  cleanup();
  rootProps.length = 0;
});

const parts = () => {
  const track = screen.getByRole('switch');
  const thumb = track.querySelector('[data-class*="rounded-full bg-background"]')!;
  const classes = (el: Element) => (el.getAttribute('data-class') ?? '').split(/\s+/);
  return { track, trackClasses: classes(track), thumbClasses: classes(thumb) };
};

describe('Switch size', () => {
  it('default: h-6 w-11 track, h-5 w-5 thumb, translate-x-5 when checked', () => {
    render(<Switch checked />);
    const { trackClasses, thumbClasses } = parts();
    expect(trackClasses).toEqual(expect.arrayContaining(['h-6', 'w-11']));
    expect(thumbClasses).toEqual(expect.arrayContaining(['h-5', 'w-5', 'translate-x-5']));
  });

  it('sm: h-5 w-9 track, h-4 w-4 thumb, translate-x-4 when checked and translate-x-0 when not', () => {
    render(<Switch size="sm" checked />);
    const on = parts();
    expect(on.trackClasses).toEqual(expect.arrayContaining(['h-5', 'w-9']));
    expect(on.trackClasses).not.toContain('h-6');
    expect(on.thumbClasses).toEqual(expect.arrayContaining(['h-4', 'w-4', 'translate-x-4']));
    expect(on.thumbClasses).not.toContain('translate-x-5');
    cleanup();
    render(<Switch size="sm" checked={false} />);
    const off = parts();
    expect(off.thumbClasses).toContain('translate-x-0');
    expect(off.thumbClasses).not.toContain('translate-x-4');
  });

  it('size does not reach the root as a prop or attribute', () => {
    const { container } = render(<Switch size="sm" />);
    expect(rootProps.length).toBeGreaterThan(0);
    expect(rootProps.every((p) => !('size' in p))).toBe(true);
    expect(screen.getByRole('switch').hasAttribute('size')).toBe(false);
    expect(container.querySelector('[size]')).toBeNull();
  });
});
