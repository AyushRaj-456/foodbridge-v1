import { describe, it, expect } from 'vitest';
import en from '../locales/en.json';
import kn from '../locales/kn.json';
import hi from '../locales/hi.json';

/**
 * Recursively extracts all dot-notated key paths from an object.
 */
function extractKeyPaths(obj, prefix = '') {
  let keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      keys = keys.concat(extractKeyPaths(value, fullPath));
    } else {
      keys.push(fullPath);
    }
  }
  return keys;
}

/**
 * Retrieves a nested value by dot-notated key path.
 */
function getValueByPath(obj, path) {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

describe('Multilingual Translation Completeness (EN, KN, HI)', () => {
  const enKeys = extractKeyPaths(en);

  it('contains comprehensive translation keys in the base English dictionary', () => {
    expect(enKeys.length).toBeGreaterThan(80);
  });

  it('ensures every English key exists and is non-empty in Kannada (kn.json)', () => {
    const missingInKn = [];
    for (const key of enKeys) {
      const val = getValueByPath(kn, key);
      if (val === undefined || val === null || val === '') {
        missingInKn.push(key);
      }
    }
    expect(missingInKn).toEqual([]);
  });

  it('ensures every English key exists and is non-empty in Hindi (hi.json)', () => {
    const missingInHi = [];
    for (const key of enKeys) {
      const val = getValueByPath(hi, key);
      if (val === undefined || val === null || val === '') {
        missingInHi.push(key);
      }
    }
    expect(missingInHi).toEqual([]);
  });

  it('verifies essential section namespaces are present in all locales', () => {
    const expectedSections = [
      'nav',
      'hero',
      'globe',
      'impact',
      'howItWorks',
      'categories',
      'footer',
      'auth',
      'onboarding',
      'donor',
      'recipient',
      'delivery',
      'admin',
      'status',
      'common'
    ];

    for (const section of expectedSections) {
      expect(en).toHaveProperty(section);
      expect(kn).toHaveProperty(section);
      expect(hi).toHaveProperty(section);
    }
  });
});
