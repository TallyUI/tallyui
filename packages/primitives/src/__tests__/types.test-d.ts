import { describe, expectTypeOf, it } from 'vitest';
import type {
  Prettify,
  SlottableViewProps,
  SlottablePressableProps,
  SlottableTextProps,
  SlottableImageProps,
  Insets,
  PositionedContentProps,
  ForceMountable,
  ViewRef,
  PressableRef,
  TextRef,
  ImageRef,
  PointerDownOutsideEvent,
  FocusOutsideEvent,
} from '../types';

describe('Prettify', () => {
  it('flattens intersection types', () => {
    type A = { a: string } & { b: number };
    type Result = Prettify<A>;
    expectTypeOf<Result>().toEqualTypeOf<{ a: string; b: number }>();
  });
});

describe('SlottableViewProps', () => {
  it('includes asChild prop', () => {
    expectTypeOf<SlottableViewProps>().toHaveProperty('asChild');
  });
  it('includes children prop', () => {
    expectTypeOf<SlottableViewProps>().toHaveProperty('children');
  });
});

describe('SlottablePressableProps', () => {
  it('includes asChild prop', () => {
    expectTypeOf<SlottablePressableProps>().toHaveProperty('asChild');
  });
});

describe('SlottableTextProps', () => {
  it('includes asChild prop', () => {
    expectTypeOf<SlottableTextProps>().toHaveProperty('asChild');
  });
});

describe('SlottableImageProps', () => {
  it('includes asChild prop', () => {
    expectTypeOf<SlottableImageProps>().toHaveProperty('asChild');
  });
});

describe('Ref types', () => {
  it('ViewRef has a current property', () => {
    expectTypeOf<ViewRef>().toHaveProperty('current');
  });
  it('PressableRef has a current property', () => {
    expectTypeOf<PressableRef>().toHaveProperty('current');
  });
  it('TextRef has a current property', () => {
    expectTypeOf<TextRef>().toHaveProperty('current');
  });
  it('ImageRef has a current property', () => {
    expectTypeOf<ImageRef>().toHaveProperty('current');
  });
});

describe('Insets', () => {
  it('has top, bottom, left, right as optional numbers', () => {
    expectTypeOf<Insets>().toHaveProperty('top');
    expectTypeOf<Insets>().toHaveProperty('bottom');
    expectTypeOf<Insets>().toHaveProperty('left');
    expectTypeOf<Insets>().toHaveProperty('right');
  });
});

describe('PositionedContentProps', () => {
  it('has positioning props', () => {
    expectTypeOf<PositionedContentProps>().toHaveProperty('align');
    expectTypeOf<PositionedContentProps>().toHaveProperty('side');
    expectTypeOf<PositionedContentProps>().toHaveProperty('sideOffset');
    expectTypeOf<PositionedContentProps>().toHaveProperty('avoidCollisions');
  });
  it('has insets prop', () => {
    expectTypeOf<PositionedContentProps>().toHaveProperty('insets');
  });
  it('has alignOffset prop', () => {
    expectTypeOf<PositionedContentProps>().toHaveProperty('alignOffset');
  });
});

describe('ForceMountable', () => {
  it('has forceMount as optional true', () => {
    expectTypeOf<ForceMountable>().toHaveProperty('forceMount');
  });
});

describe('Event types', () => {
  it('PointerDownOutsideEvent is a CustomEvent', () => {
    expectTypeOf<PointerDownOutsideEvent>().toMatchTypeOf<CustomEvent>();
  });
  it('FocusOutsideEvent is a CustomEvent', () => {
    expectTypeOf<FocusOutsideEvent>().toMatchTypeOf<CustomEvent>();
  });
});
