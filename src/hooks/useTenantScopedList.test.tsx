// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '../lib/apiClient';
import { useTenantScopedList } from './useTenantScopedList';

// Mock only the network call — everything else (IndexedDB cache) is real,
// via fake-indexeddb, so the cache-fallback behavior is genuinely exercised.
vi.mock('../lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('../lib/apiClient')>('../lib/apiClient');
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from '../lib/apiClient';

const mockedApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
}

describe('useTenantScopedList (Products/Inventory root-cause fix)', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    setOnline(true);
  });
  afterEach(() => {
    setOnline(true);
  });

  it('no-tenant: resolves immediately without an infinite loading state (the original bug)', async () => {
    const { result } = renderHook(() => useTenantScopedList('products', null, null));
    // The old code left `loading=true` forever here. It must now settle.
    await waitFor(() => expect(result.current.status).toBe('no-tenant'));
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('ready: loads items and caches them for offline use', async () => {
    mockedApiFetch.mockResolvedValueOnce([{ id: 1, name: 'p1' }]);
    const { result } = renderHook(() => useTenantScopedList('products', 42, '/api/products?tenant_id=42'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.items).toEqual([{ id: 1, name: 'p1' }]);
    expect(result.current.offlineServed).toBe(false);
  });

  it('ready with zero items is a valid "no products" state, not an error', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useTenantScopedList('products', 42, '/api/products?tenant_id=42'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.items).toEqual([]);
    expect(result.current.errorKind).toBeNull();
  });

  it('error/auth: distinguishes a 401 from other failures', async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError('Unauthorized', 401));
    const { result } = renderHook(() => useTenantScopedList('products', 42, '/api/products?tenant_id=42'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorKind).toBe('auth');
  });

  it('error/permission: distinguishes a 403 from other failures', async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError('Forbidden', 403));
    const { result } = renderHook(() => useTenantScopedList('products', 42, '/api/products?tenant_id=42'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorKind).toBe('permission');
  });

  it('error/server: a 500 with no prior cache is reported as a server error, not a network error', async () => {
    // Distinct tenant id — must not collide with a tenant cached by an earlier
    // test in this file (a warm cache is a legitimate reason to fall back
    // instead of erroring, which is exactly what the "offline with a warm
    // cache" test below verifies).
    mockedApiFetch.mockRejectedValueOnce(new ApiError('Internal Server Error', 500));
    const { result } = renderHook(() => useTenantScopedList('products', 500, '/api/products?tenant_id=500'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorKind).toBe('server');
  });

  it('error/network: a true fetch failure with no cache is reported as a network error', async () => {
    mockedApiFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useTenantScopedList('products', 99, '/api/products?tenant_id=99'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorKind).toBe('network');
  });

  it('offline with a warm cache: serves cached data instead of erroring', async () => {
    // Prime the cache the same way a prior successful load would.
    mockedApiFetch.mockResolvedValueOnce([{ id: 7, name: 'cached-product' }]);
    const first = renderHook(() => useTenantScopedList('products', 7, '/api/products?tenant_id=7'));
    await waitFor(() => expect(first.result.current.status).toBe('ready'));

    setOnline(false);
    const { result } = renderHook(() => useTenantScopedList('products', 7, '/api/products?tenant_id=7'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.items).toEqual([{ id: 7, name: 'cached-product' }]);
    expect(result.current.offlineServed).toBe(true);
    expect(mockedApiFetch).toHaveBeenCalledTimes(1); // second render never hit the network
  });

  it('offline with no cache yet: reports network error instead of hanging', async () => {
    setOnline(false);
    const { result } = renderHook(() => useTenantScopedList('products', 123, '/api/products?tenant_id=123'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorKind).toBe('network');
  });
});
