// Committed trust tests for the localization resource files (locales/*.json).
//
// These guard the localization convergence contract and keep future edits
// consistent in CI. They assert, for every configured locale:
//   (a) KEY PARITY       — identical set of NON-PLURAL keys as the source (en).
//   (b) PLURAL COMPLETE   — every pluralized key carries exactly the CLDR plural
//                           categories THAT locale's language requires, derived
//                           at runtime from Intl.PluralRules (never hardcoded).
//   (c) PLACEHOLDER PARITY — the set of interpolation placeholders / inline tags
//                           is identical across all locales, per base key (tokens
//                           unioned across a pluralized key's forms).
//
// Run via `npm test` (node + tsc, no external test runner required).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SOURCE_LOCALE = 'en';
const LOCALES = ['en', 'de', 'fr', 'ar', 'ja'] as const;

const CLDR_PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;
type PluralCategory = (typeof CLDR_PLURAL_CATEGORIES)[number];

// Resolved from the repo root (npm runs the compiled test from there), so it is
// independent of the compiled output's directory depth.
const localesDir = path.join(process.cwd(), 'locales');

// ---------------------------------------------------------------------------
// Minimal test harness (mirrors lib/followBacks.test.ts).
// ---------------------------------------------------------------------------
type Case = { name: string; fn: () => void };
const cases: Case[] = [];
const test = (name: string, fn: () => void) => cases.push({ name, fn });

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------
function loadLocale(locale: string): Record<string, string> {
  const raw = fs.readFileSync(path.join(localesDir, `${locale}.json`), 'utf8');
  return flatten(JSON.parse(raw));
}

// Flattens a nested resource object into dot-delimited leaf keys.
function flatten(obj: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object') {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = String(v);
    }
  }
  return out;
}

// If `key` ends in a CLDR plural suffix, returns { base, category }; else null.
function splitPlural(key: string): { base: string; category: PluralCategory } | null {
  for (const category of CLDR_PLURAL_CATEGORIES) {
    if (key.endsWith(`_${category}`)) {
      return { base: key.slice(0, -(category.length + 1)), category };
    }
  }
  return null;
}

// The categories a locale's language requires, derived at runtime from CLDR
// (cardinal plurals). Never hardcoded per language.
function requiredCategories(locale: string): Set<string> {
  return new Set(new Intl.PluralRules(locale).resolvedOptions().pluralCategories);
}

// Extracts interpolation placeholders ({{token}}) and inline tags (<0>, </0>,
// <1/>) from a value. Placeholder tokens are normalized to the name before any
// i18next formatter (e.g. `{{count, number}}` -> `count`).
function extractTokens(value: string): Set<string> {
  const tokens = new Set<string>();
  const interp = /\{\{\s*([^}]+?)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = interp.exec(value))) {
    tokens.add(`{{${m[1].split(',')[0].trim()}}}`);
  }
  const tag = /<\/?\s*(\d+)\s*\/?>/g;
  while ((m = tag.exec(value))) {
    tokens.add(`<${m[1]}>`);
  }
  return tokens;
}

// Loaded, flattened resources.
const flat: Record<string, Record<string, string>> = {};
for (const locale of LOCALES) flat[locale] = loadLocale(locale);
const source = flat[SOURCE_LOCALE];

// Pluralized base keys, derived from the SOURCE locale (the source of truth).
const pluralBases = new Set<string>();
for (const key of Object.keys(source)) {
  const split = splitPlural(key);
  if (split) pluralBases.add(split.base);
}

// Non-plural keys of a flattened locale (a key whose base is a known plural base
// is treated as a plural form and excluded here).
function nonPluralKeys(flatMap: Record<string, string>): Set<string> {
  const out = new Set<string>();
  for (const key of Object.keys(flatMap)) {
    const split = splitPlural(key);
    if (split && pluralBases.has(split.base)) continue;
    out.add(key);
  }
  return out;
}

// Categories present for a given base key in a flattened locale.
function categoriesFor(flatMap: Record<string, string>, base: string): Set<string> {
  const out = new Set<string>();
  for (const key of Object.keys(flatMap)) {
    const split = splitPlural(key);
    if (split && split.base === base) out.add(split.category);
  }
  return out;
}

// Union of placeholder tokens across a base key (all plural forms if pluralized,
// else the single key) in a flattened locale.
function tokensForBase(
  flatMap: Record<string, string>,
  base: string,
  isPlural: boolean
): Set<string> {
  const tokens = new Set<string>();
  if (isPlural) {
    for (const category of CLDR_PLURAL_CATEGORIES) {
      const v = flatMap[`${base}_${category}`];
      if (v !== undefined) for (const t of extractTokens(v)) tokens.add(t);
    }
  } else {
    const v = flatMap[base];
    if (v !== undefined) for (const t of extractTokens(v)) tokens.add(t);
  }
  return tokens;
}

const setsEqual = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((x) => b.has(x));

const diff = (a: Set<string>, b: Set<string>) => [...a].filter((x) => !b.has(x));

// ---------------------------------------------------------------------------
// (a) KEY PARITY — every locale has the identical set of non-plural keys as en.
// ---------------------------------------------------------------------------
const sourceNonPlural = nonPluralKeys(source);

for (const locale of LOCALES) {
  if (locale === SOURCE_LOCALE) continue;
  test(`key parity: ${locale} has the same non-plural keys as ${SOURCE_LOCALE}`, () => {
    const keys = nonPluralKeys(flat[locale]);
    const missing = diff(sourceNonPlural, keys);
    const extra = diff(keys, sourceNonPlural);
    assert.deepEqual(
      { missing, extra },
      { missing: [], extra: [] },
      `${locale}.json non-plural keys differ from ${SOURCE_LOCALE}.json`
    );
  });
}

// ---------------------------------------------------------------------------
// (b) PLURAL COMPLETENESS — each pluralized key carries EXACTLY the CLDR plural
//     categories that locale's own language requires (derived at runtime).
// ---------------------------------------------------------------------------
for (const locale of LOCALES) {
  const required = requiredCategories(locale);
  for (const base of pluralBases) {
    test(`plural completeness: ${locale} "${base}" has exactly [${[...required].sort().join(', ')}]`, () => {
      const present = categoriesFor(flat[locale], base);
      assert.ok(
        setsEqual(present, required),
        `${locale}.json "${base}" categories [${[...present].sort().join(', ')}] != required [${[...required].sort().join(', ')}]`
      );
      // Every present form must actually contain the {{count}} interpolation.
      for (const category of present) {
        const v = flat[locale][`${base}_${category}`];
        assert.ok(
          extractTokens(v).has('{{count}}'),
          `${locale}.json "${base}_${category}" is missing the {{count}} placeholder`
        );
      }
    });
  }
}

// ---------------------------------------------------------------------------
// (c) PLACEHOLDER INTEGRITY — per base key, the placeholder/tag token set is
//     identical across all locales (unioned across a plural key's forms).
// ---------------------------------------------------------------------------
{
  // All base keys: non-plural source keys, plus pluralized bases.
  const bases = new Map<string, boolean>(); // base -> isPlural
  for (const key of sourceNonPlural) bases.set(key, false);
  for (const base of pluralBases) bases.set(base, true);

  for (const [base, isPlural] of bases) {
    test(`placeholder integrity: "${base}" tokens identical across all locales`, () => {
      const expected = tokensForBase(source, base, isPlural);
      for (const locale of LOCALES) {
        if (locale === SOURCE_LOCALE) continue;
        const got = tokensForBase(flat[locale], base, isPlural);
        assert.ok(
          setsEqual(got, expected),
          `${locale}.json "${base}" tokens [${[...got].sort().join(', ')}] != ${SOURCE_LOCALE} [${[...expected].sort().join(', ')}]`
        );
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Runner.
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
for (const c of cases) {
  try {
    c.fn();
    passed++;
  } catch (err) {
    failed++;
    console.error(`✗ ${c.name}`);
    console.error(`  ${(err as Error).message}`);
  }
}

console.log(`\ni18n trust tests: ${passed} passed, ${failed} failed (${cases.length} total)`);
if (failed > 0) process.exit(1);
