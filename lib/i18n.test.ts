import * as fs from 'fs';
import * as path from 'path';

type Catalog = Record<string, string>;

const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'];

function isPlural(key: string): boolean {
  return PLURAL_SUFFIXES.some((s) => key.endsWith(s));
}

function baseKey(key: string): string {
  for (const s of PLURAL_SUFFIXES) {
    if (key.endsWith(s)) return key.slice(0, -s.length);
  }
  return key;
}

function extractPlaceholders(value: string): Set<string> {
  const matches = value.matchAll(/\{\{(\w+)\}\}/g);
  const result = new Set<string>();
  for (const m of matches) result.add(m[1]);
  return result;
}

function loadCatalog(locale: string): Catalog {
  const filePath = path.join(process.cwd(), 'locales', `${locale}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Catalog;
}

const locales = ['en', 'de'];
const catalogs: Record<string, Catalog> = {};
for (const locale of locales) {
  catalogs[locale] = loadCatalog(locale);
}

const en = catalogs['en'];

const cases: { name: string; pass: boolean }[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    cases.push({ name, pass: true });
  } catch (e) {
    cases.push({ name, pass: false });
    console.error(`FAIL: ${name}`);
    console.error(e instanceof Error ? e.message : String(e));
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// Separate non-plural and plural base keys from EN
const enNonPluralKeys = new Set<string>();
const enPluralBases = new Set<string>();

for (const key of Object.keys(en)) {
  if (isPlural(key)) {
    enPluralBases.add(baseKey(key));
  } else {
    enNonPluralKeys.add(key);
  }
}

// ── Test 1: Key parity (non-plural keys) ─────────────────────────────────────
for (const locale of locales) {
  if (locale === 'en') continue;
  const catalog = catalogs[locale];

  const localNonPluralKeys = new Set<string>();
  for (const key of Object.keys(catalog)) {
    if (!isPlural(key)) localNonPluralKeys.add(key);
  }

  test(`[${locale}] non-plural key parity: all EN non-plural keys present`, () => {
    const missing: string[] = [];
    for (const key of enNonPluralKeys) {
      if (!localNonPluralKeys.has(key)) missing.push(key);
    }
    assert(missing.length === 0, `Missing non-plural keys in ${locale}:\n  ${missing.join('\n  ')}`);
  });

  test(`[${locale}] non-plural key parity: no extra non-plural keys`, () => {
    const extra: string[] = [];
    for (const key of localNonPluralKeys) {
      if (!enNonPluralKeys.has(key)) extra.push(key);
    }
    assert(extra.length === 0, `Extra non-plural keys in ${locale}:\n  ${extra.join('\n  ')}`);
  });
}

// ── Test 2: Plural completeness per locale (CLDR-derived categories) ─────────
for (const locale of locales) {
  if (enPluralBases.size === 0) continue;
  const catalog = catalogs[locale];

  const pluralCategories: string[] = new Intl.PluralRules(locale).resolvedOptions().pluralCategories as string[];

  test(`[${locale}] plural completeness: all CLDR categories present for each plural base`, () => {
    const errors: string[] = [];
    for (const base of enPluralBases) {
      for (const category of pluralCategories) {
        const form = `${base}_${category}`;
        if (!(form in catalog)) {
          errors.push(`${locale}: missing plural form "${form}" (category "${category}" required by CLDR)`);
        }
      }
    }
    assert(errors.length === 0, errors.join('\n'));
  });
}

// ── Test 3: Placeholder integrity per base key ────────────────────────────────
for (const locale of locales) {
  if (locale === 'en') continue;
  const catalog = catalogs[locale];

  test(`[${locale}] placeholder integrity: non-plural keys match EN placeholders`, () => {
    const errors: string[] = [];
    for (const key of enNonPluralKeys) {
      if (!(key in catalog)) continue;
      const enPlaceholders = extractPlaceholders(en[key]);
      const localPlaceholders = extractPlaceholders(catalog[key]);
      for (const ph of enPlaceholders) {
        if (!localPlaceholders.has(ph)) {
          errors.push(`${locale}["${key}"]: missing placeholder {{${ph}}}`);
        }
      }
      for (const ph of localPlaceholders) {
        if (!enPlaceholders.has(ph)) {
          errors.push(`${locale}["${key}"]: unexpected placeholder {{${ph}}}`);
        }
      }
    }
    assert(errors.length === 0, errors.join('\n'));
  });

  test(`[${locale}] placeholder integrity: plural forms share EN base placeholders`, () => {
    const errors: string[] = [];
    for (const base of enPluralBases) {
      // Collect all placeholders across EN plural forms for this base
      const enAllPlaceholders = new Set<string>();
      for (const key of Object.keys(en)) {
        if (isPlural(key) && baseKey(key) === base) {
          for (const ph of extractPlaceholders(en[key])) enAllPlaceholders.add(ph);
        }
      }

      // Check each present locale plural form
      for (const key of Object.keys(catalog)) {
        if (!isPlural(key) || baseKey(key) !== base) continue;
        const localPlaceholders = extractPlaceholders(catalog[key]);
        for (const ph of localPlaceholders) {
          if (!enAllPlaceholders.has(ph)) {
            errors.push(`${locale}["${key}"]: unexpected placeholder {{${ph}}}`);
          }
        }
      }
    }
    assert(errors.length === 0, errors.join('\n'));
  });
}

// ── Test 4: No empty values ───────────────────────────────────────────────────
for (const locale of locales) {
  const catalog = catalogs[locale];
  test(`[${locale}] no empty string values`, () => {
    const empty = Object.entries(catalog)
      .filter(([, v]) => v.trim() === '')
      .map(([k]) => k);
    assert(empty.length === 0, `Empty values in ${locale}:\n  ${empty.join('\n  ')}`);
  });
}

// ── Runner ────────────────────────────────────────────────────────────────────
const passed = cases.filter((c) => c.pass).length;
const failed = cases.filter((c) => !c.pass).length;
console.log(`\ni18n trust tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
