import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Analytics } from './analytics';
import { isUserInteraction } from './analytics-interaction';

const posthogMock = vi.hoisted(() => ({ imports: 0, init: vi.fn() }));
vi.mock('posthog-js', () => {
  posthogMock.imports += 1;
  return { default: { init: posthogMock.init } };
});

beforeEach(() => {
  posthogMock.init.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Analytics', () => {
  it('does not import posthog-js before any interaction', async () => {
    render(<Analytics />);
    // A mount-time import of the mocked module lands within a few ms; 50 ms leaves margin for a slow runner.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });

    expect(posthogMock.imports).toBe(0);
    expect(posthogMock.init).not.toHaveBeenCalled();
  });

  it('ignores scroll, wheel, pointermove and untrusted events', async () => {
    render(<Analytics />);
    act(() => {
      for (const type of ['scroll', 'wheel', 'pointermove', 'pointerdown', 'keydown', 'touchstart']) {
        window.dispatchEvent(new Event(type));
      }
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });

    expect(posthogMock.imports).toBe(0);
    expect(posthogMock.init).not.toHaveBeenCalled();
  });

  it('imports posthog-js and calls init once on the first trusted interaction', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    render(<Analytics />);
    const listener = addSpy.mock.calls.find(([type]) => type === 'pointerdown')![1] as EventListener;
    for (const type of ['pointerdown', 'keydown', 'touchstart']) {
      expect(addSpy).toHaveBeenCalledWith(type, listener, { capture: true, passive: true });
    }
    for (const type of ['scroll', 'wheel', 'pointermove']) {
      expect(addSpy.mock.calls.some(([registeredType]) => registeredType === type)).toBe(false);
    }
    act(() => {
      listener({ type: 'pointerdown', isTrusted: true } as unknown as Event);
    });
    await vi.waitFor(() => expect(posthogMock.init).toHaveBeenCalledTimes(1));

    expect(posthogMock.init).toHaveBeenCalledWith(
      'phc_BhTJzZ7fXMqcD4MiaUJQsQqPkEpu94yoSAthXFBWemvd',
      expect.objectContaining({
        api_host: 'https://ph.wcpos.com',
        persistence: 'memory',
        autocapture: false,
        capture_pageview: 'history_change',
        person_profiles: 'never',
      }),
    );
    expect(posthogMock.imports).toBe(1);

    for (const type of ['pointerdown', 'keydown', 'touchstart']) {
      expect(removeSpy).toHaveBeenCalledWith(type, listener, { capture: true });
    }

    act(() => {
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('keydown'));
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(posthogMock.init).toHaveBeenCalledTimes(1);
  });

  it('does not load posthog-js after unmount', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const { unmount } = render(<Analytics />);
    const listener = addSpy.mock.calls.find(([type]) => type === 'pointerdown')![1] as EventListener;
    unmount();
    act(() => {
      listener({ type: 'pointerdown', isTrusted: true } as unknown as Event);
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(posthogMock.init).not.toHaveBeenCalled();
  });
});

describe('isUserInteraction', () => {
  it.each(['pointerdown', 'keydown', 'touchstart'])('accepts trusted %s', (type) => {
    expect(isUserInteraction({ type, isTrusted: true })).toBe(true);
  });

  it.each(['scroll', 'wheel', 'pointermove'])('rejects trusted %s', (type) => {
    expect(isUserInteraction({ type, isTrusted: true })).toBe(false);
  });

  it.each(['pointerdown', 'keydown'])('rejects untrusted %s', (type) => {
    expect(isUserInteraction({ type, isTrusted: false })).toBe(false);
  });
});
