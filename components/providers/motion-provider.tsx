'use client';

import { MotionConfig } from 'framer-motion';

/**
 * Applies the visitor's `prefers-reduced-motion` setting to every
 * framer-motion component in the tree, so individual components don't have
 * to read `window.matchMedia` during render (which is unavailable on the
 * server and diverges between the server and client render).
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
