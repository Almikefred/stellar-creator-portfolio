#!/usr/bin/env node
/**
 * Translation management (issue #1628): ensure every locale file has
 * exactly the same keys as `en.json` — fails CI if any locale is missing
 * a key present in the base locale.
 *
 * This used to allow up to 10% of keys to be missing (MIN_COVERAGE =
 * 0.9) and wasn't wired into any CI workflow or npm script, so it never
 * actually ran. The acceptance criterion for #1628 is "All locales have
 * English keys," not "most of them," so this now requires exact parity;
 * see `pnpm run i18n:web` (and `i18n:check` for web + mobile together)
 * and the `frontend` job in `.github/workflows/ci.yml`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, '..', 'public', 'locales');
const BASE = 'en';

function flattenKeys(obj, prefix = '') {
  const keys = [];
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return keys;
  }
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, p));
    } else {
      keys.push(p);
    }
  }
  return keys.sort();
}

function loadLocale(code) {
  const fp = path.join(LOCALES_DIR, `${code}.json`);
  const raw = fs.readFileSync(fp, 'utf8');
  return JSON.parse(raw);
}

function main() {
  const files = fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json'));
  const codes = files.map((f) => f.replace('.json', ''));
  if (!codes.includes(BASE)) {
    console.error(`Missing base locale ${BASE}.json`);
    process.exit(1);
  }

  const baseKeys = new Set(flattenKeys(loadLocale(BASE)));
  let failed = false;

  for (const code of codes) {
    if (code === BASE) continue;
    const keys = new Set(flattenKeys(loadLocale(code)));
    const missing = [...baseKeys].filter((k) => !keys.has(k));
    const extra = [...keys].filter((k) => !baseKeys.has(k));
    if (missing.length || extra.length) {
      console.error(`\n[${code}] key parity vs ${BASE}:`);
      if (missing.length) console.error('  missing:', missing);
      if (extra.length) console.error('  extra:', extra);
    }
    if (missing.length) failed = true;
  }

  if (failed) {
    console.error('\ni18n: one or more locales are missing keys present in en.json — fix before merging.');
    process.exit(1);
  }

  console.log(`i18n: ${codes.length} locale files; ${baseKeys.size} keys in ${BASE}; all locales match.`);
}

main();
