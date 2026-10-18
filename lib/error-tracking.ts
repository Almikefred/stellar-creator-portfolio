/**
 * Centralized error tracking module
 * Integrates with Sentry and custom backend logging endpoint
 * Replaces sessionStorage-based error logging with production-grade observability
 */

export interface ErrorContext {
  userId?: string;
  userEmail?: string;
  sessionId?: string;
  component?: string;
  action?: string;
  metadata?: Record<string, any>;
}

export interface ErrorReport {
  id: string;
  timestamp: string;
  level: 'error' | 'warning' | 'info';
  message: string;
  stack?: string;
  context: ErrorContext;
  url?: string;
  userAgent?: string;
  environment?: string;
}

/** The subset of the @sentry/nextjs API this module calls. */
interface SentryLike {
  init(options: Record<string, unknown>): void;
  captureException(error: unknown, hint?: Record<string, unknown>): void;
  setUser(user: { id: string; email?: string } | null): void;
  addBreadcrumb(breadcrumb: Record<string, unknown>): void;
  Replay?: new (options: Record<string, unknown>) => unknown;
}

let sentryPromise: Promise<SentryLike | null> | undefined;

/**
 * Loads @sentry/nextjs when a DSN is configured and the package is
 * installed; resolves to null otherwise. Sentry is an optional integration:
 * the specifier is held in a variable so neither the bundler nor tsc treats
 * it as a hard dependency of the app.
 */
function loadSentry(): Promise<SentryLike | null> {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return Promise.resolve(null);
  if (!sentryPromise) {
    const specifier = '@sentry/nextjs';
    sentryPromise = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ specifier)
      .then((mod) => mod as SentryLike)
      .catch(() => {
        console.warn('[ErrorTracker] NEXT_PUBLIC_SENTRY_DSN is set but @sentry/nextjs is not installed');
        return null;
      });
  }
  return sentryPromise;
}

class ErrorTracker {
  private sessionId: string;
  private isInitialized = false;
  /**
   * Read on every use rather than cached at initialize(), so errors captured
   * before initialisation still honour the opt-out.
   */
  private get enableTracking(): boolean {
    return process.env.NEXT_PUBLIC_ENABLE_ERROR_TRACKING !== 'false';
  }

  constructor() {
    this.sessionId = this.generateSessionId();
  }

  /**
   * Initialize error tracking with Sentry and backend endpoint
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    if (!this.enableTracking) {
      console.log('[ErrorTracker] Error tracking disabled');
      return;
    }

    // Initialize Sentry on client-side
    if (typeof window !== 'undefined') {
      await this.initializeSentry();
    }

    this.isInitialized = true;
  }

  /**
   * Initialize Sentry SDK
   */
  private async initializeSentry(): Promise<void> {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) {
      console.warn('[ErrorTracker] Sentry DSN not configured');
      return;
    }

    try {
      const Sentry = await loadSentry();
      if (!Sentry) return;
      Sentry.init({
        dsn,
        environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'development',
        tracesSampleRate: 1.0,
        integrations: Sentry.Replay
          ? [new Sentry.Replay({ maskAllText: true, blockAllMedia: true })]
          : [],
        replaySessionSampleRate: 0.1,
        replayOnErrorSampleRate: 1.0,
      });
    } catch (error) {
      console.error('[ErrorTracker] Failed to initialize Sentry:', error);
    }
  }

  /**
   * Capture and report an error
   */
  async captureError(
    error: Error | string,
    context: ErrorContext = {},
  ): Promise<string> {
    if (!this.enableTracking) {
      console.error('[ErrorTracker] Error tracking disabled, logging to console:', error);
      return '';
    }

    const errorReport = this.buildErrorReport(error, context);

    // Send to Sentry
    await this.sendToSentry(error, context);

    // Send to backend logging endpoint
    await this.sendToBackend(errorReport);

    return errorReport.id;
  }

  /**
   * Capture a warning
   */
  async captureWarning(
    message: string,
    context: ErrorContext = {},
  ): Promise<string> {
    if (!this.enableTracking) {
      console.warn('[ErrorTracker] Warning:', message);
      return '';
    }

    const errorReport: ErrorReport = {
      id: this.generateErrorId(),
      timestamp: new Date().toISOString(),
      level: 'warning',
      message,
      context: { ...context, sessionId: this.sessionId },
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'development',
    };

    await this.sendToBackend(errorReport);
    return errorReport.id;
  }

  /**
   * Build error report object
   */
  private buildErrorReport(
    error: Error | string,
    context: ErrorContext,
  ): ErrorReport {
    const errorObj = typeof error === 'string' ? new Error(error) : error;

    return {
      id: this.generateErrorId(),
      timestamp: new Date().toISOString(),
      level: 'error',
      message: errorObj.message,
      stack: errorObj.stack,
      context: { ...context, sessionId: this.sessionId },
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'development',
    };
  }

  /**
   * Send error to Sentry
   */
  private async sendToSentry(
    error: Error | string,
    context: ErrorContext,
  ): Promise<void> {
    try {
      const Sentry = await loadSentry();
      if (!Sentry) return;
      Sentry.captureException(error, {
        tags: {
          component: context.component,
          action: context.action,
        },
        contexts: {
          custom: context.metadata,
        },
        user: context.userId
          ? {
              id: context.userId,
              email: context.userEmail,
            }
          : undefined,
      });
    } catch (error) {
      console.error('[ErrorTracker] Failed to send to Sentry:', error);
    }
  }

  /**
   * Send error report to backend logging endpoint
   */
  private async sendToBackend(errorReport: ErrorReport): Promise<void> {
    try {
      const response = await fetch('/api/errors/log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(errorReport),
      });

      if (!response.ok) {
        console.error(
          '[ErrorTracker] Backend logging failed:',
          response.status,
          response.statusText,
        );
      }
    } catch (error) {
      console.error('[ErrorTracker] Failed to send error to backend:', error);
    }
  }

  /**
   * Set user context for error tracking
   */
  setUserContext(userId: string, userEmail?: string): void {
    void loadSentry().then((Sentry) => Sentry?.setUser({ id: userId, email: userEmail }));
  }

  /**
   * Clear user context
   */
  clearUserContext(): void {
    void loadSentry().then((Sentry) => Sentry?.setUser(null));
  }

  /**
   * Add breadcrumb for error tracking
   */
  addBreadcrumb(
    message: string,
    category: string = 'user-action',
    level: 'info' | 'warning' | 'error' = 'info',
  ): void {
    const timestamp = Date.now() / 1000;
    void loadSentry().then((Sentry) =>
      Sentry?.addBreadcrumb({ message, category, level, timestamp }),
    );
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }
}

// Export singleton instance
export const errorTracker = new ErrorTracker();

/**
 * Hook to initialize error tracking on app load
 */
export async function initializeErrorTracking(): Promise<void> {
  await errorTracker.initialize();
}
