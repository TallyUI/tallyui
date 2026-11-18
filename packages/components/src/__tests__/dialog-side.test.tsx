import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PortalHost } from '@tallyui/primitives';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';

// react-native-web atomizes className into hashed classes, so copy it to a data attribute.
// The content's className lands on an Animated.View (DialogPrimitive.Content asChild), so wrap that too.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => <Base ref={ref} {...props} dataSet={{ class: props.className }} />);
  return { ...rn, View: withClass(rn.View), Animated: { ...rn.Animated, View: withClass(rn.Animated.View) } };
});

afterEach(() => cleanup());

function classesOf(side?: 'center' | 'left' | 'right'): string[] {
  render(
    <>
      <Dialog open onOpenChange={() => {}}>
        <DialogContent side={side} testID="content"><DialogTitle>Content</DialogTitle></DialogContent>
      </Dialog>
      <PortalHost />
    </>,
  );
  return (screen.getByTestId('content').getAttribute('data-class') ?? '').split(/\s+/);
}

describe('DialogContent side', () => {
  it('side="left" is a full-height sheet on the left edge', () => {
    const classes = classesOf('left');
    expect(classes).toEqual(expect.arrayContaining(['left-0', 'top-0', 'h-full', 'border-r']));
    expect(classes).not.toContain('left-1/2');
    expect(classes).not.toContain('-translate-x-1/2');
    expect(classes).not.toContain('right-0');
  });

  it('side="right" is a full-height sheet on the right edge', () => {
    const classes = classesOf('right');
    expect(classes).toEqual(expect.arrayContaining(['right-0', 'h-full', 'border-l']));
    expect(classes).not.toContain('left-0');
    expect(classes).not.toContain('left-1/2');
  });

  it('with side omitted it is centred', () => {
    const classes = classesOf();
    expect(classes).toEqual(expect.arrayContaining(['left-1/2', '-translate-x-1/2']));
  });
});
