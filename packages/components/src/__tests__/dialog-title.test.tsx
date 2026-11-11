import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Dialog, DialogTitle } from '../ui/dialog';
import { Text } from '../ui/text';

// react-native-web atomizes className into hashed classes, so copy it to a data attribute.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => <Base ref={ref} {...props} dataSet={{ class: props.className }} />);
  return { ...rn, View: withClass(rn.View), Text: withClass(rn.Text) };
});

afterEach(() => cleanup());

/** The class list that reaches the DOM node holding `text`. */
function classesOf(text: string): string[] {
  return (screen.getByText(text).getAttribute('data-class') ?? '').split(/\s+/);
}

function renderTitle(className?: string, children: React.ReactNode = 'Title') {
  render(
    <Dialog defaultOpen>
      <DialogTitle className={className}>{children}</DialogTitle>
    </Dialog>,
  );
}

describe('DialogTitle', () => {
  it('carries text-lg and leading-none by default', () => {
    renderTitle();
    expect(classesOf('Title')).toEqual(expect.arrayContaining(['text-lg', 'leading-none']));
  });

  it('keeps leading-none when the caller passes a text size', () => {
    renderTitle('text-base');
    const classes = classesOf('Title');
    expect(classes).toEqual(expect.arrayContaining(['text-base', 'leading-none']));
    expect(classes).not.toContain('text-lg');
  });

  it("lets the caller's own leading win", () => {
    renderTitle('text-base leading-6');
    const classes = classesOf('Title');
    expect(classes).toContain('leading-6');
    expect(classes).not.toContain('leading-none');
  });

  it("hands the caller's size and leading-none to a Text child", () => {
    renderTitle('text-base', <Text>Child</Text>);
    const classes = classesOf('Child');
    expect(classes).toEqual(expect.arrayContaining(['text-base', 'leading-none']));
    expect(classes).not.toContain('text-lg');
  });
});
