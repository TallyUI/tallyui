import * as React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { OpenSaleTabs } from '../sale/open-sale-tabs';

// react-native-web atomizes className into hashed classes, so copy it to a data attribute.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => <Base ref={ref} {...props} dataSet={{ class: props.className }} />);
  return { ...rn, View: withClass(rn.View), Pressable: withClass(rn.Pressable), Text: withClass(rn.Text) };
});

afterEach(() => cleanup());

function barClass(className?: string): string {
  render(<OpenSaleTabs sales={[]} currency="EUR" onSelect={vi.fn()} onNew={vi.fn()} className={className} />);
  return screen.getByTestId('open-sale-tabs').getAttribute('data-class') ?? '';
}

it('keeps the top border by default', () => {
  expect(barClass()).toContain('border-t');
});

it('merges className onto the root, after the default classes', () => {
  const classes = barClass('border-t-0 border-b').split(/\s+/);
  expect(classes).toContain('border-b');
  expect(classes).toContain('border-t-0');
  expect(classes).not.toContain('border-t');
});
