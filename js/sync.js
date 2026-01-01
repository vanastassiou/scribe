/**
 * Sync engine for Scribe
 * Handles synchronization with cloud providers
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
let syncProvider = null;
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
 * Set the current sync provider
 */
export function setProvider(provider) {
  syncProvider = provider;
}

/**
 * Get current sync status
 */
export function getStatus() {
  return syncStatus;
}

/**
 * Perform a full sync
 */
export async function sync() {
  if (!syncProvider) {
    console.log('No sync provider configured');
    return;
  }

  if (syncStatus === SyncStatus.SYNCING) {
    console.log('Sync already in progress');
    return;
  }

  syncStatus = SyncStatus.SYNCING;
  notifyStatusChange();

  try {
    // Get local data
    const localIdeas = await getAllIdeas();
    const pendingIdeas = await getPendingSyncIdeas();
    const lastSync = await getSyncMeta('lastSync');

    // Fetch remote data
    const remoteData = await syncProvider.fetch();

    // Merge
    const merged = mergeIdeas(localIdeas, remoteData.ideas || [], lastSync);

    // Save merged data locally
    await bulkSaveIdeas(merged.local);

    // Push changes to remote
    if (merged.toUpload.length > 0 || pendingIdeas.length > 0) {
      await syncProvider.push({
        ideas: [...localIdeas, ...pendingIdeas],
        lastModified: new Date().toISOString()
      });

      // Mark as synced
      for (const idea of pendingIdeas) {
        await markSynced(idea.id);
      }
    }

    // Update last sync time
    await setSyncMeta('lastSync', new Date().toISOString());

    syncStatus = SyncStatus.IDLE;
    notifyStatusChange();

    return { success: true, merged: merged.local.length };
  } catch (err) {
    console.error('Sync failed:', err);
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
 * Check if we should sync (online and provider configured)
 */
export function shouldSync() {
  return navigator.onLine && syncProvider !== null;
}
