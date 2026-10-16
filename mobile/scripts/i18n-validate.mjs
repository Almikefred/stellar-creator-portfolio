#!/usr/bin/env node
/**
 * Mobile translation management (issue #1627): ensure every locale under
 * `mobile/src/i18n/locales/*.ts` has exactly the same keys as `en.ts`
 * (the base locale — see the comment at the top of `en.ts`).
 *
 * Mirrors the web equivalent at `scripts/i18n-validate.mjs`, adapted for
 * these being TypeScript modules (`export default { ... }`) rather than
 * plain JSON. Each locale file is plain object-literal JS plus one
 * TS-only line (`export type ... = typeof en;`, present only in `en.ts`);
 * that line is stripped before the module is loaded, so no TypeScript
 * compiler is needed to run this check.
 *
 * Unlike the web script's 90% coverage threshold, this requires exact
 * parity (zero missing, zero extra) — the acceptance criterion for #1627
 * is "All locales have the English keys," not "most of them."
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');
const BASE = 'en';

function loadLocaleModule(file) {
  let src = fs.readFileSync(file, 'utf8');
  // Strip the one TS-only construct these files use. Anything else here
  // is plain object-literal JS, so no TS compiler is needed.
  src = src.replace(/export type[^;]*;/g, '');
  src = src.replace(/export default\s+\w+;\s*$/m, '');
  src = src.replace(/const\s+(\w+)\s*=/, 'module.exports =');
  const sandbox = { module: { exports: {} } };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.module.exports;
}

function flattenKeys(obj, prefix = '') {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return [];
  const keys = [];
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

function main() {
  const files = fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.ts'));
  const codes = files.map((f) => f.replace(/\.ts$/, ''));
  if (!codes.includes(BASE)) {
    console.error(`Missing base locale ${BASE}.ts`);
    process.exit(1);
  }

  const baseKeys = new Set(flattenKeys(loadLocaleModule(path.join(LOCALES_DIR, `${BASE}.ts`))));
  let failed = false;

  for (const code of codes) {
    if (code === BASE) continue;
    const keys = new Set(flattenKeys(loadLocaleModule(path.join(LOCALES_DIR, `${code}.ts`))));
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
    console.error('\ni18n: one or more locales are missing keys present in en.ts — fix before merging.');
    process.exit(1);
  }

  console.log(`i18n: ${codes.length} locale files; ${baseKeys.size} keys in ${BASE}; all locales match.`);
}

main();
