// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TextProps } from 'react-native';
import { FontProvider } from '../fonts';
import { Text } from '../ui/text';
import { withFont } from '../ui/text/font-text';

const calls: TextProps[] = [];
vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-native')>()),
  Text: (props: TextProps) => { calls.push(props); return null; },
}));

afterEach(() => {
  cleanup();
  calls.length = 0;
});

describe('Text font selection', () => {
  it('leaves style unset without a provider', () => {
    render(<Text>Total</Text>);
    expect(calls.at(-1)?.style).toBeUndefined();
  });

  it('uses the loaded body face', async () => {
    render(<FontProvider font="instrument" loadFonts={async () => {}}><Text>Total</Text></FontProvider>);
    await waitFor(() => expect(calls.at(-1)?.style).toEqual([
      { fontFamily: '"DM Sans", system-ui, sans-serif' }, undefined,
    ]));
  });

  it('uses the numbers face for tabular-nums', async () => {
    render(
      <FontProvider font="instrument" loadFonts={async () => {}}>
        <Text className="tabular-nums">123</Text>
      </FontProvider>,
    );
    await waitFor(() => expect(calls.at(-1)?.style).toEqual([
      { fontFamily: '"JetBrains Mono", ui-monospace, monospace' }, undefined,
    ]));
  });

  it('defers to an explicit font-mono class', async () => {
    render(
      <FontProvider font="instrument" loadFonts={async () => {}}>
        <Text>Body</Text><Text className="font-mono">123</Text>
      </FontProvider>,
    );
    await waitFor(() => expect(calls.at(-2)?.style).toEqual([
      { fontFamily: '"DM Sans", system-ui, sans-serif' }, undefined,
    ]));
    expect(calls.at(-1)?.style).toBeUndefined();
  });

  it('keeps the caller style last', async () => {
    const style = { color: 'red' };
    render(
      <FontProvider font="instrument" loadFonts={async () => {}}>
        <Text style={style}>Total</Text>
      </FontProvider>,
    );
    await waitFor(() => expect(calls.at(-1)?.style).toEqual([
      { fontFamily: '"DM Sans", system-ui, sans-serif' }, style,
    ]));
  });

  it('leaves style unset while loading', () => {
    const loadFonts = () => new Promise<void>(() => {});
    render(<FontProvider font="instrument" loadFonts={loadFonts}><Text>Total</Text></FontProvider>);
    expect(calls.at(-1)?.style).toBeUndefined();
  });

  it('returns the same wrapper for the same component', () => {
    const X = () => null;
    expect(withFont(X)).toBe(withFont(X));
  });
});
