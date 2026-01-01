/**
 * Dropbox sync provider for Scribe
 *
 * To use this provider:
 * 1. Create a Dropbox app at https://www.dropbox.com/developers/apps
 * 2. Set App Key below
 * 3. Configure redirect URI in app settings
 */

import { getToken, startAuth, handleCallback, isAuthenticated, logout } from '../oauth.js';

// Replace with your Dropbox App Key
const APP_KEY = 'YOUR_APP_KEY';
const REDIRECT_URI = window.location.origin + '/';

const API_BASE = 'https://api.dropboxapi.com/2';
const CONTENT_BASE = 'https://content.dropboxapi.com/2';
const DATA_FILE = '/scribe-data.json';
const ATTACHMENTS_PATH = '/scribe-attachments';

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
  await startAuth('dropbox', APP_KEY, [], REDIRECT_URI);
}

/**
 * Handle OAuth callback
 */
export async function handleAuthCallback() {
  return handleCallback('dropbox', APP_KEY, REDIRECT_URI);
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
 * Fetch data from Dropbox
 */
export async function fetch() {
  try {
    const response = await contentRequest('/files/download', {
      headers: {
        'Dropbox-API-Arg': JSON.stringify({ path: DATA_FILE })
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

  await contentRequest('/files/upload', {
    headers: {
      'Dropbox-API-Arg': JSON.stringify({
        path: DATA_FILE,
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
  try {
    await apiRequest('/files/create_folder_v2', {
      body: JSON.stringify({ path: ATTACHMENTS_PATH })
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

  const path = `${ATTACHMENTS_PATH}/${attachmentId}-${filename}`;

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
        path: ATTACHMENTS_PATH,
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
  connect,
  disconnect,
  fetch,
  push,
  uploadAttachment,
  downloadAttachment,
  deleteAttachment,
  listAttachments,
  getAccountInfo
};
