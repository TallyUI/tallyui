import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { scaleVariables, type ScaleVariables } from '@tallyui/theme';
import { ListRow } from '../ui';

// The real provider floors its own variables, so a stub is the only way to see ListRow's own floor.
let stubVariables: ScaleVariables | undefined;
vi.mock('../scale/scale-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../scale/scale-provider')>();
  return {
    ...actual,
    useScale: () => {
      const state = actual.useScale();
      return stubVariables ? { ...state, variables: stubVariables } : state;
    },
  };
});

// react-native-web atomizes className into hashed classes, so copy it to a data attribute.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => <Base ref={ref} {...props} dataSet={{ class: props.className }} />);
  return { ...rn, View: withClass(rn.View), Pressable: withClass(rn.Pressable) };
});

const matchMedia = window.matchMedia;

// jsdom has no matchMedia, which usePointer reads as a coarse pointer; this stub is a mouse.
function finePointer() {
  window.matchMedia = vi.fn((media: string) => ({
    media, matches: media === '(pointer: fine)' || media === '(hover: hover)',
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }) as unknown as MediaQueryList);
}

afterEach(() => {
  cleanup();
  window.matchMedia = matchMedia;
  stubVariables = undefined;
});

const classesOf = (el: Element | null) => (el?.getAttribute('data-class') ?? '').split(' ');
const classes = () => classesOf(screen.getByTestId('row'));
const minHeight = () => (screen.getByTestId('row') as HTMLElement).style.minHeight;

describe('ListRow', () => {
  it('is a hairline-ruled row with the press wash', () => {
    render(<ListRow testID="row" onPress={() => {}} />);
    expect(classes()).toEqual(expect.arrayContaining(['border-b', 'min-h-14', 'px-3', 'py-2', 'gap-3', 'active:bg-accent']));
    expect(classes().filter((c) => c.startsWith('rounded'))).toEqual([]);
  });

  it('puts leading, body and trailing in order, the body taking the room', () => {
    render(
      <ListRow testID="row" leading={<span data-testid="lead" />} trailing={<span data-testid="trail" />} bodyClassName="gap-1">
        <span data-testid="body" />
      </ListRow>,
    );
    const [lead, body, trail] = ['lead', 'body', 'trail'].map((id) => screen.getByTestId(id));
    expect(lead.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(body.compareDocumentPosition(trail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(classesOf(body.parentElement)).toEqual(expect.arrayContaining(['min-w-0', 'flex-1', 'gap-1']));
  });

  it('is a button and presses when it has an action', () => {
    const onPress = vi.fn();
    render(<ListRow testID="row" onPress={onPress} />);
    const button = screen.getByRole('button');
    expect(button.getAttribute('tabindex')).not.toBe('-1');
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is no button and no tab stop without an action', () => {
    const { container } = render(<ListRow testID="row" />);
    expect(container.querySelector('[role]')).toBeNull();
    expect(screen.getByTestId('row').getAttribute('tabindex')).toBe('-1');
  });

  it('a named role wins over the button default', () => {
    render(<ListRow testID="row" role="link" onPress={() => {}} />);
    expect(screen.getByRole('link')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a disabled row is dimmed and does not press', () => {
    const onPress = vi.fn();
    render(<ListRow testID="row" disabled onPress={onPress} />);
    expect(classes()).toEqual(expect.arrayContaining(['opacity-45', 'web:pointer-events-none']));
    fireEvent.click(screen.getByTestId('row'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('hovers on a fine pointer only', () => {
    render(<ListRow testID="row" onPress={() => {}} />);
    expect(classes()).not.toContain('web:hover:bg-accent');
    cleanup();
    finePointer();
    render(<ListRow testID="row" onPress={() => {}} />);
    expect(classes()).toContain('web:hover:bg-accent');
  });

  it("renders today's row when size and selected are unset", () => {
    render(<ListRow testID="row" onPress={() => {}} />);
    const row = screen.getByTestId('row');
    expect(row.getAttribute('data-class')).toBe(
      'border-border flex-row items-center gap-3 border-b px-3 py-2 min-h-14 active:bg-accent',
    );
    expect(minHeight()).toBe('');
    expect(row.hasAttribute('aria-selected')).toBe(false);
    expect(row.hasAttribute('aria-checked')).toBe(false);
  });

  it('has the row height for a one-line row', () => {
    render(<ListRow testID="row" size="sm" />);
    expect(classes()).not.toContain('min-h-14');
    expect(minHeight()).toBe('44px');
    cleanup();
    finePointer();
    render(<ListRow testID="row" size="sm" />);
    expect(minHeight()).toBe('44px');
    cleanup();
    // Compact's unfloored row (36) under a coarse pointer: the pointer floor lifts it to 44.
    window.matchMedia = matchMedia;
    stubVariables = scaleVariables('compact', 'fine');
    expect(stubVariables['--spacing-row']).toBe(36);
    render(<ListRow testID="row" size="sm" />);
    expect(minHeight()).toBe('44px');
  });

  it("keeps a caller's style over the row height", () => {
    render(<ListRow testID="row" size="sm" style={{ minHeight: 60 }} />);
    expect(minHeight()).toBe('60px');
    cleanup();
    render(<ListRow testID="row" size="sm" onPress={() => {}} style={() => ({ minHeight: 60 })} />);
    expect(minHeight()).toBe('60px');
  });

  it('paints the selected row with the primary bar, and keeps the bar room on the others', () => {
    render(
      <>
        <ListRow testID="on" selected onPress={() => {}} />
        <ListRow testID="off" selected={false} onPress={() => {}} />
        <ListRow testID="plain" onPress={() => {}} />
      </>,
    );
    const of = (id: string) => classesOf(screen.getByTestId(id));
    expect(of('on')).toEqual(expect.arrayContaining(['border-l-2', 'border-l-primary', 'bg-muted', 'pl-2.5']));
    expect(screen.getByTestId('on').getAttribute('aria-selected')).toBe('true');
    expect(of('off')).toEqual(expect.arrayContaining(['border-l-2', 'border-l-transparent', 'pl-2.5']));
    expect(of('off')).not.toContain('bg-muted');
    expect(screen.getByTestId('off').getAttribute('aria-selected')).toBe('false');
    for (const mark of ['border-l-2', 'border-l-primary', 'border-l-transparent', 'bg-muted', 'pl-2.5']) {
      expect(of('plain')).not.toContain(mark);
    }
    expect(screen.getByTestId('plain').hasAttribute('aria-selected')).toBe(false);
  });

  it('leaves a radio its checked state', () => {
    render(<ListRow testID="row" role="radio" selected onPress={() => {}} />);
    const row = screen.getByTestId('row');
    expect(row.getAttribute('aria-checked')).toBe('true');
    expect(row.hasAttribute('aria-selected')).toBe(false);
  });
});
