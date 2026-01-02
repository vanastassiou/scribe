/**
 * Dropbox sync provider for Scribe
 *
 * Configure credentials in js/config.js
 */

import { getToken, startAuth, handleCallback, isAuthenticated, logout } from '../oauth.js';
import { config } from '../config.js';

const API_BASE = 'https://api.dropboxapi.com/2';
const CONTENT_BASE = 'https://content.dropboxapi.com/2';
const DATA_FILENAME = 'scribe-data.json';
const ATTACHMENTS_DIRNAME = 'scribe-attachments';

/**
 * Get saved folder from settings
 * @returns {{name: string} | null}
 */
export function getSavedFolder() {
  try {
    const settings = JSON.parse(localStorage.getItem('scribe-settings') || '{}');
    if (settings.dropboxFolder?.name) {
      return settings.dropboxFolder;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

/**
 * Save folder to settings
 * @param {{name: string}} folder
 */
export function saveFolder(folder) {
  try {
    const settings = JSON.parse(localStorage.getItem('scribe-settings') || '{}');
    settings.dropboxFolder = folder;
    localStorage.setItem('scribe-settings', JSON.stringify(settings));
  } catch {
    // Ignore errors
  }
}

/**
 * Clear saved folder
 */
export function clearFolder() {
  try {
    const settings = JSON.parse(localStorage.getItem('scribe-settings') || '{}');
    delete settings.dropboxFolder;
    localStorage.setItem('scribe-settings', JSON.stringify(settings));
  } catch {
    // Ignore errors
  }
}

/**
 * Get the base path for Dropbox files
 */
function getBasePath() {
  const folder = getSavedFolder();
  return folder ? `/${folder.name}` : '';
}

/**
 * Get the data file path
 */
function getDataFilePath() {
  const base = getBasePath();
  return base ? `${base}/${DATA_FILENAME}` : `/${DATA_FILENAME}`;
}

/**
 * Get the attachments folder path
 */
function getAttachmentsPath() {
  const base = getBasePath();
  return base ? `${base}/${ATTACHMENTS_DIRNAME}` : `/${ATTACHMENTS_DIRNAME}`;
}

/**
 * Check if connected to Dropbox
 */
export function isConnected() {
  return isAuthenticated('dropbox');
}

/**
 * Start OAuth flow
 */
export async function connect() {
  await startAuth('dropbox', config.dropbox.appKey, [], config.redirectUri);
}

/**
 * Handle OAuth callback
 */
export async function handleAuthCallback() {
  return handleCallback('dropbox', config.dropbox.appKey, config.redirectUri);
}

/**
 * Disconnect from Dropbox
 */
export function disconnect() {
  logout('dropbox');
}

/**
 * Make authenticated API request
 */
async function apiRequest(path, options = {}) {
  const token = getToken('dropbox');
  if (!token) {
    throw new Error('Not authenticated with Dropbox');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_summary || 'API request failed');
  }

  // Some endpoints return empty response
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Make content API request
 */
async function contentRequest(path, options = {}) {
  const token = getToken('dropbox');
  if (!token) {
    throw new Error('Not authenticated with Dropbox');
  }

  const response = await fetch(`${CONTENT_BASE}${path}`, {
    method: 'POST',
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });

  if (!response.ok) {
    // Try to parse error from header
    const errorHeader = response.headers.get('dropbox-api-result');
    if (errorHeader) {
      const error = JSON.parse(errorHeader);
      throw new Error(error.error_summary || 'Content request failed');
    }
    throw new Error('Content request failed');
  }

  return response;
}

/**
 * Check if a folder is configured for sync
 */
export function isFolderConfigured() {
  // Dropbox works without a subfolder, so always return true if connected
  return true;
}

/**
 * Create a folder in Dropbox
 * @param {string} name - Folder name
 * @returns {Promise<{name: string}>}
 */
export async function createFolder(name) {
  try {
    await apiRequest('/files/create_folder_v2', {
      body: JSON.stringify({ path: `/${name}` })
    });
  } catch (err) {
    // Folder already exists is OK
    if (!err.message.includes('conflict')) {
      throw err;
    }
  }
  return { name };
}

/**
 * Fetch data from Dropbox
 */
export async function fetch() {
  try {
    const response = await contentRequest('/files/download', {
      headers: {
        'Dropbox-API-Arg': JSON.stringify({ path: getDataFilePath() })
      }
    });

    return response.json();
  } catch (err) {
    // File doesn't exist yet
    if (err.message.includes('not_found')) {
      return { ideas: [], lastModified: null };
    }
    throw err;
  }
}

/**
 * Push data to Dropbox
 */
export async function push(data) {
  const content = JSON.stringify(data, null, 2);

  // Ensure folder exists if configured
  const folder = getSavedFolder();
  if (folder) {
    await createFolder(folder.name);
  }

  await contentRequest('/files/upload', {
    headers: {
      'Dropbox-API-Arg': JSON.stringify({
        path: getDataFilePath(),
        mode: 'overwrite'
      }),
      'Content-Type': 'application/octet-stream'
    },
    body: content
  });

  return true;
}

/**
 * Ensure attachments folder exists
 */
async function ensureAttachmentsFolder() {
  // Also ensure parent folder exists if configured
  const folder = getSavedFolder();
  if (folder) {
    await createFolder(folder.name);
  }

  try {
    await apiRequest('/files/create_folder_v2', {
      body: JSON.stringify({ path: getAttachmentsPath() })
    });
  } catch (err) {
    // Folder already exists
    if (!err.message.includes('conflict')) {
      throw err;
    }
  }
}

/**
 * Upload attachment to Dropbox
 * @param {string} attachmentId - Local attachment ID
 * @param {string} filename - Original filename
 * @param {Blob} blob - File data
 * @param {string} mimeType - MIME type (unused but kept for interface compatibility)
 * @returns {Promise<string>} Remote path
 */
export async function uploadAttachment(attachmentId, filename, blob, mimeType) {
  await ensureAttachmentsFolder();

  const path = `${getAttachmentsPath()}/${attachmentId}-${filename}`;

  const result = await contentRequest('/files/upload', {
    headers: {
      'Dropbox-API-Arg': JSON.stringify({
        path,
        mode: 'overwrite'
      }),
      'Content-Type': 'application/octet-stream'
    },
    body: blob
  });

  const metadata = await result.json();
  // Return the path as the remote ID for Dropbox
  return metadata.path_lower || path;
}

/**
 * Download attachment from Dropbox
 */
export async function downloadAttachment(path) {
  const response = await contentRequest('/files/download', {
    headers: {
      'Dropbox-API-Arg': JSON.stringify({ path })
    }
  });

  return response.blob();
}

/**
 * Delete attachment from Dropbox
 */
export async function deleteAttachment(path) {
  await apiRequest('/files/delete_v2', {
    body: JSON.stringify({ path })
  });
}

/**
 * Get account info
 */
export async function getAccountInfo() {
  return apiRequest('/users/get_current_account', {
    body: 'null'
  });
}

/**
 * List all attachments in the attachments folder
 * @returns {Promise<Object[]>} Array of attachment metadata
 */
export async function listAttachments() {
  try {
    const result = await apiRequest('/files/list_folder', {
      body: JSON.stringify({
        path: getAttachmentsPath(),
        recursive: false
      })
    });

    return (result.entries || [])
      .filter((entry) => entry['.tag'] === 'file')
      .map((file) => {
        // Parse attachment ID from filename (format: attachmentId-originalFilename)
        const name = file.name;
        const dashIndex = name.indexOf('-');
        const id = dashIndex > 0 ? name.substring(0, dashIndex) : name;
        const filename = dashIndex > 0 ? name.substring(dashIndex + 1) : name;

        return {
          id,
          remoteId: file.path_lower,
          filename,
          size: file.size
        };
      });
  } catch (err) {
    // Folder doesn't exist yet
    if (err.message.includes('not_found')) {
      return [];
    }
    throw err;
  }
}

/**
 * Provider interface for sync engine
 */
export default {
  name: 'dropbox',
  isConnected,
  isFolderConfigured,
  connect,
  disconnect,
  handleAuthCallback,
  fetch,
  push,
  uploadAttachment,
  downloadAttachment,
  deleteAttachment,
  listAttachments,
  getAccountInfo,
  getSavedFolder,
  saveFolder,
  clearFolder,
  createFolder
};
