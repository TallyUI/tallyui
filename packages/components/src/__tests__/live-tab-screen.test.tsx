import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LiveTabScreen } from '../layout/live-tab-screen';

describe('LiveTabScreen', () => {
  it('renders nothing for "live"', () => {
    const { container } = render(<LiveTabScreen state="live" onUseHere={vi.fn()} onReload={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for "acquiring"', () => {
    const { container } = render(<LiveTabScreen state="acquiring" onUseHere={vi.fn()} onReload={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the title and "Use here" for "parked", and calls onUseHere', () => {
    const onUseHere = vi.fn();
    render(<LiveTabScreen state="parked" onUseHere={onUseHere} onReload={vi.fn()} />);
    expect(screen.getByText('POS is open in another tab')).toBeDefined();
    expect(screen.getByText('This tab stopped so the other one can work. Use it here instead?')).toBeDefined();
    fireEvent.click(screen.getByText('Use here'));
    expect(onUseHere).toHaveBeenCalledTimes(1);
  });

  it('renders "Reload" for "blocked", and calls onReload', () => {
    const onReload = vi.fn();
    render(<LiveTabScreen state="blocked" onUseHere={vi.fn()} onReload={onReload} />);
    expect(screen.getByText('POS is open in another tab')).toBeDefined();
    expect(screen.getByText('The POS is open in another tab. Close that tab to use it here, or reload this one.')).toBeDefined();
    fireEvent.click(screen.getByText('Reload'));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('replaces the default text with custom label props', () => {
    render(
      <LiveTabScreen
        state="parked"
        onUseHere={vi.fn()}
        onReload={vi.fn()}
        parkedTitle="Open elsewhere"
        parkedBody="Custom body"
        useHereLabel="Take over"
      />,
    );
    expect(screen.getByText('Open elsewhere')).toBeDefined();
    expect(screen.getByText('Custom body')).toBeDefined();
    expect(screen.getByText('Take over')).toBeDefined();
    expect(screen.queryByText('POS is open in another tab')).toBeNull();
  });
});
