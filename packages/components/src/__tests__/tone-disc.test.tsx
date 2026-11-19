import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PlusIcon, ToneDisc } from '../ui';

// react-native-web atomizes className into hashed classes, so copy it to a data attribute.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => <Base ref={ref} {...props} dataSet={{ class: props.className }} />);
  return { ...rn, View: withClass(rn.View), Text: withClass(rn.Text) };
});

afterEach(() => cleanup());

const classes = () => (screen.getByTestId('disc').getAttribute('data-class') ?? '').split(' ');
const svg = () => screen.getByTestId('disc').querySelector('svg');
const CIRCLE = 'M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0';

describe('ToneDisc', () => {
  it.each([
    ['ok', 'bg-ok-bg', 'text-ok'], ['warning', 'bg-warning-bg', 'text-warning-text'], ['bad', 'bg-bad-bg', 'text-bad'],
    ['info', 'bg-info/15', 'text-info'], ['muted', 'bg-muted', 'text-muted-foreground'],
  ] as const)('%s washes the disc %s and inks it %s', (tone, wash, ink) => {
    render(<ToneDisc testID="disc" tone={tone} />);
    expect(classes()).toEqual(expect.arrayContaining(['rounded-full', wash, ink]));
  });

  it.each([
    ['ok', 'm5 12 5 5L20 7'], ['warning', 'M12 9v4'], ['bad', `${CIRCLE}m9-4v4`], ['info', `${CIRCLE}m9-3h.01`], ['muted', `${CIRCLE}m9-3h.01`],
  ] as const)('%s leads with its own glyph', (tone, d) => {
    render(<ToneDisc testID="disc" tone={tone} />);
    const drawn = svg()?.querySelector('path')?.getAttribute('d') ?? '';
    expect(tone === 'ok' ? drawn : drawn.slice(0, d.length)).toBe(d);
  });

  it.each([['sm', 'size-11', 18], [undefined, 'size-14', 28], ['lg', 'size-24', 36]] as const)('%s sizes the disc and its glyph together', (size, disc, px) => {
    render(<ToneDisc testID="disc" tone="ok" size={size} />);
    expect(classes()).toContain(disc);
    expect([svg()?.getAttribute('width'), svg()?.getAttribute('height')]).toEqual([String(px), String(px)]);
  });

  it('draws the glyph at stroke 1.5, hidden from assistive tech', () => {
    render(<ToneDisc testID="disc" tone="bad" />);
    expect(svg()?.getAttribute('stroke-width')).toBe('1.5');
    expect(svg()?.getAttribute('aria-hidden')).toBe('true');
  });

  it('an icon wins over the tone glyph', () => {
    render(<ToneDisc testID="disc" tone="ok" icon={PlusIcon} />);
    expect(svg()?.querySelectorAll('line').length).toBeGreaterThan(0);
    expect(svg()?.querySelector('path')).toBeNull();
  });
});
