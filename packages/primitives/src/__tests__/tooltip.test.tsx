import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import * as Tooltip from '../tooltip';
import { PortalHost } from '../portal';

describe('Tooltip', () => {
  const renderTooltip = (props = {}) =>
    render(
      <div>
        <PortalHost />
        <Tooltip.Root {...props}>
          <Tooltip.Trigger testID="trigger">Hover me</Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Overlay testID="overlay" />
            <Tooltip.Content testID="content">Tooltip text</Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </div>
    );

  it('content has tooltip role', () => {
    renderTooltip({ defaultOpen: true });
    expect(screen.getByTestId('content').getAttribute('role')).toBe('tooltip');
  });

  it('trigger opens tooltip', () => {
    renderTooltip();
    fireEvent.click(screen.getByTestId('trigger'));
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('closes on trigger re-press', () => {
    renderTooltip({ defaultOpen: true });
    fireEvent.click(screen.getByTestId('trigger'));
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('supports controlled mode', () => {
    const onOpenChange = vi.fn();
    renderTooltip({ open: false, onOpenChange });
    fireEvent.click(screen.getByTestId('trigger'));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('supports uncontrolled with defaultOpen', () => {
    renderTooltip({ defaultOpen: true });
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('content not rendered when closed', () => {
    renderTooltip();
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('trigger has button role', () => {
    renderTooltip();
    expect(screen.getByTestId('trigger').getAttribute('role')).toBe('button');
  });

  it('asChild works on trigger', () => {
    render(
      <div>
        <PortalHost />
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <div data-testid="custom-trigger">Custom</div>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content testID="content">Tooltip text</Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </div>
    );
    const trigger = screen.getByTestId('custom-trigger');
    expect(trigger.getAttribute('role')).toBe('button');
  });
});
