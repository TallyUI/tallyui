import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PortalHost } from '@tallyui/primitives';
import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxList } from '../ui/combobox';

// react-native-web atomizes className into hashed classes, so copy it to a data attribute;
// every ScrollView gets a testID so the test can tell what sits inside a scroll container.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => <Base ref={ref} {...props} dataSet={{ class: props.className }} />);
  const Scroll = React.forwardRef((props: object, ref) => <rn.ScrollView ref={ref as never} {...props} testID="combobox-scroll" />);
  return { ...rn, View: withClass(rn.View), ScrollView: Scroll };
});

afterEach(cleanup);

describe('ComboboxContent', () => {
  it("takes v2's width and max height; only ComboboxList scrolls, so an Input above it stays put", () => {
    render(
      <>
        <Combobox open>
          <ComboboxContent testID="content">
            <ComboboxInput testID="search" />
            <ComboboxList>
              <ComboboxItem value="red" label="Red" testID="item-red" />
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <PortalHost />
      </>,
    );
    const classes = (screen.getByTestId('content').getAttribute('data-class') ?? '').split(' ');
    expect(classes).toEqual(expect.arrayContaining(['w-80', 'max-h-75']));
    expect(classes).not.toContain('min-w-[8rem]');
    const scrolls = screen.getAllByTestId('combobox-scroll');
    expect(scrolls.some((scroll) => scroll.contains(screen.getByTestId('search'))), 'input inside a scroll container').toBe(false);
    expect(scrolls.some((scroll) => scroll.contains(screen.getByTestId('item-red'))), 'item inside the list').toBe(true);
  });
});
