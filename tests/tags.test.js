/**
 * Tests for tags.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  normalizeTag,
  isValidTag,
  parseTags,
  formatTags
} from '../js/tags.js';

describe('tags', () => {
  describe('normalizeTag', () => {
    it('trims whitespace', () => {
      expect(normalizeTag('  hello  ')).toBe('hello');
    });

    it('converts to lowercase', () => {
      expect(normalizeTag('Hello World')).toBe('hello-world');
    });

    it('replaces spaces with hyphens', () => {
      expect(normalizeTag('hello world')).toBe('hello-world');
    });

    it('collapses multiple spaces', () => {
      expect(normalizeTag('hello   world')).toBe('hello-world');
    });

    it('handles mixed case and spaces', () => {
      expect(normalizeTag('  Science Fiction  ')).toBe('science-fiction');
    });
  });

  describe('isValidTag', () => {
    it('accepts valid tags', () => {
      expect(isValidTag('reading')).toBe(true);
      expect(isValidTag('sci-fi')).toBe(true);
      expect(isValidTag('2024')).toBe(true);
    });

    it('rejects empty tags', () => {
      expect(isValidTag('')).toBe(false);
      expect(isValidTag('   ')).toBe(false);
    });

    it('rejects tags over 50 characters', () => {
      const longTag = 'a'.repeat(51);
      expect(isValidTag(longTag)).toBe(false);
    });

    it('accepts tags exactly 50 characters', () => {
      const maxTag = 'a'.repeat(50);
      expect(isValidTag(maxTag)).toBe(true);
    });
  });

  describe('parseTags', () => {
    it('parses comma-separated tags', () => {
      expect(parseTags('reading, sci-fi, classic')).toEqual([
        'reading',
        'sci-fi',
        'classic'
      ]);
    });

    it('normalizes tags while parsing', () => {
      expect(parseTags('Reading, Science Fiction')).toEqual([
        'reading',
        'science-fiction'
      ]);
    });

    it('filters out empty tags', () => {
      expect(parseTags('reading, , sci-fi,  ')).toEqual([
        'reading',
        'sci-fi'
      ]);
    });

    it('handles single tag', () => {
      expect(parseTags('reading')).toEqual(['reading']);
    });

    it('handles empty string', () => {
      expect(parseTags('')).toEqual([]);
    });
  });

  describe('formatTags', () => {
    it('joins tags with commas', () => {
      expect(formatTags(['reading', 'sci-fi'])).toBe('reading, sci-fi');
    });

    it('handles single tag', () => {
      expect(formatTags(['reading'])).toBe('reading');
    });

    it('handles empty array', () => {
      expect(formatTags([])).toBe('');
    });
  });
});
