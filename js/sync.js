/**
 * Sync engine for Scribe
 * Handles synchronization with cloud providers
 * Supports multiple providers syncing independently
 */

import { getAllIdeas, getPendingSyncIdeas, bulkSaveIdeas, markSynced, getSyncMeta, setSyncMeta } from './db.js';

/**
 * Sync status enum
 */
export const SyncStatus = {
  IDLE: 'idle',
  SYNCING: 'syncing',
  ERROR: 'error'
};

let syncStatus = SyncStatus.IDLE;
let syncProviders = new Map(); // provider name -> provider instance
let syncListeners = [];

/**
 * Register a sync status listener
 */
export function onSyncStatusChange(listener) {
  syncListeners.push(listener);
  return () => {
    syncListeners = syncListeners.filter((l) => l !== listener);
  };
}

/**
 * Notify listeners of status change
 */
function notifyStatusChange() {
  syncListeners.forEach((l) => l(syncStatus));
}

/**
 * Set a sync provider (legacy single-provider API)
 * @deprecated Use registerProvider instead
 */
export function setProvider(provider) {
  if (provider) {
    registerProvider(provider);
  } else {
    syncProviders.clear();
  }
}

/**
 * Register a sync provider
 */
export function registerProvider(provider) {
  if (provider && provider.name) {
    syncProviders.set(provider.name, provider);
  }
}

/**
 * Unregister a sync provider
 */
export function unregisterProvider(providerName) {
  syncProviders.delete(providerName);
}

/**
 * Get all registered providers
 */
export function getProviders() {
  return Array.from(syncProviders.values());
}

/**
 * Get current sync status
 */
export function getStatus() {
  return syncStatus;
}

/**
 * Perform a full sync to all registered providers
 */
export async function sync() {
  const providers = getProviders();
  if (providers.length === 0) {
    console.log('No sync providers configured');
    return { success: true, results: [] };
  }

  const results = [];
  for (const provider of providers) {
    const result = await syncToProvider(provider);
    results.push({ provider: provider.name, ...result });
  }

  const allSuccess = results.every((r) => r.success);
  return {
    success: allSuccess,
    results
  };
}

/**
 * Sync to a specific provider
 * @param {Object} provider - Provider instance (or provider name string)
 */
export async function syncToProvider(provider) {
  // If string, look up the provider
  if (typeof provider === 'string') {
    provider = syncProviders.get(provider);
    if (!provider) {
      return { success: false, error: `Provider '${provider}' not found` };
    }
  }

  if (syncStatus === SyncStatus.SYNCING) {
    console.log('Sync already in progress');
    return { success: false, error: 'Sync already in progress' };
  }

  syncStatus = SyncStatus.SYNCING;
  notifyStatusChange();

  const providerName = provider.name;

  try {
    // Get local data
    const localIdeas = await getAllIdeas();
    const pendingIdeas = await getPendingSyncIdeas();
    const lastSync = await getSyncMeta(`lastSync-${providerName}`);

    // Fetch remote data
    const remoteData = await provider.fetch();

    // Merge
    const merged = mergeIdeas(localIdeas, remoteData.ideas || [], lastSync);

    // Save merged data locally
    await bulkSaveIdeas(merged.local);

    // Push changes to remote
    if (merged.toUpload.length > 0 || pendingIdeas.length > 0) {
      await provider.push({
        ideas: merged.local,
        lastModified: new Date().toISOString()
      });

      // Mark as synced
      for (const idea of pendingIdeas) {
        await markSynced(idea.id);
      }
    }

    // Update last sync time for this provider
    await setSyncMeta(`lastSync-${providerName}`, new Date().toISOString());

    syncStatus = SyncStatus.IDLE;
    notifyStatusChange();

    return { success: true, merged: merged.local.length };
  } catch (err) {
    console.error(`Sync to ${providerName} failed:`, err);
    syncStatus = SyncStatus.ERROR;
    notifyStatusChange();
    return { success: false, error: err.message };
  }
}

/**
 * Merge local and remote ideas
 * Uses last-write-wins strategy based on updatedAt
 */
function mergeIdeas(local, remote, lastSync) {
  const merged = new Map();
  const toUpload = [];

  // Add all local ideas
  for (const idea of local) {
    merged.set(idea.id, idea);
  }

  // Merge remote ideas
  for (const remoteIdea of remote) {
    const localIdea = merged.get(remoteIdea.id);

    if (!localIdea) {
      // New from remote
      merged.set(remoteIdea.id, { ...remoteIdea, pendingSync: false });
    } else {
      // Conflict resolution: last-write-wins
      const localTime = new Date(localIdea.updatedAt).getTime();
      const remoteTime = new Date(remoteIdea.updatedAt).getTime();

      if (remoteTime > localTime) {
        merged.set(remoteIdea.id, { ...remoteIdea, pendingSync: false });
      } else if (localTime > remoteTime) {
        toUpload.push(localIdea);
      }
      // If equal, keep local (no action needed)
    }
  }

  return {
    local: Array.from(merged.values()),
    toUpload
  };
}

/**
 * Queue a sync for when online
 */
export async function queueSync() {
  if ('serviceWorker' in navigator && 'sync' in window.registration) {
    try {
      await window.registration.sync.register('sync-ideas');
    } catch (err) {
      console.log('Background sync not available:', err);
    }
  }
}

/**
 * Check if we should sync (online and at least one provider configured)
 */
export function shouldSync() {
  return navigator.onLine && syncProviders.size > 0;
}
