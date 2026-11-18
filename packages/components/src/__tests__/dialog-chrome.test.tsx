import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PortalHost } from '@tallyui/primitives';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '../ui/dialog';

// react-native-web atomizes className into hashed classes, so copy it to a data attribute.
// The content's className lands on an Animated.View (DialogPrimitive.Content asChild), so wrap that too.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => <Base ref={ref} {...props} dataSet={{ class: props.className }} />);
  return { ...rn, View: withClass(rn.View), Animated: { ...rn.Animated, View: withClass(rn.Animated.View) } };
});

afterEach(() => cleanup());

function renderDialog(content: Partial<React.ComponentProps<typeof DialogContent>>, bordered?: boolean) {
  const onOpenChange = vi.fn();
  render(
    <>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent {...content}>
          <DialogTitle>Content</DialogTitle>
          <DialogFooter testID="footer" bordered={bordered} />
        </DialogContent>
      </Dialog>
      <PortalHost />
    </>,
  );
  return onOpenChange;
}

const footerClasses = () => (screen.getByTestId('footer').getAttribute('data-class') ?? '').split(/\s+/);

describe('Dialog chrome', () => {
  it('draws no close button and no footer border by default', () => {
    renderDialog({ testID: 'content' });
    expect(screen.queryByTestId('content-close')).toBeNull();
    expect(screen.queryByTestId('dialog-close')).toBeNull();
    expect(footerClasses()).not.toContain('border-t');
  });

  it('showClose draws a labelled close that closes the dialog', () => {
    const onOpenChange = renderDialog({ testID: 'content', showClose: true });
    const close = screen.getByTestId('content-close');
    expect(close.getAttribute('aria-label')).toBe('Close');
    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('showClose on a side sheet draws the close too', () => {
    const onOpenChange = renderDialog({ testID: 'content', showClose: true, side: 'right' });
    const close = screen.getByTestId('content-close');
    expect(close.getAttribute('aria-label')).toBe('Close');
    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('with no testID the close is dialog-close and closeLabel sets its name', () => {
    renderDialog({ showClose: true, closeLabel: 'Dismiss' });
    expect(screen.getByTestId('dialog-close').getAttribute('aria-label')).toBe('Dismiss');
  });

  it('bordered footer draws the top divider', () => {
    renderDialog({ testID: 'content' }, true);
    expect(footerClasses()).toEqual(expect.arrayContaining(['border-t', 'border-border', 'pt-4']));
  });
});
