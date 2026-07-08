/**
 * Trust tests for localization resource files.
 *
 * These assertions keep every locale in sync with the source locale so the
 * translation diff stays reviewable and safe against future edits (in CI):
 *   1. KEY PARITY        — every locale has the exact same set of keys as `en`.
 *   2. PLACEHOLDER INTEGRITY — every key carries the same interpolation
 *      placeholders ({{var}}) and inline tags (<0></0>) as the source.
 *
 * The tests auto-discover every `<locale>.json` in the locales directory, so
 * adding a new locale automatically brings it under test.
 */
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'locales');
const SOURCE_LOCALE = 'en';

function loadLocale(code) {
  return JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${code}.json`), 'utf8'));
}

// Flatten a nested translation object into dotted-path -> value pairs.
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, key, out);
    } else {
      out[key] = v;
    }
  }
  return out;
}

// Extract i18next interpolation placeholders ({{var}}) and inline tags (<0>, </0>).
function placeholders(value) {
  const matches = String(value).match(/\{\{[^}]+\}\}|<\/?[0-9A-Za-z]+>/g) || [];
  return matches.map((m) => m.replace(/\s+/g, '')).sort();
}

const localeCodes = fs
  .readdirSync(LOCALES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));

const targetLocales = localeCodes.filter((c) => c !== SOURCE_LOCALE);
const source = flatten(loadLocale(SOURCE_LOCALE));
const sourceKeys = Object.keys(source).sort();

describe('locale resource files', () => {
  test('source locale (en) exists and is non-empty', () => {
    expect(localeCodes).toContain(SOURCE_LOCALE);
    expect(sourceKeys.length).toBeGreaterThan(0);
  });

  test('there is at least one target locale to validate', () => {
    expect(targetLocales.length).toBeGreaterThan(0);
  });

  describe.each(targetLocales)('locale "%s"', (locale) => {
    const target = flatten(loadLocale(locale));
    const targetKeys = Object.keys(target).sort();

    test('has identical key set to source (key parity)', () => {
      const missing = sourceKeys.filter((k) => !(k in target));
      const extra = targetKeys.filter((k) => !(k in source));
      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });

    test('preserves interpolation placeholders/tags per key (placeholder integrity)', () => {
      const mismatches = [];
      for (const key of sourceKeys) {
        if (!(key in target)) continue;
        const expected = placeholders(source[key]);
        const actual = placeholders(target[key]);
        if (JSON.stringify(expected) !== JSON.stringify(actual)) {
          mismatches.push({ key, expected, actual });
        }
      }
      expect(mismatches).toEqual([]);
    });

    test('has no empty or non-string values', () => {
      const bad = targetKeys.filter(
        (k) => typeof target[k] !== 'string' || target[k].trim() === ''
      );
      expect(bad).toEqual([]);
    });
  });
});
