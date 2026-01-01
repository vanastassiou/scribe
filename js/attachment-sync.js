/**
 * Attachment sync engine
 *
 * Handles syncing file attachments to cloud storage providers.
 * Attachments are stored locally in IndexedDB and synced to the
 * provider's attachment folder when online.
 */

import { getAttachment, saveAttachment, updateAttachment, deleteAttachment } from './db.js';

// Sync status constants
export const AttachmentSyncStatus = {
  LOCAL: 'local',      // Only exists locally
  SYNCING: 'syncing',  // Currently uploading/downloading
  SYNCED: 'synced',    // Synced with remote
  ERROR: 'error'       // Sync failed
};

let provider = null;

/**
 * Set the active sync provider
 * @param {Object} syncProvider - Provider with upload/download methods
 */
export function setAttachmentProvider(syncProvider) {
  provider = syncProvider;
}

/**
 * Get the current provider
 * @returns {Object|null}
 */
export function getAttachmentProvider() {
  return provider;
}

/**
 * Upload an attachment to the remote provider
 * @param {Object} attachment - Attachment metadata
 * @param {Blob} blob - File data
 * @returns {Promise<Object>} Updated attachment with remoteId
 */
export async function uploadAttachment(attachment, blob) {
  if (!provider) {
    throw new Error('No sync provider configured');
  }

  if (!provider.uploadAttachment) {
    throw new Error('Provider does not support attachment upload');
  }

  // Mark as syncing
  const syncingAttachment = {
    ...attachment,
    syncStatus: AttachmentSyncStatus.SYNCING
  };
  await updateAttachment(syncingAttachment);

  try {
    // Upload to provider
    const remoteId = await provider.uploadAttachment(
      attachment.id,
      attachment.filename,
      blob,
      attachment.mimeType
    );

    // Mark as synced
    const syncedAttachment = {
      ...attachment,
      remoteId,
      syncStatus: AttachmentSyncStatus.SYNCED
    };
    await updateAttachment(syncedAttachment);

    return syncedAttachment;
  } catch (err) {
    // Mark as error
    const errorAttachment = {
      ...attachment,
      syncStatus: AttachmentSyncStatus.ERROR,
      syncError: err.message
    };
    await updateAttachment(errorAttachment);

    throw err;
  }
}

/**
 * Download an attachment from the remote provider
 * @param {Object} attachment - Attachment metadata with remoteId
 * @returns {Promise<Blob>} File data
 */
export async function downloadAttachment(attachment) {
  if (!provider) {
    throw new Error('No sync provider configured');
  }

  if (!provider.downloadAttachment) {
    throw new Error('Provider does not support attachment download');
  }

  if (!attachment.remoteId) {
    throw new Error('Attachment has no remote ID');
  }

  // Check if we have it locally first
  const local = await getAttachment(attachment.id);
  if (local && local.blob) {
    return local.blob;
  }

  // Download from provider
  const blob = await provider.downloadAttachment(attachment.remoteId);

  // Cache locally
  await saveAttachment(attachment.id, blob);

  return blob;
}

/**
 * Delete an attachment from the remote provider
 * @param {Object} attachment - Attachment metadata with remoteId
 * @returns {Promise<void>}
 */
export async function deleteRemoteAttachment(attachment) {
  if (!provider) {
    return; // Nothing to delete remotely
  }

  if (!provider.deleteAttachment) {
    return; // Provider doesn't support deletion
  }

  if (!attachment.remoteId) {
    return; // Not synced remotely
  }

  await provider.deleteAttachment(attachment.remoteId);
}

/**
 * Sync all pending attachments
 * @param {Object[]} attachments - All attachment metadata
 * @returns {Promise<Object>} Sync result
 */
export async function syncAttachments(attachments) {
  if (!provider) {
    return { uploaded: 0, downloaded: 0, errors: [] };
  }

  const result = {
    uploaded: 0,
    downloaded: 0,
    errors: []
  };

  for (const attachment of attachments) {
    try {
      if (attachment.syncStatus === AttachmentSyncStatus.LOCAL) {
        // Need to upload
        const local = await getAttachment(attachment.id);
        if (local && local.blob) {
          await uploadAttachment(attachment, local.blob);
          result.uploaded++;
        }
      } else if (attachment.syncStatus === AttachmentSyncStatus.SYNCED && attachment.remoteId) {
        // Check if we have local copy
        const local = await getAttachment(attachment.id);
        if (!local || !local.blob) {
          await downloadAttachment(attachment);
          result.downloaded++;
        }
      }
    } catch (err) {
      result.errors.push({
        attachment: attachment.filename,
        error: err.message
      });
    }
  }

  return result;
}

/**
 * Get list of remote attachments from provider
 * @returns {Promise<Object[]>} Remote attachment list
 */
export async function listRemoteAttachments() {
  if (!provider) {
    return [];
  }

  if (!provider.listAttachments) {
    return [];
  }

  return provider.listAttachments();
}

/**
 * Reconcile local and remote attachments
 * Downloads missing attachments, uploads local-only ones
 * @param {Object[]} localAttachments - Local attachment metadata
 * @returns {Promise<Object>} Reconciliation result
 */
export async function reconcileAttachments(localAttachments) {
  if (!provider) {
    return { uploaded: 0, downloaded: 0, errors: [] };
  }

  const result = {
    uploaded: 0,
    downloaded: 0,
    errors: []
  };

  try {
    const remoteAttachments = await listRemoteAttachments();
    const remoteIds = new Set(remoteAttachments.map(a => a.id));
    const localIds = new Set(localAttachments.map(a => a.id));

    // Upload local-only attachments
    for (const attachment of localAttachments) {
      if (!attachment.remoteId && !remoteIds.has(attachment.id)) {
        try {
          const local = await getAttachment(attachment.id);
          if (local && local.blob) {
            await uploadAttachment(attachment, local.blob);
            result.uploaded++;
          }
        } catch (err) {
          result.errors.push({
            attachment: attachment.filename,
            error: err.message
          });
        }
      }
    }

    // Download remote-only attachments
    for (const remote of remoteAttachments) {
      if (!localIds.has(remote.id)) {
        try {
          await downloadAttachment(remote);
          result.downloaded++;
        } catch (err) {
          result.errors.push({
            attachment: remote.filename,
            error: err.message
          });
        }
      }
    }
  } catch (err) {
    result.errors.push({
      attachment: 'list',
      error: err.message
    });
  }

  return result;
}
