'use client';

// Loads @axe-core/react in development only so axe violations appear in the
// browser console.  The import is dynamic so axe is never bundled for production.
// Usage: render <AxeObserver /> once, high in the React tree (e.g. layout.tsx).

import { useEffect } from 'react';

export function AxeObserver() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    // @axe-core/react is an optional dev tool: install it locally to get
    // reports. The specifier is a variable so builds don't require it.
    const specifier = '@axe-core/react';
    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ specifier)
      .then(async ({ default: axe }) => {
        const [React, ReactDOM] = await Promise.all([import('react'), import('react-dom')]);
        // @axe-core/react has no unsubscribe API, so it is left running.
        axe(React, ReactDOM, 1000);
      })
      .catch(() => {
        // Not installed; accessibility reporting stays off.
      });
  }, []);

  return null;
}
