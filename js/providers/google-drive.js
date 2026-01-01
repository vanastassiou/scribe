/**
 * Google Drive sync provider for Scribe
 *
 * To use this provider:
 * 1. Create a Google Cloud project
 * 2. Enable the Google Drive API
 * 3. Create OAuth 2.0 credentials
 * 4. Set CLIENT_ID below
 */

import { getToken, startAuth, handleCallback, isAuthenticated, logout } from '../oauth.js';

// Replace with your OAuth Client ID
const CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
const REDIRECT_URI = window.location.origin + '/';
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const API_BASE = 'https://www.googleapis.com';
const DATA_FILE = 'scribe-data.json';
const ATTACHMENTS_FOLDER = 'scribe-attachments';

let fileId = null;
let folderId = null;

/**
 * Check if connected to Google Drive
 */
export function isConnected() {
  return isAuthenticated('google');
}

/**
 * Start OAuth flow
 */
export async function connect() {
  await startAuth('google', CLIENT_ID, SCOPES, REDIRECT_URI);
}

/**
 * Handle OAuth callback
 */
export async function handleAuthCallback() {
  return handleCallback('google', CLIENT_ID, REDIRECT_URI);
}

/**
 * Disconnect from Google Drive
 */
export function disconnect() {
  logout('google');
  fileId = null;
  folderId = null;
}

/**
 * Make authenticated API request
 */
async function apiRequest(path, options = {}) {
  const token = getToken('google');
  if (!token) {
    throw new Error('Not authenticated with Google');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'API request failed');
  }

  return response.json();
}

/**
 * Find or create the data file
 */
async function getOrCreateDataFile() {
  if (fileId) return fileId;

  // Search for existing file
  const query = `name='${DATA_FILE}' and trashed=false`;
  const searchResult = await apiRequest(
    `/drive/v3/files?q=${encodeURIComponent(query)}&spaces=appDataFolder`
  );

  if (searchResult.files?.length > 0) {
    fileId = searchResult.files[0].id;
    return fileId;
  }

  // Create new file
  const metadata = {
    name: DATA_FILE,
    parents: ['appDataFolder'],
    mimeType: 'application/json'
  };

  const createResult = await apiRequest('/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata)
  });

  fileId = createResult.id;
  return fileId;
}

/**
 * Find or create the attachments folder
 */
async function getOrCreateAttachmentsFolder() {
  if (folderId) return folderId;

  // Search for existing folder
  const query = `name='${ATTACHMENTS_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchResult = await apiRequest(
    `/drive/v3/files?q=${encodeURIComponent(query)}`
  );

  if (searchResult.files?.length > 0) {
    folderId = searchResult.files[0].id;
    return folderId;
  }

  // Create new folder
  const metadata = {
    name: ATTACHMENTS_FOLDER,
    mimeType: 'application/vnd.google-apps.folder'
  };

  const createResult = await apiRequest('/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata)
  });

  folderId = createResult.id;
  return folderId;
}

/**
 * Fetch data from Google Drive
 */
export async function fetch() {
  const id = await getOrCreateDataFile();

  try {
    const response = await apiRequest(`/drive/v3/files/${id}?alt=media`);
    return response;
  } catch (err) {
    // File exists but is empty or invalid
    return { ideas: [], lastModified: null };
  }
}

/**
 * Push data to Google Drive
 */
export async function push(data) {
  const id = await getOrCreateDataFile();

  const metadata = {
    mimeType: 'application/json'
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([JSON.stringify(data)], { type: 'application/json' }));

  const token = getToken('google');
  const response = await window.fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=multipart`,
    {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form
    }
  );

  if (!response.ok) {
    throw new Error('Failed to upload data to Google Drive');
  }

  return true;
}

/**
 * Upload attachment to Google Drive
 * @param {string} attachmentId - Local attachment ID
 * @param {string} filename - Original filename
 * @param {Blob} blob - File data
 * @param {string} mimeType - MIME type
 * @returns {Promise<string>} Remote file ID
 */
export async function uploadAttachment(attachmentId, filename, blob, mimeType) {
  const folder = await getOrCreateAttachmentsFolder();

  const metadata = {
    name: `${attachmentId}-${filename}`,
    parents: [folder],
    mimeType: mimeType || 'application/octet-stream'
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  const token = getToken('google');
  const response = await window.fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form
    }
  );

  if (!response.ok) {
    throw new Error('Failed to upload attachment');
  }

  const result = await response.json();
  return result.id;
}

/**
 * Download attachment from Google Drive
 */
export async function downloadAttachment(remoteId) {
  const token = getToken('google');
  const response = await window.fetch(
    `https://www.googleapis.com/drive/v3/files/${remoteId}?alt=media`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );

  if (!response.ok) {
    throw new Error('Failed to download attachment');
  }

  return response.blob();
}

/**
 * Delete attachment from Google Drive
 */
export async function deleteAttachment(remoteId) {
  await apiRequest(`/drive/v3/files/${remoteId}`, {
    method: 'DELETE'
  });
}

/**
 * List all attachments in the attachments folder
 * @returns {Promise<Object[]>} Array of attachment metadata
 */
export async function listAttachments() {
  const folder = await getOrCreateAttachmentsFolder();

  const query = `'${folder}' in parents and trashed=false`;
  const result = await apiRequest(
    `/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size)`
  );

  return (result.files || []).map((file) => {
    // Parse attachment ID from filename (format: attachmentId-originalFilename)
    const dashIndex = file.name.indexOf('-');
    const id = dashIndex > 0 ? file.name.substring(0, dashIndex) : file.name;
    const filename = dashIndex > 0 ? file.name.substring(dashIndex + 1) : file.name;

    return {
      id,
      remoteId: file.id,
      filename,
      mimeType: file.mimeType,
      size: parseInt(file.size, 10)
    };
  });
}

/**
 * Provider interface for sync engine
 */
export default {
  name: 'google-drive',
  isConnected,
  connect,
  disconnect,
  fetch,
  push,
  uploadAttachment,
  downloadAttachment,
  deleteAttachment,
  listAttachments
};
