import supabase from './supabase';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function authHeaders(extra?: HeadersInit): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (extra) {
    const h = new Headers(extra);
    h.forEach((v, k) => {
      headers[k] = v;
    });
  }
  return headers;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit & { tenantId?: number | null } = {}
): Promise<T> {
  const { tenantId, headers: optHeaders, ...rest } = options;
  const headers = await authHeaders(optHeaders);
  if (tenantId != null) headers['X-Tenant-Id'] = String(tenantId);

  const res = await fetch(path, { ...rest, headers });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error: string }).error)
        : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export const api = {
  get: <T = unknown>(path: string, tenantId?: number | null) =>
    apiFetch<T>(path, { method: 'GET', tenantId }),
  post: <T = unknown>(path: string, body?: unknown, tenantId?: number | null) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}), tenantId }),
  put: <T = unknown>(path: string, body?: unknown, tenantId?: number | null) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}), tenantId }),
  del: <T = unknown>(path: string, body?: unknown, tenantId?: number | null) =>
    apiFetch<T>(path, { method: 'DELETE', body: JSON.stringify(body ?? {}), tenantId }),
};
