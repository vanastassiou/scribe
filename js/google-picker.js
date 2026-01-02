/**
 * Google Picker API integration for folder selection
 */

import { config } from './config.js';
import { getToken } from './oauth.js';

let pickerApiLoaded = false;

/**
 * Load the Google Picker API script
 */
function loadPickerApi() {
  return new Promise((resolve, reject) => {
    if (pickerApiLoaded) {
      resolve();
      return;
    }

    // Check if already loading or loaded
    if (window.google?.picker) {
      pickerApiLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;

    script.onload = () => {
      window.gapi.load('picker', () => {
        pickerApiLoaded = true;
        resolve();
      });
    };

    script.onerror = () => {
      reject(new Error('Failed to load Google Picker API'));
    };

    document.head.appendChild(script);
  });
}

/**
 * Open the Google Drive folder picker
 * @returns {Promise<{id: string, name: string} | null>} Selected folder or null if cancelled
 */
export async function pickFolder() {
  const token = getToken('google');
  if (!token) {
    throw new Error('Not authenticated with Google');
  }

  if (!config.google.apiKey) {
    throw new Error('Google API key not configured');
  }

  await loadPickerApi();

  return new Promise((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setSelectFolderEnabled(true)
      .setIncludeFolders(true)
      .setMimeTypes('application/vnd.google-apps.folder');

    const picker = new google.picker.PickerBuilder()
      .setAppId(config.google.clientId.split('-')[0])
      .setOAuthToken(token)
      .setDeveloperKey(config.google.apiKey)
      .addView(view)
      .setTitle('Select a folder for Scribe data')
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) {
          const folder = data.docs[0];
          resolve({
            id: folder.id,
            name: folder.name
          });
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();

    picker.setVisible(true);
  });
}

/**
 * Get saved folder from settings
 * @returns {{id: string, name: string} | null}
 */
export function getSavedFolder() {
  try {
    const settings = JSON.parse(localStorage.getItem('scribe-settings') || '{}');
    if (settings.googleDriveFolder?.id) {
      return settings.googleDriveFolder;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

/**
 * Save folder to settings
 * @param {{id: string, name: string}} folder
 */
export function saveFolder(folder) {
  try {
    const settings = JSON.parse(localStorage.getItem('scribe-settings') || '{}');
    settings.googleDriveFolder = folder;
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
    delete settings.googleDriveFolder;
    localStorage.setItem('scribe-settings', JSON.stringify(settings));
  } catch {
    // Ignore errors
  }
}

/**
 * Create a new folder in Google Drive
 * @param {string} name - Folder name
 * @param {string} parentId - Parent folder ID (optional, defaults to root)
 * @returns {Promise<{id: string, name: string}>} Created folder
 */
export async function createFolder(name, parentId = null) {
  const token = getToken('google');
  if (!token) {
    throw new Error('Not authenticated with Google');
  }

  const metadata = {
    name: name,
    mimeType: 'application/vnd.google-apps.folder'
  };

  if (parentId) {
    metadata.parents = [parentId];
  }

  const response = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || 'Failed to create folder');
  }

  const result = await response.json();
  return {
    id: result.id,
    name: result.name
  };
}
