import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PortalHost } from '@tallyui/primitives';
import { Combobox, ComboboxContent, ComboboxItem } from '../ui/combobox';

// react-native-web atomizes className into hashed classes, so copy it to a data attribute;
// the ScrollView gets a testID so the test can find the items inside it.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => <Base ref={ref} {...props} dataSet={{ class: props.className }} />);
  const Scroll = React.forwardRef((props: object, ref) => <rn.ScrollView ref={ref as never} {...props} testID="combobox-scroll" />);
  return { ...rn, View: withClass(rn.View), ScrollView: Scroll };
});

afterEach(cleanup);

describe('ComboboxContent', () => {
  it("takes v2's width and max height, and its items render inside a scroll container", () => {
    render(
      <>
        <Combobox open>
          <ComboboxContent testID="content">
            <ComboboxItem value="red" label="Red" testID="item-red" />
          </ComboboxContent>
        </Combobox>
        <PortalHost />
      </>,
    );
    const classes = (screen.getByTestId('content').getAttribute('data-class') ?? '').split(' ');
    expect(classes).toEqual(expect.arrayContaining(['w-80', 'max-h-75']));
    expect(classes).not.toContain('min-w-[8rem]');
    expect(screen.getByTestId('combobox-scroll').contains(screen.getByTestId('item-red'))).toBe(true);
  });
});
