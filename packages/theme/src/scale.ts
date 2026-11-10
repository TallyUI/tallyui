/** Port of WCPOS v2 `packages/components/src/lib/scale.ts`. */
export type ScaleStep = 'compact' | 'regular' | 'spacious';
export type ScaleOverride = 'auto' | ScaleStep;
export type Pointer = 'coarse' | 'fine';
export type ScaleVariables = {
  '--spacing': number;
  '--text-base': number;
  '--spacing-ctl': number;
  '--spacing-row': number;
  '--spacing-tile': number;
  '--radius': number;
  '--text-amt': number;
  '--text-xs': number;
  '--text-2xs': number;
};

/** The nine names in declaration order (the order of each SCALE_STEPS row). */
export const SCALE_VARIABLE_NAMES = [
  '--spacing', '--text-base', '--spacing-ctl', '--spacing-row', '--spacing-tile',
  '--radius', '--text-amt', '--text-xs', '--text-2xs',
] as const satisfies readonly (keyof ScaleVariables)[];

export const SCALE_STEPS = {
  compact: [3.5, 13, 40, 36, 56, 6, 34, 12, 11],
  regular: [4, 14, 44, 44, 64, 8, 40, 12, 11],
  spacious: [5, 16, 52, 52, 80, 10, 48, 14, 13],
} as const satisfies Record<ScaleStep, readonly number[]>;

export const POINTER_FLOORS = { coarse: 44, fine: 24 } as const satisfies Record<Pointer, number>;
export const AUTO_COMPACT_UNDER = 640;
export const AUTO_SPACIOUS_FROM = 1600;
export const MAX_FONT_SCALE = 1.3;

/** Explicit steps win; Auto and unknown stored values follow the window extent. */
export function resolveStep(override: string | undefined | null, extent: number): ScaleStep {
  if (override === 'compact' || override === 'regular' || override === 'spacious') return override;
  if (extent < AUTO_COMPACT_UNDER) return 'compact';
  if (extent >= AUTO_SPACIOUS_FROM) return 'spacious';
  return 'regular';
}

/** Apply pointer target floors to controls and rows, leaving the other tokens unchanged. */
export function scaleVariables(step: ScaleStep, pointer: Pointer): ScaleVariables {
  const [spacing, textBase, ctl, row, tile, radius, amt, xs, xxs] = SCALE_STEPS[step];
  const floor = POINTER_FLOORS[pointer];
  return {
    '--spacing': spacing,
    '--text-base': textBase,
    '--spacing-ctl': Math.max(ctl, floor),
    '--spacing-row': Math.max(row, floor),
    '--spacing-tile': tile,
    '--radius': radius,
    '--text-amt': amt,
    '--text-xs': xs,
    '--text-2xs': xxs,
  };
}
