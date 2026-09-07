// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NFCTagItem } from './types';

const { getAllTagsMock } = vi.hoisted(() => ({
  getAllTagsMock: vi.fn()
}));

vi.mock('./storage/tagRepository', async () => {
  const actual = await vi.importActual<typeof import('./storage/tagRepository')>('./storage/tagRepository');
  return {
    ...actual,
    getAllTags: getAllTagsMock
  };
});

import { useAppStore } from './store';

const hydratedTag: NFCTagItem = {
  uid: '04112233445566',
  name: 'Hydrated Tag',
  firstSeen: 1,
  lastRead: 2,
  readCount: 1,
  hasNdef: false,
  records: []
};

describe('useAppStore storage hydration lifecycle', () => {
  beforeEach(() => {
    localStorage.clear();
    getAllTagsMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('starts in loading state while IndexedDB hydration is pending', () => {
    getAllTagsMock.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useAppStore());

    expect(result.current.storageStatus).toBe('loading');
    expect(result.current.isHydrated).toBe(false);
    expect(result.current.storageError).toBeNull();
    expect(result.current.tags).toEqual([]);
  });

  it('distinguishes a successfully loaded empty registry from loading', async () => {
    getAllTagsMock.mockResolvedValue([]);
    const { result } = renderHook(() => useAppStore());

    await waitFor(() => expect(result.current.storageStatus).toBe('ready'));
    expect(result.current.isHydrated).toBe(true);
    expect(result.current.storageError).toBeNull();
    expect(result.current.tags).toEqual([]);
  });

  it('hydrates persisted tags before reporting ready', async () => {
    getAllTagsMock.mockResolvedValue([hydratedTag]);
    const { result } = renderHook(() => useAppStore());

    await waitFor(() => expect(result.current.storageStatus).toBe('ready'));
    expect(result.current.tags).toEqual([hydratedTag]);
    expect(result.current.storageError).toBeNull();
  });

  it('reports storage errors instead of treating a failed load as an empty registry', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    getAllTagsMock.mockRejectedValue(new Error('IndexedDB unavailable'));
    const { result } = renderHook(() => useAppStore());

    await waitFor(() => expect(result.current.storageStatus).toBe('error'));
    expect(result.current.isHydrated).toBe(false);
    expect(result.current.storageError).toBe('Unable to load local tag data from IndexedDB.');
    expect(result.current.tags).toEqual([]);
    expect(consoleError).toHaveBeenCalled();
  });

  it('retries hydration and transitions from error through loading to ready', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let resolveRetry: ((tags: NFCTagItem[]) => void) | undefined;
    const retryPromise = new Promise<NFCTagItem[]>(resolve => {
      resolveRetry = resolve;
    });

    getAllTagsMock
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockImplementationOnce(() => retryPromise);

    const { result } = renderHook(() => useAppStore());
    await waitFor(() => expect(result.current.storageStatus).toBe('error'));

    let retryResult: Promise<{ success: boolean; error?: string }>;
    act(() => {
      retryResult = result.current.retryStorageHydration();
    });
    expect(result.current.storageStatus).toBe('loading');
    expect(result.current.storageError).toBeNull();

    await act(async () => {
      resolveRetry?.([hydratedTag]);
      await retryResult!;
    });

    expect(result.current.storageStatus).toBe('ready');
    expect(result.current.isHydrated).toBe(true);
    expect(result.current.storageError).toBeNull();
    expect(result.current.tags).toEqual([hydratedTag]);
    expect(getAllTagsMock).toHaveBeenCalledTimes(2);
  });
});
