import { describe, it, expect } from 'vitest';
import { toggleGroupUtils } from '../utils';

describe('toggleGroupUtils', () => {
  describe('getIsSelected', () => {
    it('returns true for matching single value', () => {
      expect(toggleGroupUtils.getIsSelected('a', 'a')).toBe(true);
    });
    it('returns true for value in array', () => {
      expect(toggleGroupUtils.getIsSelected(['a', 'b'], 'b')).toBe(true);
    });
    it('returns false for non-matching value', () => {
      expect(toggleGroupUtils.getIsSelected('a', 'b')).toBe(false);
    });
    it('returns false for undefined value', () => {
      expect(toggleGroupUtils.getIsSelected(undefined, 'a')).toBe(false);
    });
  });

  describe('getNewSingleValue', () => {
    it('deselects when already selected', () => {
      expect(toggleGroupUtils.getNewSingleValue('a', 'a')).toBeUndefined();
    });
    it('selects new value', () => {
      expect(toggleGroupUtils.getNewSingleValue('a', 'b')).toBe('b');
    });
    it('selects from undefined', () => {
      expect(toggleGroupUtils.getNewSingleValue(undefined, 'a')).toBe('a');
    });
  });

  describe('getNewMultipleValue', () => {
    it('adds value when not present', () => {
      expect(toggleGroupUtils.getNewMultipleValue(['a'], 'b')).toEqual(['a', 'b']);
    });
    it('removes value when present', () => {
      expect(toggleGroupUtils.getNewMultipleValue(['a', 'b'], 'b')).toEqual(['a']);
    });
    it('creates array from single string', () => {
      const result = toggleGroupUtils.getNewMultipleValue('a', 'b');
      expect(result).toEqual(['a', 'b']);
    });
    it('handles undefined original', () => {
      expect(toggleGroupUtils.getNewMultipleValue(undefined, 'a')).toEqual(['a']);
    });
  });
});
