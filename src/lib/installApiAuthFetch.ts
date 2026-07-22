import supabase from './supabase';

/**
 * Injects Supabase JWT into same-origin /api/* requests so existing fetch()
 * call sites gain production auth without rewriting every page.
 */
export function installApiAuthFetch() {
  if (typeof window === 'undefined') return;
  if ((window as unknown as { __rafdAuthFetchInstalled?: boolean }).__rafdAuthFetchInstalled) return;
  (window as unknown as { __rafdAuthFetchInstalled?: boolean }).__rafdAuthFetchInstalled = true;

  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      const isApi =
        url.startsWith('/api/') ||
        url.includes(`${window.location.origin}/api/`);

      if (isApi) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
          if (!headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${token}`);
          }
          return original(input, { ...init, headers });
        }
      }
    } catch {
      /* fall through */
    }
    return original(input, init);
  };
}
