export {};

declare global {
  interface Window {
    /** Google Analytics tag function; only present when the gtag snippet has loaded. */
    gtag?: (command: string, action: string, params?: Record<string, unknown>) => void;
  }
}
