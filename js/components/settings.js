/**
 * Settings component
 */

import { exportData, importData } from '../db.js';
import { isAuthenticated, logout } from '../oauth.js';
import { setProvider, sync, getStatus, SyncStatus } from '../sync.js';
import googleDrive from '../providers/google-drive.js';
import dropbox from '../providers/dropbox.js';
import { sendReminder, testNotification } from '../ntfy.js';

/**
 * Create settings panel
 * @param {HTMLElement} container - Container element
 * @param {Object} options - Configuration options
 */
export function createSettings(container, options = {}) {
  const { onSyncStatusChange = () => {} } = options;

  // Get current settings from localStorage
  const settings = getSettings();

  // Check provider connection status
  const googleConnected = googleDrive.isConnected();
  const dropboxConnected = dropbox.isConnected();

  container.innerHTML = `
    <section class="settings__section">
      <h3 class="settings__section-title">Sync</h3>

      <div class="settings__item" id="google-drive-setting">
        <div>
          <div class="settings__label">Google Drive</div>
          <div class="settings__desc">Sync your ideas across devices</div>
        </div>
        <div class="settings__value">
          <span id="google-drive-status" class="${googleConnected ? 'status--connected' : ''}">
            ${googleConnected ? 'Connected' : 'Not connected'}
          </span>
          <button class="btn btn--secondary btn--small" id="google-drive-btn">
            ${googleConnected ? 'Disconnect' : 'Connect'}
          </button>
        </div>
      </div>

      <div class="settings__item" id="dropbox-setting">
        <div>
          <div class="settings__label">Dropbox</div>
          <div class="settings__desc">Alternative sync provider</div>
        </div>
        <div class="settings__value">
          <span id="dropbox-status" class="${dropboxConnected ? 'status--connected' : ''}">
            ${dropboxConnected ? 'Connected' : 'Not connected'}
          </span>
          <button class="btn btn--secondary btn--small" id="dropbox-btn">
            ${dropboxConnected ? 'Disconnect' : 'Connect'}
          </button>
        </div>
      </div>

      ${(googleConnected || dropboxConnected) ? `
        <div class="settings__item">
          <div>
            <div class="settings__label">Sync now</div>
            <div class="settings__desc">Manually trigger a sync</div>
          </div>
          <div class="settings__value">
            <button class="btn btn--primary btn--small" id="sync-now-btn">
              Sync
            </button>
          </div>
        </div>
      ` : ''}
    </section>

    <section class="settings__section">
      <h3 class="settings__section-title">Reminders</h3>

      <div class="settings__item">
        <div>
          <div class="settings__label">Push notifications (ntfy.sh)</div>
          <div class="settings__desc">Receive reminders on your phone</div>
        </div>
        <div class="settings__value">
          <input type="text" id="ntfy-topic" class="input" style="width: 140px"
            placeholder="your-topic-name" value="${escapeHtml(settings.ntfyTopic || '')}">
          <button class="btn btn--secondary btn--small" id="ntfy-test-btn" title="Send test notification">
            Test
          </button>
        </div>
      </div>

      <div class="settings__item">
        <div>
          <div class="settings__label">Reminder timing</div>
          <div class="settings__desc">When to send deadline reminders</div>
        </div>
        <div class="settings__value">
          <select id="reminder-timing" class="select" style="width: 140px">
            <option value="1" ${settings.reminderDays === 1 ? 'selected' : ''}>1 day before</option>
            <option value="3" ${settings.reminderDays === 3 ? 'selected' : ''}>3 days before</option>
            <option value="7" ${settings.reminderDays === 7 || !settings.reminderDays ? 'selected' : ''}>1 week before</option>
          </select>
        </div>
      </div>
    </section>

    <section class="settings__section">
      <h3 class="settings__section-title">Capture</h3>

      <div class="settings__item">
        <div>
          <div class="settings__label">Bookmarklet</div>
          <div class="settings__desc">Drag to bookmarks bar for quick capture</div>
        </div>
        <div class="settings__value">
          <a id="bookmarklet-link" class="btn btn--secondary btn--small" href="javascript:void(0)">
            + Scribe
          </a>
        </div>
      </div>
    </section>

    <section class="settings__section">
      <h3 class="settings__section-title">Data</h3>

      <div class="settings__item">
        <div>
          <div class="settings__label">Export data</div>
          <div class="settings__desc">Download all ideas as JSON</div>
        </div>
        <div class="settings__value">
          <button class="btn btn--secondary btn--small" id="export-btn">
            Export
          </button>
        </div>
      </div>

      <div class="settings__item">
        <div>
          <div class="settings__label">Import data</div>
          <div class="settings__desc">Restore from a backup file</div>
        </div>
        <div class="settings__value">
          <input type="file" id="import-file" accept=".json" class="sr-only">
          <button class="btn btn--secondary btn--small" id="import-btn">
            Import
          </button>
        </div>
      </div>

      <div class="settings__item">
        <div>
          <div class="settings__label">Clear all data</div>
          <div class="settings__desc">Delete all ideas (cannot be undone)</div>
        </div>
        <div class="settings__value">
          <button class="btn btn--danger btn--small" id="clear-btn">
            Clear
          </button>
        </div>
      </div>
    </section>

    <section class="settings__section">
      <h3 class="settings__section-title">About</h3>
      <p class="settings__desc">
        Scribe is an offline-first idea capture app.
        <br>
        Your data is stored locally and synced to your chosen provider.
      </p>
      <p class="settings__desc" style="margin-top: 0.5rem">
        <a href="https://github.com/user/scribe" target="_blank">Documentation</a>
      </p>
    </section>
  `;

  // Set up bookmarklet
  const bookmarkletCode = generateBookmarklet();
  const bookmarkletLink = container.querySelector('#bookmarklet-link');
  bookmarkletLink.href = bookmarkletCode;
  bookmarkletLink.addEventListener('click', (e) => {
    e.preventDefault();
    alert('Drag this button to your bookmarks bar to use it.');
  });

  // Export handler
  container.querySelector('#export-btn').addEventListener('click', async () => {
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scribe-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    }
  });

  // Import handler
  const importFile = container.querySelector('#import-file');
  container.querySelector('#import-btn').addEventListener('click', () => {
    importFile.click();
  });

  importFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const result = await importData(data);
      alert(`Imported ${result.imported} ideas successfully.`);
      window.location.reload();
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  });

  // Clear handler
  container.querySelector('#clear-btn').addEventListener('click', async () => {
    if (!confirm('Delete ALL ideas? This cannot be undone.')) return;
    if (!confirm('Are you really sure?')) return;

    try {
      indexedDB.deleteDatabase('scribe');
      localStorage.removeItem('scribe-settings');
      window.location.reload();
    } catch (err) {
      alert(`Failed to clear data: ${err.message}`);
    }
  });

  // ntfy topic handler
  container.querySelector('#ntfy-topic').addEventListener('change', (e) => {
    const topic = e.target.value.trim();
    saveSettings({ ...getSettings(), ntfyTopic: topic });
  });

  // ntfy test button
  container.querySelector('#ntfy-test-btn').addEventListener('click', async () => {
    const topic = container.querySelector('#ntfy-topic').value.trim();
    if (!topic) {
      alert('Please enter a ntfy topic first.');
      return;
    }

    try {
      await testNotification(topic);
      alert('Test notification sent! Check your ntfy app.');
    } catch (err) {
      alert(`Failed to send test: ${err.message}`);
    }
  });

  // Reminder timing handler
  container.querySelector('#reminder-timing').addEventListener('change', (e) => {
    const days = parseInt(e.target.value, 10);
    saveSettings({ ...getSettings(), reminderDays: days });
  });

  // Google Drive handler
  container.querySelector('#google-drive-btn').addEventListener('click', async () => {
    if (googleConnected) {
      googleDrive.disconnect();
      setProvider(null);
      onSyncStatusChange();
      window.location.reload();
    } else {
      // Check if OAuth is configured
      try {
        await googleDrive.connect();
      } catch (err) {
        alert(`Connection failed: ${err.message}\n\nMake sure OAuth is configured in js/providers/google-drive.js`);
      }
    }
  });

  // Dropbox handler
  container.querySelector('#dropbox-btn').addEventListener('click', async () => {
    if (dropboxConnected) {
      dropbox.disconnect();
      setProvider(null);
      onSyncStatusChange();
      window.location.reload();
    } else {
      try {
        await dropbox.connect();
      } catch (err) {
        alert(`Connection failed: ${err.message}\n\nMake sure OAuth is configured in js/providers/dropbox.js`);
      }
    }
  });

  // Sync now button
  const syncBtn = container.querySelector('#sync-now-btn');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      syncBtn.disabled = true;
      syncBtn.textContent = 'Syncing...';

      try {
        // Set active provider
        if (googleConnected) {
          setProvider(googleDrive);
        } else if (dropboxConnected) {
          setProvider(dropbox);
        }

        const result = await sync();
        if (result.success) {
          alert('Sync completed successfully.');
        } else {
          alert(`Sync failed: ${result.error}`);
        }
      } catch (err) {
        alert(`Sync failed: ${err.message}`);
      } finally {
        syncBtn.disabled = false;
        syncBtn.textContent = 'Sync';
      }
    });
  }
}

/**
 * Generate bookmarklet code
 */
function generateBookmarklet() {
  const appUrl = window.location.origin;
  const code = `
    (function() {
      var title = document.title;
      var url = window.location.href;
      var text = window.getSelection().toString();
      var scribeUrl = '${appUrl}/?capture=1' +
        '&title=' + encodeURIComponent(title) +
        '&url=' + encodeURIComponent(url) +
        '&text=' + encodeURIComponent(text);
      window.open(scribeUrl, 'scribe', 'width=500,height=600');
    })();
  `.replace(/\s+/g, ' ').trim();

  return `javascript:${encodeURIComponent(code)}`;
}

/**
 * Get settings from localStorage
 */
export function getSettings() {
  try {
    return JSON.parse(localStorage.getItem('scribe-settings') || '{}');
  } catch {
    return {};
  }
}

/**
 * Save settings to localStorage
 */
export function saveSettings(settings) {
  localStorage.setItem('scribe-settings', JSON.stringify(settings));
}

/**
 * Escape HTML
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
