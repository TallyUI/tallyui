import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AccessibilityInfo, Platform } from 'react-native';
import { Notice } from '../ui';

// react-native-web atomizes className into hashed classes, so copy it to a data attribute.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => <Base ref={ref} {...props} dataSet={{ class: props.className }} />);
  return { ...rn, View: withClass(rn.View), Text: withClass(rn.Text) };
});

const os = Platform.OS;
afterEach(() => { cleanup(); vi.restoreAllMocks(); Object.assign(Platform, { OS: os }); });

const band = () => screen.getByTestId('n');
const classes = (el: Element) => (el.getAttribute('data-class') ?? '').split(' ');

describe('Notice', () => {
  it.each([
    ['bad', 'alert', 'assertive'], ['warning', 'status', 'polite'], ['info', 'status', 'polite'],
  ] as const)('T1: %s is role %s, aria-live %s, and shows its title', (tone, role, live) => {
    render(<Notice testID="n" tone={tone} title="Card declined" />);
    expect(band().getAttribute('role')).toBe(role);
    expect(band().getAttribute('aria-live')).toBe(live);
    expect(screen.getByTestId('n-title').textContent).toBe('Card declined');
  });

  it('T2: live={false} is a plain group with no live region', () => {
    render(<Notice testID="n" tone="bad" title="Fields" live={false} />);
    expect(band().getAttribute('role')).toBe('group');
    expect(band().hasAttribute('aria-live')).toBe(false);
  });

  it('T3: the default icon draws one svg; icon={null} draws none', () => {
    render(<Notice testID="n" tone="warning" title="Low stock" />);
    expect(band().querySelectorAll('svg')).toHaveLength(1);
    cleanup();
    render(<Notice testID="n" tone="warning" title="Low stock" icon={null} />);
    expect(band().querySelectorAll('svg')).toHaveLength(0);
  });

  it('T4: each action presses its own handler; primary inks its label', () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <Notice
        testID="n"
        tone="bad"
        title="Card declined"
        actions={[{ label: 'Retry', onPress: first, primary: true }, { label: 'Dismiss', onPress: second }]}
      />
    );
    fireEvent.click(screen.getByTestId('n-action-1'));
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(classes(screen.getByText('Retry'))).toContain('text-primary');
    expect(classes(screen.getByText('Dismiss'))).not.toContain('text-primary');
  });

  it.each([['bad', 'bg-bad-bg'], ['warning', 'bg-warning-bg'], ['info', 'bg-card']] as const)('T5: %s washes the band %s', (tone, wash) => {
    render(<Notice testID="n" tone={tone} title="Line" />);
    expect(classes(band())).toContain(wash);
  });

  it('T6: on iOS a bad live band announces its title once on mount; warning and non-live bands never do', () => {
    Object.assign(Platform, { OS: 'ios' });
    const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const { rerender } = render(<Notice testID="n" tone="bad" title="Card declined" />);
    rerender(<Notice testID="n" tone="bad" title="Card declined" />);
    expect(announce.mock.calls).toEqual([['Card declined']]);
    cleanup();
    announce.mockClear();
    render(<Notice testID="w" tone="warning" title="Low stock" />);
    render(<Notice testID="g" tone="bad" title="Fields" live={false} />);
    expect(announce).not.toHaveBeenCalled();
  });
});
