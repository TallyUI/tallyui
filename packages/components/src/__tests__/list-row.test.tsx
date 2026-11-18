import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ListRow } from '../ui';

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
});

const classesOf = (el: Element | null) => (el?.getAttribute('data-class') ?? '').split(' ');
const classes = () => classesOf(screen.getByTestId('row'));

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
});
