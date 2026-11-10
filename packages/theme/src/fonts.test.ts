// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  FONT_FACES, FONT_SETTINGS, SYSTEM_TYPE, THEME_FONT_FAMILIES, TYPE_SETS, TYPE_SET_IDS,
  familiesForType, fontFamilyStyle, resolveTypeSet,
} from './fonts';

describe('font data', () => {
  it.each(Object.values(THEME_FONT_FAMILIES))('lists bundled faces for %s', (family) => {
    expect(FONT_FACES[family].length).toBeGreaterThan(0);
    for (const face of FONT_FACES[family]) {
      expect(typeof face.weight).toBe('number');
      expect(face.file).toMatch(/\.ttf$/);
    }
  });

  it('matches the v2 type sets and Settings order', () => {
    expect(TYPE_SETS).toEqual({
      system: {},
      instrument: { body: 'DM Sans', num: 'JetBrains Mono', display: 'Instrument Serif', displayItalic: true },
      grotesk: { body: 'Space Grotesk', num: 'Space Grotesk', display: 'Space Grotesk' },
      fraunces: { body: 'DM Sans', num: 'DM Sans', display: 'Fraunces', displayItalic: true },
      manrope: { body: 'Manrope', num: 'Manrope', display: 'Manrope' },
    });
    expect(FONT_SETTINGS).toEqual(['auto', 'system', 'instrument', 'grotesk', 'fraunces', 'manrope']);
  });
});

describe('fontFamilyStyle', () => {
  it('leaves an absent family unset', () => {
    expect(fontFamilyStyle(undefined, true)).toBeUndefined();
  });

  it.each(Object.values(THEME_FONT_FAMILIES))('uses the bare family on native: %s', (family) => {
    expect(fontFamilyStyle(family, false)).toEqual({ fontFamily: family });
  });

  it.each([
    ['DM Sans', '"DM Sans", system-ui, sans-serif'],
    ['Instrument Serif', '"Instrument Serif", ui-serif, serif'],
    ['JetBrains Mono', '"JetBrains Mono", ui-monospace, monospace'],
    ['Space Grotesk', '"Space Grotesk", system-ui, sans-serif'],
    ['Fraunces', '"Fraunces", ui-serif, serif'],
    ['Manrope', '"Manrope", system-ui, sans-serif'],
  ] as const)('uses the web stack for %s', (family, fontFamily) => {
    expect(fontFamilyStyle(family, true)).toEqual({ fontFamily });
  });
});

describe('familiesForType', () => {
  it('returns unique defined families in body, num, display order', () => {
    expect(familiesForType(TYPE_SETS.instrument)).toEqual(['DM Sans', 'JetBrains Mono', 'Instrument Serif']);
    expect(familiesForType(TYPE_SETS.grotesk)).toEqual(['Space Grotesk']);
    expect(familiesForType(SYSTEM_TYPE)).toEqual([]);
  });
});

describe('resolveTypeSet', () => {
  it.each(TYPE_SET_IDS)('resolves explicit %s', (id) => {
    expect(resolveTypeSet(id)).toBe(id);
  });

  it.each(['auto', undefined, null, '', 'comic'])('resolves %s to system', (value) => {
    expect(resolveTypeSet(value)).toBe('system');
  });

  it('uses the supplied Auto set', () => {
    expect(resolveTypeSet('auto', 'manrope')).toBe('manrope');
  });
});
