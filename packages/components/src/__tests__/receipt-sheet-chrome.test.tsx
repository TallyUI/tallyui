import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PortalHost } from '@tallyui/primitives';
import { ReceiptSheet } from '../sale';

// react-native-web atomizes className into hashed classes, so copy it to a data attribute.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => <Base ref={ref} {...props} dataSet={{ class: props.className }} />);
  return { ...rn, View: withClass(rn.View), Animated: { ...rn.Animated, View: withClass(rn.Animated.View) } };
});

afterEach(() => cleanup());

function renderSheet() {
  render(
    <>
      <ReceiptSheet open onOpenChange={vi.fn()} templates={[]} onPrint={vi.fn()}>{null}</ReceiptSheet>
      <PortalHost />
    </>,
  );
}

describe('ReceiptSheet chrome', () => {
  it('draws exactly one close X', () => {
    renderSheet();
    expect(screen.getAllByTestId('receipt-dialog-close')).toHaveLength(1);
  });

  it("the footer has v2's top divider", () => {
    renderSheet();
    const classes = (screen.getByTestId('receipt-footer').getAttribute('data-class') ?? '').split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(['border-t', 'border-border', 'pt-4']));
  });
});
