// Trust tests for the locale resource files (see .varv/localization.json).
// Run via `npm test` (node + tsc, no external test runner required).

import assert from 'node:assert/strict';
import en from './locales/en.json';
import de from './locales/de.json';

type Case = { name: string; fn: () => void | Promise<void> };
const cases: Case[] = [];
const test = (name: string, fn: () => void | Promise<void>) => cases.push({ name, fn });

const locales: Record<string, Record<string, string>> = { en, de };
const sourceLocale = 'en';

const PLURAL_SUFFIX_RE = /_(zero|one|two|few|many|other)$/;

const baseKey = (key: string): string => key.replace(PLURAL_SUFFIX_RE, '');
const pluralSuffix = (key: string): string | null => key.match(PLURAL_SUFFIX_RE)?.[1] ?? null;

// A key is "plural" if some locale defines a `_<category>` sibling for the same base.
const allBaseKeys = new Set<string>();
const pluralBaseKeys = new Set<string>();
for (const locale of Object.values(locales)) {
  for (const key of Object.keys(locale)) {
    const base = baseKey(key);
    allBaseKeys.add(base);
    if (pluralSuffix(key)) pluralBaseKeys.add(base);
  }
}
const nonPluralKeys = (locale: Record<string, string>): string[] =>
  Object.keys(locale).filter((key) => !pluralBaseKeys.has(baseKey(key)));

// --- key parity (non-plural keys) ----------------------------------------------

test('every locale has the identical set of non-plural keys as the source locale', () => {
  const sourceKeys = new Set(nonPluralKeys(locales[sourceLocale]));
  for (const [localeName, locale] of Object.entries(locales)) {
    if (localeName === sourceLocale) continue;
    const localeKeys = new Set(nonPluralKeys(locale));
    const missing = [...sourceKeys].filter((k) => !localeKeys.has(k));
    const extra = [...localeKeys].filter((k) => !sourceKeys.has(k));
    assert.deepEqual(missing, [], `${localeName} is missing non-plural keys: ${missing.join(', ')}`);
    assert.deepEqual(extra, [], `${localeName} has extra non-plural keys: ${extra.join(', ')}`);
  }
});

// --- plural completeness (per-locale CLDR categories) --------------------------

test('every locale carries exactly the CLDR plural categories its own language requires', () => {
  for (const [localeName, locale] of Object.entries(locales)) {
    const expectedCategories = new Set<string>(
      new Intl.PluralRules(localeName).resolvedOptions().pluralCategories
    );
    for (const base of pluralBaseKeys) {
      const presentCategories = new Set(
        Object.keys(locale)
          .filter((key) => baseKey(key) === base)
          .map((key) => pluralSuffix(key))
          .filter((c): c is string => c !== null)
      );
      const missing = [...expectedCategories].filter((c) => !presentCategories.has(c));
      const extra = [...presentCategories].filter((c) => !expectedCategories.has(c));
      assert.deepEqual(
        missing,
        [],
        `${localeName} is missing plural categories for "${base}": ${missing.join(', ')}`
      );
      assert.deepEqual(
        extra,
        [],
        `${localeName} has unexpected plural categories for "${base}": ${extra.join(', ')}`
      );
    }
  }
});

// --- placeholder integrity (per base key, unioned across plural forms) --------

const placeholdersOf = (value: string): Set<string> => {
  const set = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value))) set.add(match[1]);
  return set;
};

test('placeholders are identical across all locales, compared per base key', () => {
  const unionForLocale = (locale: Record<string, string>, base: string): Set<string> => {
    const union = new Set<string>();
    for (const [key, value] of Object.entries(locale)) {
      if (baseKey(key) === base) {
        for (const p of placeholdersOf(value)) union.add(p);
      }
    }
    return union;
  };

  for (const base of allBaseKeys) {
    const perLocale = Object.entries(locales).map(([name, locale]) => ({
      name,
      tokens: unionForLocale(locale, base),
    }));
    const referenceTokens = new Set<string>();
    for (const { tokens } of perLocale) {
      for (const t of tokens) referenceTokens.add(t);
    }
    for (const { name, tokens } of perLocale) {
      const missing = [...referenceTokens].filter((t) => !tokens.has(t));
      assert.deepEqual(
        missing,
        [],
        `${name}'s "${base}" is missing placeholders present in other locales: ${missing.join(', ')}`
      );
    }
  }
});

// --- sanity: no empty or non-string values -------------------------------------

test('no locale has empty or non-string translation values', () => {
  for (const [localeName, locale] of Object.entries(locales)) {
    for (const [key, value] of Object.entries(locale)) {
      assert.equal(typeof value, 'string', `${localeName}.${key} is not a string`);
      assert.notEqual(value.trim(), '', `${localeName}.${key} is empty`);
    }
  }
});

// --- runner -------------------------------------------------------------------

(async () => {
  let failed = 0;
  for (const c of cases) {
    try {
      await c.fn();
      console.log(`  ✓ ${c.name}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${c.name}`);
      console.error(err instanceof Error ? err.message : err);
    }
  }
  const total = cases.length;
  console.log(`\n${total - failed}/${total} passed`);
  if (failed > 0) process.exit(1);
})();
