/**
 * Tests for sync.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SyncStatus,
  getStatus,
  setProvider,
  onSyncStatusChange,
  sync,
  shouldSync
} from '../js/sync.js';

// Mock db module
vi.mock('../js/db.js', () => ({
  getAllIdeas: vi.fn(() => Promise.resolve([])),
  getPendingSyncIdeas: vi.fn(() => Promise.resolve([])),
  bulkSaveIdeas: vi.fn(() => Promise.resolve()),
  markSynced: vi.fn(() => Promise.resolve()),
  getSyncMeta: vi.fn(() => Promise.resolve(null)),
  setSyncMeta: vi.fn(() => Promise.resolve())
}));

describe('sync', () => {
  beforeEach(() => {
    // Reset provider
    setProvider(null);
  });

  describe('SyncStatus', () => {
    it('defines sync statuses', () => {
      expect(SyncStatus.IDLE).toBe('idle');
      expect(SyncStatus.SYNCING).toBe('syncing');
      expect(SyncStatus.ERROR).toBe('error');
    });
  });

  describe('getStatus', () => {
    it('returns current sync status', () => {
      const status = getStatus();
      expect(Object.values(SyncStatus)).toContain(status);
    });
  });

  describe('onSyncStatusChange', () => {
    it('registers a listener', () => {
      const listener = vi.fn();
      const unsubscribe = onSyncStatusChange(listener);
      expect(typeof unsubscribe).toBe('function');
    });

    it('returns unsubscribe function', () => {
      const listener = vi.fn();
      const unsubscribe = onSyncStatusChange(listener);
      unsubscribe();
      // No error means success
    });
  });

  describe('sync', () => {
    it('returns early if no provider configured', async () => {
      setProvider(null);
      await sync();
      // Should not throw
    });

    it('syncs with configured provider', async () => {
      const mockProvider = {
        fetch: vi.fn(() => Promise.resolve({ ideas: [] })),
        push: vi.fn(() => Promise.resolve())
      };

      setProvider(mockProvider);
      const result = await sync();

      expect(mockProvider.fetch).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('handles sync errors', async () => {
      const mockProvider = {
        fetch: vi.fn(() => Promise.reject(new Error('Network error'))),
        push: vi.fn()
      };

      setProvider(mockProvider);
      const result = await sync();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('shouldSync', () => {
    it('returns false when offline', () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
      setProvider({ fetch: vi.fn(), push: vi.fn() });
      expect(shouldSync()).toBe(false);
    });

    it('returns false when no provider', () => {
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
      setProvider(null);
      expect(shouldSync()).toBe(false);
    });

    it('returns true when online with provider', () => {
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
      setProvider({ fetch: vi.fn(), push: vi.fn() });
      expect(shouldSync()).toBe(true);
    });
  });
});
