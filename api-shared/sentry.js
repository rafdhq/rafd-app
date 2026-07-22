/**
 * Lightweight Sentry-compatible error capture.
 * When SENTRY_DSN is set, posts events to Sentry envelope API.
 * Never throws to callers.
 */

const dsn = process.env.SENTRY_DSN || '';

function parseDsn(raw) {
  try {
    const u = new URL(raw);
    const publicKey = u.username;
    const projectId = u.pathname.replace(/^\//, '');
    const host = u.host;
    return { publicKey, projectId, host };
  } catch {
    return null;
  }
}

export function captureException(err, extra = {}) {
  try {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('[rafd-sentry]', message, extra);

    const parsed = dsn ? parseDsn(dsn) : null;
    if (!parsed) return;

    const url = `https://${parsed.host}/api/${parsed.projectId}/store/`;
    const payload = {
      message,
      level: 'error',
      platform: 'node',
      timestamp: Date.now() / 1000,
      exception: stack
        ? {
            values: [
              {
                type: err?.name || 'Error',
                value: message,
                stacktrace: { frames: String(stack).split('\n').slice(0, 30).map((l) => ({ filename: l })) },
              },
            ],
          }
        : undefined,
      tags: { app: 'rafd-api' },
      extra,
    };

    // fire-and-forget
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${parsed.publicKey}`,
      },
      body: JSON.stringify(payload),
    }).catch(() => undefined);
  } catch {
    /* never throw */
  }
}

export function captureMessage(message, extra = {}) {
  captureException(new Error(message), extra);
}
