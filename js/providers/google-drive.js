/**
 * Google Drive sync provider for Scribe
 *
 * Configure credentials in js/config.js
 */

import { getToken, startAuth, handleCallback, isAuthenticated, logout } from '../oauth.js';
import { config } from '../config.js';
import { getSavedFolder } from '../google-picker.js';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file'
];

const API_BASE = 'https://www.googleapis.com';
const DATA_FILE = 'scribe-data.json';
const ATTACHMENTS_FOLDER = 'scribe-attachments';

let fileId = null;
let attachmentsFolderId = null;

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
  await startAuth('google', config.google.clientId, SCOPES, config.redirectUri);
}

/**
 * Handle OAuth callback
 */
export async function handleAuthCallback() {
  return handleCallback('google', config.google.clientId, config.redirectUri, config.google.clientSecret);
}

/**
 * Disconnect from Google Drive
 */
export function disconnect() {
  logout('google');
  fileId = null;
  attachmentsFolderId = null;
}

/**
 * Check if a folder is configured for sync
 */
export function isFolderConfigured() {
  return getSavedFolder() !== null;
}

/**
 * Make authenticated API request
 */
async function apiRequest(path, options = {}) {
  const token = getToken('google');
  if (!token) {
    throw new Error('Not authenticated with Google');
  }

  const response = await window.fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || 'API request failed');
  }

  // Handle empty responses
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Find or create the data file in the selected folder
 */
async function getOrCreateDataFile() {
  if (fileId) return fileId;

  const folder = getSavedFolder();
  if (!folder) {
    throw new Error('No folder selected. Please select a folder in Settings.');
  }

  // Search for existing file in the selected folder
  const query = `name='${DATA_FILE}' and '${folder.id}' in parents and trashed=false`;
  const searchResult = await apiRequest(
    `/drive/v3/files?q=${encodeURIComponent(query)}`
  );

  if (searchResult?.files?.length > 0) {
    fileId = searchResult.files[0].id;
    return fileId;
  }

  // Create new file in the selected folder
  const metadata = {
    name: DATA_FILE,
    parents: [folder.id],
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
 * Find or create the attachments folder inside the selected folder
 */
async function getOrCreateAttachmentsFolder() {
  if (attachmentsFolderId) return attachmentsFolderId;

  const folder = getSavedFolder();
  if (!folder) {
    throw new Error('No folder selected. Please select a folder in Settings.');
  }

  // Search for existing attachments folder inside selected folder
  const query = `name='${ATTACHMENTS_FOLDER}' and '${folder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchResult = await apiRequest(
    `/drive/v3/files?q=${encodeURIComponent(query)}`
  );

  if (searchResult?.files?.length > 0) {
    attachmentsFolderId = searchResult.files[0].id;
    return attachmentsFolderId;
  }

  // Create new attachments folder inside selected folder
  const metadata = {
    name: ATTACHMENTS_FOLDER,
    parents: [folder.id],
    mimeType: 'application/vnd.google-apps.folder'
  };

  const createResult = await apiRequest('/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata)
  });

  attachmentsFolderId = createResult.id;
  return attachmentsFolderId;
}

/**
 * Fetch data from Google Drive
 */
export async function fetch() {
  const id = await getOrCreateDataFile();

  try {
    const response = await apiRequest(`/drive/v3/files/${id}?alt=media`);
    // Ensure we return a valid object with ideas array
    if (!response || typeof response !== 'object') {
      return { ideas: [], lastModified: null };
    }
    return {
      ideas: Array.isArray(response.ideas) ? response.ideas : [],
      lastModified: response.lastModified || null
    };
  } catch (err) {
    // File exists but is empty or invalid
    return { ideas: [], lastModified: null };
  }
}

/**
 * Sanitize idea for JSON serialization (remove non-serializable data)
 */
function sanitizeIdea(idea) {
  return {
    id: idea.id,
    type: idea.type,
    title: idea.title,
    content: idea.content,
    mediaType: idea.mediaType,
    recommender: idea.recommender,
    reason: idea.reason,
    url: idea.url,
    status: idea.status,
    rating: idea.rating,
    notes: idea.notes,
    description: idea.description,
    resources: idea.resources,
    deadline: idea.deadline,
    collaborators: idea.collaborators,
    interest: idea.interest,
    effort: idea.effort,
    tags: idea.tags || [],
    attachments: (idea.attachments || []).map((att) => ({
      id: att.id,
      filename: att.filename,
      mimeType: att.mimeType,
      size: att.size,
      remoteId: att.remoteId,
      syncStatus: att.syncStatus
    })),
    createdAt: idea.createdAt,
    updatedAt: idea.updatedAt,
    pendingSync: idea.pendingSync
  };
}

/**
 * Push data to Google Drive
 */
export async function push(data) {
  const id = await getOrCreateDataFile();

  // Sanitize ideas to ensure they're serializable
  const sanitizedData = {
    ideas: (data.ideas || []).map(sanitizeIdea),
    lastModified: data.lastModified
  };

  const metadata = {
    mimeType: 'application/json'
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([JSON.stringify(sanitizedData)], { type: 'application/json' }));

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
  isFolderConfigured,
  connect,
  disconnect,
  handleAuthCallback,
  fetch,
  push,
  uploadAttachment,
  downloadAttachment,
  deleteAttachment,
  listAttachments
};
