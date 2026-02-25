import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import * as HoverCard from '../hover-card';
import { PortalHost } from '../portal';

describe('HoverCard', () => {
  const renderHoverCard = (props = {}) =>
    render(
      <div>
        <PortalHost />
        <HoverCard.Root {...props}>
          <HoverCard.Trigger testID="trigger">Hover me</HoverCard.Trigger>
          <HoverCard.Portal>
            <HoverCard.Overlay testID="overlay" />
            <HoverCard.Content testID="content">Card content</HoverCard.Content>
          </HoverCard.Portal>
        </HoverCard.Root>
      </div>
    );

  it('trigger opens hover card', () => {
    renderHoverCard();
    fireEvent.click(screen.getByTestId('trigger'));
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('content rendered when open', () => {
    renderHoverCard({ defaultOpen: true });
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('content not rendered when closed', () => {
    renderHoverCard();
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('supports controlled mode', () => {
    const onOpenChange = vi.fn();
    renderHoverCard({ open: false, onOpenChange });
    fireEvent.click(screen.getByTestId('trigger'));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('supports uncontrolled with defaultOpen', () => {
    renderHoverCard({ defaultOpen: true });
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('trigger has button role', () => {
    renderHoverCard();
    expect(screen.getByTestId('trigger').getAttribute('role')).toBe('button');
  });

  it('asChild works on trigger', () => {
    render(
      <div>
        <PortalHost />
        <HoverCard.Root>
          <HoverCard.Trigger asChild>
            <div data-testid="custom-trigger">Custom</div>
          </HoverCard.Trigger>
          <HoverCard.Portal>
            <HoverCard.Content testID="content">Card content</HoverCard.Content>
          </HoverCard.Portal>
        </HoverCard.Root>
      </div>
    );
    const trigger = screen.getByTestId('custom-trigger');
    expect(trigger.getAttribute('role')).toBe('button');
  });

  it('overlay closes on click', () => {
    renderHoverCard({ defaultOpen: true });
    fireEvent.click(screen.getByTestId('overlay'));
    expect(screen.queryByTestId('content')).toBeNull();
  });
});
