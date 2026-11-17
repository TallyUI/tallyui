import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StatusBadge } from '../ui/status-badge';
import { TextClassContext } from '../ui/text';

// react-native-web atomizes className into hashed classes, so copy it to a data attribute.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => <Base ref={ref} {...props} dataSet={{ class: props.className }} />);
  return { ...rn, View: withClass(rn.View), Text: withClass(rn.Text) };
});

afterEach(() => cleanup());

const classes = (el: Element | null) => (el?.getAttribute('data-class') ?? '').split(' ');
const dot = () => screen.getByTestId('badge').firstElementChild;

describe('StatusBadge', () => {
  it.each([
    ['default', 'bg-primary'], ['ok', 'bg-success'], ['warning', 'bg-warning'],
    ['bad', 'bg-destructive'], ['info', 'bg-info'], ['muted', 'bg-muted-foreground'],
  ] as const)('%s draws a %s dot beside a foreground word', (variant, dotClass) => {
    render(<StatusBadge testID="badge" variant={variant} label="Synced" />);
    expect(classes(dot())).toEqual(expect.arrayContaining(['size-2', 'rounded-full', dotClass]));
    expect(classes(screen.getByText('Synced'))).toEqual(expect.arrayContaining(['text-sm', 'text-foreground']));
    expect(classes(screen.getByText('Synced'))).not.toContain(dotClass);
  });

  it('defaults to the primary dot', () => {
    render(<StatusBadge testID="badge" label="Ready" />);
    expect(classes(dot())).toContain('bg-primary');
  });

  it('caption is the muted help rank', () => {
    render(<StatusBadge testID="badge" size="caption" variant="warning" label="warn" />);
    expect(classes(dot())).toContain('size-1.5');
    expect(classes(dot())).not.toContain('size-2');
    expect(classes(screen.getByText('warn'))).toEqual(expect.arrayContaining(['text-xs', 'text-muted-foreground']));
    expect(classes(screen.getByText('warn'))).not.toContain('text-sm');
  });

  it('hides the dot from assistive tech', () => {
    render(<StatusBadge testID="badge" variant="ok" label="Signed in" />);
    expect(dot()?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('Signed in').isConnected).toBe(true);
  });

  it('merges a caller className onto the row', () => {
    render(<StatusBadge testID="badge" className="self-start" label="Ready" />);
    expect(classes(screen.getByTestId('badge'))).toEqual(expect.arrayContaining(['flex-row', 'items-center', 'self-start']));
  });

  it('the word ignores an inherited text class', () => {
    render(<TextClassContext.Provider value="text-destructive"><StatusBadge testID="badge" label="Ready" /></TextClassContext.Provider>);
    expect(classes(screen.getByText('Ready'))).not.toContain('text-destructive');
  });
});
