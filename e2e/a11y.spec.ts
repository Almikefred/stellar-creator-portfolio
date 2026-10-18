/**
 * Accessibility e2e tests using @axe-core/playwright
 * Targets WCAG 2.2 AA. Fails on serious or critical violations.
 *
 * Run locally:
 *   pnpm test:e2e -- e2e/a11y.spec.ts
 *
 * Requires the app running on http://localhost:3000 (pnpm dev / pnpm start).
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** Pages to audit — extend as new routes are added */
const PAGES = [
  { name: 'home', path: '/' },
  { name: 'creators', path: '/creators' },
  { name: 'bounties', path: '/bounties' },
];

for (const { name, path } of PAGES) {
  test.describe(`a11y – ${name} page`, () => {
    test(`has no serious or critical WCAG 2.2 AA violations on ${path}`, async ({
      page,
    }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
        .analyze();

      const blocking = results.violations.filter((v) =>
        ['serious', 'critical'].includes(v.impact ?? ''),
      );

      if (blocking.length > 0) {
        const summary = blocking
          .map(
            (v) =>
              `[${v.impact?.toUpperCase()}] ${v.id}: ${v.description}\n` +
              v.nodes
                .slice(0, 3)
                .map((n) => `  target: ${n.target.join(', ')}`)
                .join('\n'),
          )
          .join('\n\n');
        throw new Error(
          `${blocking.length} blocking a11y violation(s) on "${path}":\n\n${summary}`,
        );
      }

      // Warn about moderate violations without failing
      const moderate = results.violations.filter(
        (v) => v.impact === 'moderate',
      );
      if (moderate.length > 0) {
        console.warn(
          `[a11y] ${moderate.length} moderate violation(s) on "${path}" (non-blocking):`,
          moderate.map((v) => v.id),
        );
      }

      expect(blocking).toHaveLength(0);
    });
  });
}
