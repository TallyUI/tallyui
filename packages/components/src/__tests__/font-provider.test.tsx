// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_TYPE, TYPE_SETS } from '@tallyui/theme';
import { FontProvider, useFontType } from '../fonts';

function Probe() {
  return <output data-testid="font-state">{JSON.stringify(useFontType())}</output>;
}

function state() {
  return JSON.parse(screen.getByTestId('font-state').textContent!);
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('FontProvider', () => {
  it('defaults to the loaded system type without a provider', () => {
    render(<Probe />);
    expect(state()).toEqual({ setId: 'system', type: SYSTEM_TYPE, status: 'loaded' });
  });

  it('does not call the loader for Auto resolving to system', () => {
    const loadFonts = vi.fn(async () => {});
    render(<FontProvider font="auto" loadFonts={loadFonts}><Probe /></FontProvider>);
    expect(state()).toEqual({ setId: 'system', type: SYSTEM_TYPE, status: 'loaded' });
    expect(loadFonts).not.toHaveBeenCalled();
  });

  it('publishes the selected type only after loading its families', async () => {
    const pending = deferred();
    const loadFonts = vi.fn(() => pending.promise);
    render(<FontProvider font="instrument" loadFonts={loadFonts}><Probe /></FontProvider>);
    expect(state()).toEqual({ setId: 'instrument', type: {}, status: 'loading' });
    expect(loadFonts).toHaveBeenCalledTimes(1);
    expect(loadFonts).toHaveBeenCalledWith(['DM Sans', 'JetBrains Mono', 'Instrument Serif']);
    await act(async () => { pending.resolve(); await pending.promise; });
    expect(state()).toEqual({ setId: 'instrument', type: TYPE_SETS.instrument, status: 'loaded' });
  });

  it('keeps the loaded type when the loader identity changes', async () => {
    const first = vi.fn(async () => {});
    const { rerender } = render(
      <FontProvider font="instrument" loadFonts={first}><Probe /></FontProvider>,
    );
    await act(async () => { await first.mock.results[0].value; });
    expect(state()).toEqual({ setId: 'instrument', type: TYPE_SETS.instrument, status: 'loaded' });

    const second = vi.fn(async () => {});
    rerender(<FontProvider font="instrument" loadFonts={second}><Probe /></FontProvider>);
    expect(state()).toEqual({ setId: 'instrument', type: TYPE_SETS.instrument, status: 'loaded' });
    expect(second).not.toHaveBeenCalled();
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('warns and keeps the system type on failure', async () => {
    const pending = deferred();
    const error = new Error('font load failed');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<FontProvider font="instrument" loadFonts={() => pending.promise}><Probe /></FontProvider>);
    await act(async () => { pending.reject(error); await pending.promise.catch(() => {}); });
    expect(state()).toEqual({ setId: 'instrument', type: {}, status: 'failed' });
    expect(warn).toHaveBeenCalledWith('Failed to load fonts', error);
  });

  it('uses registered faces immediately when no loader is supplied', () => {
    render(<FontProvider font="manrope"><Probe /></FontProvider>);
    expect(state()).toEqual({ setId: 'manrope', type: TYPE_SETS.manrope, status: 'loaded' });
  });

  it('ignores a stale load after the selected set changes', async () => {
    const instrument = deferred();
    const grotesk = deferred();
    const firstLoader = vi.fn(() => instrument.promise);
    const secondLoader = vi.fn(() => grotesk.promise);
    const { rerender } = render(
      <FontProvider font="instrument" loadFonts={firstLoader}><Probe /></FontProvider>,
    );
    rerender(<FontProvider font="grotesk" loadFonts={secondLoader}><Probe /></FontProvider>);
    expect(state()).toEqual({ setId: 'grotesk', type: {}, status: 'loading' });
    expect(secondLoader).toHaveBeenCalledWith(['Space Grotesk']);
    await act(async () => { grotesk.resolve(); await grotesk.promise; });
    expect(state()).toEqual({ setId: 'grotesk', type: TYPE_SETS.grotesk, status: 'loaded' });
    await act(async () => { instrument.resolve(); await instrument.promise; });
    expect(state()).toEqual({ setId: 'grotesk', type: TYPE_SETS.grotesk, status: 'loaded' });
  });

  it('uses the app-supplied Auto type set', () => {
    render(<FontProvider font="auto" autoTypeSet="fraunces"><Probe /></FontProvider>);
    expect(state()).toEqual({ setId: 'fraunces', type: TYPE_SETS.fraunces, status: 'loaded' });
  });
});
