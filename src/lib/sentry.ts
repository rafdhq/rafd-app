/**
 * Frontend error reporting. Uses Sentry DSN when VITE_SENTRY_DSN is configured.
 */

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export function initSentry() {
  if (!dsn) return;
  window.addEventListener('error', (ev) => {
    captureException(ev.error || ev.message);
  });
  window.addEventListener('unhandledrejection', (ev) => {
    captureException(ev.reason);
  });
}

export function captureException(err: unknown, extra: Record<string, unknown> = {}) {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error('[rafd]', message, extra);

  if (!dsn) return;
  try {
    const u = new URL(dsn);
    const publicKey = u.username;
    const projectId = u.pathname.replace(/^\//, '');
    const url = `https://${u.host}/api/${projectId}/store/`;
    void fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}`,
      },
      body: JSON.stringify({
        message,
        level: 'error',
        platform: 'javascript',
        timestamp: Date.now() / 1000,
        exception: stack
          ? { values: [{ type: 'Error', value: message, stacktrace: { frames: [{ filename: stack }] } }] }
          : undefined,
        tags: { app: 'rafd-web' },
        extra,
      }),
    });
  } catch {
    /* ignore */
  }
}
