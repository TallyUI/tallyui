import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Analytics } from './analytics';

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
});

describe('Analytics', () => {
  it('does not import posthog-js before any interaction', async () => {
    render(<Analytics />);
    // A mount-time import of the mocked module lands within a few ms; 50 ms leaves margin for a slow runner.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });

    expect(posthogMock.imports).toBe(0);
    expect(posthogMock.init).not.toHaveBeenCalled();
  });

  it('imports posthog-js and calls init once on the first interaction', async () => {
    render(<Analytics />);
    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
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

    act(() => {
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('keydown'));
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(posthogMock.init).toHaveBeenCalledTimes(1);
  });

  it('does not load posthog-js after unmount', async () => {
    const { unmount } = render(<Analytics />);
    unmount();
    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(posthogMock.init).not.toHaveBeenCalled();
  });
});
