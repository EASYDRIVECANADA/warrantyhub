import { describe, it, expect } from 'vitest';
import { sanitizeWordsOnly } from '../lib/utils';

describe('sanitizeWordsOnly', () => {
  it('preserves letters, numbers, spaces, apostrophes, and hyphens', () => {
    expect(sanitizeWordsOnly("hello world 123")).toBe("hello world 123");
    expect(sanitizeWordsOnly("don't")).toBe("don't");
    expect(sanitizeWordsOnly("well-known")).toBe("well-known");
  });

  it('preserves email characters: @, ., +, -', () => {
    expect(sanitizeWordsOnly("user+tag@example.com")).toBe("user+tag@example.com");
    expect(sanitizeWordsOnly("first.last@domain.org")).toBe("first.last@domain.org");
  });

  it('preserves @ as a valid character for email searches', () => {
    expect(sanitizeWordsOnly("hello!@#$world")).toBe("hello@world");
  });

  it('preserves unicode letters', () => {
    expect(sanitizeWordsOnly("café")).toBe("café");
  });

  it('collapses multiple spaces', () => {
    expect(sanitizeWordsOnly("hello   world")).toBe("hello world");
  });
});
