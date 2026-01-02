/**
 * Scribe - Idea capture SPA
 * Main application entry point
 */

import { initDB, getAllIdeas, saveIdea, deleteIdea, searchIdeas, filterIdeas } from './db.js';
import { IDEA_TYPES } from './schemas.js';
import { refreshTagCache } from './tags.js';
import { createIdeaList } from './components/idea-list.js';
import { createIdeaForm } from './components/idea-form.js';
import { createSettings, getSettings } from './components/settings.js';
import { scheduleReminderCheck } from './ntfy.js';
import googleDrive from './providers/google-drive.js';
import dropbox from './providers/dropbox.js';
import { createFolder as createGoogleFolder, saveFolder as saveGoogleFolder, getSavedFolder as getGoogleFolder } from './google-picker.js';

// ==========================================================================
// App state
// ==========================================================================

let ideaList = null;
let currentFilter = { type: '', status: '', tag: '' };
let searchQuery = '';

// ==========================================================================
// Theme
// ==========================================================================

function initTheme() {
  const saved = localStorage.getItem('scribe-theme');
  if (saved) {
    document.documentElement.dataset.theme = saved;
  }
  // Default is dark (no data-theme attribute)
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme;
  const next = current === 'light' ? 'dark' : 'light';
  if (next === 'dark') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = next;
  }
  localStorage.setItem('scribe-theme', next);
}

// Initialize theme immediately to prevent flash
initTheme();

// ==========================================================================
// Sync status
// ==========================================================================

function updateSyncStatus() {
  const connected = googleDrive.isConnected() || dropbox.isConnected();
  elements.syncBtn.classList.toggle('disconnected', !connected);
}

// ==========================================================================
// DOM Elements
// ==========================================================================

const elements = {
  syncBtn: document.getElementById('btn-sync'),
  offlineIndicator: document.getElementById('offline-indicator'),
  ideaListContainer: document.getElementById('idea-list'),
  emptyState: document.getElementById('empty-state'),
  filterType: document.getElementById('filter-type'),
  filterStatus: document.getElementById('filter-status'),
  filterTags: document.getElementById('filter-tags'),
  searchInput: document.getElementById('search'),
  themeBtn: document.getElementById('btn-theme'),
  settingsBtn: document.getElementById('btn-settings'),
  ideaFormModal: document.getElementById('idea-form-modal'),
  settingsModal: document.getElementById('settings-modal'),
  formTitle: document.getElementById('form-title'),
  ideaForm: document.getElementById('idea-form')
};

// ==========================================================================
// Initialization
// ==========================================================================

async function init() {
  // Handle OAuth callback if present
  await handleOAuthCallback();

  // Initialize database
  await initDB();

  // Refresh tag cache
  await refreshTagCache();

  // Initialize idea list component
  ideaList = createIdeaList(elements.ideaListContainer, {
    onSave: handleSaveIdea,
    onDelete: handleDeleteIdea
  });

  // Load ideas
  await loadIdeas();

  // Initialize settings
  createSettings(document.getElementById('settings-content'), {
    onSyncConnect: handleSyncConnect,
    onSyncDisconnect: handleSyncDisconnect
  });

  // Update sync button status
  updateSyncStatus();

  // Register service worker
  registerServiceWorker();

  // Setup event listeners
  setupEventListeners();

  // Setup online/offline detection
  setupOnlineStatus();

  // Handle keyboard shortcuts
  setupKeyboardShortcuts();

  // Check for shared content or bookmarklet capture
  checkSharedContent();
  checkBookmarkletCapture();

  // Schedule deadline reminders
  scheduleReminderCheck(getAllIdeas, getSettings);
}

// ==========================================================================
// Data loading
// ==========================================================================

async function loadIdeas() {
  let ideas;

  if (searchQuery) {
    ideas = await searchIdeas(searchQuery);
  } else if (currentFilter.type || currentFilter.status || currentFilter.tag) {
    ideas = await filterIdeas(currentFilter);
  } else {
    ideas = await getAllIdeas();
  }

  ideaList.setIdeas(ideas);
  updateStatusOptions();
}

function updateStatusOptions() {
  const type = currentFilter.type;
  const select = elements.filterStatus;
  const currentValue = select.value;

  // Clear options except first
  while (select.options.length > 1) {
    select.remove(1);
  }

  // Add type-specific statuses
  let statuses = [];
  if (type === 'media') {
    statuses = ['queued', 'in-progress', 'completed', 'abandoned'];
  } else if (type === 'project') {
    statuses = ['someday', 'next', 'active', 'done', 'dropped'];
  }

  statuses.forEach((s) => {
    const option = document.createElement('option');
    option.value = s;
    option.textContent = s.charAt(0).toUpperCase() + s.slice(1).replace('-', ' ');
    select.appendChild(option);
  });

  // Restore value if still valid
  if (statuses.includes(currentValue)) {
    select.value = currentValue;
  }
}

// ==========================================================================
// Event handlers
// ==========================================================================

function setupEventListeners() {
  // Type buttons for new idea
  document.querySelectorAll('.type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      openNewIdeaForm(type);
    });
  });

  // Settings button
  elements.settingsBtn.addEventListener('click', () => {
    elements.settingsModal.showModal();
  });

  // Theme toggle
  elements.themeBtn.addEventListener('click', toggleTheme);

  // Sync button - opens settings
  elements.syncBtn.addEventListener('click', () => {
    elements.settingsModal.showModal();
  });

  // Modal close on backdrop click
  [elements.ideaFormModal, elements.settingsModal].forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.close();
      }
    });
  });

  // Filter type change
  elements.filterType.addEventListener('change', (e) => {
    currentFilter.type = e.target.value;
    currentFilter.status = ''; // Reset status when type changes
    elements.filterStatus.value = '';
    loadIdeas();
  });

  // Filter status change
  elements.filterStatus.addEventListener('change', (e) => {
    currentFilter.status = e.target.value;
    loadIdeas();
  });

  // Filter tags (debounced)
  let tagTimeout;
  elements.filterTags.addEventListener('input', (e) => {
    clearTimeout(tagTimeout);
    tagTimeout = setTimeout(() => {
      currentFilter.tag = e.target.value.trim();
      loadIdeas();
    }, 300);
  });

  // Search (debounced)
  let searchTimeout;
  elements.searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchQuery = e.target.value.trim();
      loadIdeas();
    }, 300);
  });
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ignore if in input
    if (e.target.matches('input, textarea, select')) return;

    // Ignore if modal is open
    if (document.querySelector('dialog[open]')) return;

    switch (e.key) {
      case 'n':
        e.preventDefault();
        openNewIdeaForm('note');
        break;

      case '/':
        e.preventDefault();
        elements.searchInput.focus();
        break;

      case 'Escape':
        elements.searchInput.blur();
        ideaList.collapseAll();
        break;

      case 'j':
        // Navigate to next item
        e.preventDefault();
        ideaList.selectNext();
        break;

      case 'k':
        // Navigate to previous item
        e.preventDefault();
        ideaList.selectPrevious();
        break;

      case 'e':
        // Expand/collapse selected item
        e.preventDefault();
        ideaList.toggleSelected();
        break;
    }
  });
}

// ==========================================================================
// Modal handlers
// ==========================================================================

function openNewIdeaForm(type) {
  elements.formTitle.textContent = `New ${type}`;
  elements.ideaFormModal.showModal();

  createIdeaForm(elements.ideaForm, type, null, {
    onSave: async (idea) => {
      await handleSaveIdea(idea);
      elements.ideaFormModal.close();
    },
    onCancel: () => {
      elements.ideaFormModal.close();
    }
  });
}

// ==========================================================================
// CRUD handlers
// ==========================================================================

async function handleSaveIdea(idea) {
  await saveIdea(idea);
  await refreshTagCache();
  await loadIdeas();
}

async function handleDeleteIdea(idea) {
  await deleteIdea(idea.id);
  await loadIdeas();
}

// ==========================================================================
// Sync handlers
// ==========================================================================

function handleSyncConnect(provider) {
  console.log(`Connecting to ${provider}...`);
  // OAuth flow would be triggered here
}

function handleSyncDisconnect(provider) {
  console.log(`Disconnecting from ${provider}...`);
}

// ==========================================================================
// OAuth callback
// ==========================================================================

/**
 * Handle OAuth callback from Google or Dropbox
 * Checks URL for authorization code and exchanges it for a token
 */
async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');

  if (!code || !state) {
    return; // Not an OAuth callback
  }

  // Determine which provider based on saved state (stored in localStorage)
  const googleState = localStorage.getItem('oauth-google');
  const dropboxState = localStorage.getItem('oauth-dropbox');

  // Debug logging
  console.log('OAuth callback - URL state:', state);
  console.log('OAuth callback - stored google state:', googleState);
  console.log('OAuth callback - stored dropbox state:', dropboxState);

  try {
    let matched = false;

    if (googleState) {
      const parsed = JSON.parse(googleState);
      console.log('Parsed google state:', parsed.state);
      if (parsed.state === state) {
        await googleDrive.handleAuthCallback();
        console.log('Google Drive connected successfully');

        // Auto-create Scribe folder if not already configured
        if (!getGoogleFolder()) {
          try {
            const folder = await createGoogleFolder('Scribe');
            saveGoogleFolder(folder);
            console.log('Created Google Drive Scribe folder:', folder.id);
          } catch (err) {
            console.error('Failed to create Google Drive Scribe folder:', err);
            // Continue anyway - user can set folder manually in settings
          }
        }

        matched = true;
      }
    }

    if (!matched && dropboxState) {
      const parsed = JSON.parse(dropboxState);
      console.log('Parsed dropbox state:', parsed.state);
      if (parsed.state === state) {
        await dropbox.handleAuthCallback();
        console.log('Dropbox connected successfully');

        // Auto-create Scribe folder if not already configured
        if (!dropbox.getSavedFolder()) {
          try {
            const folder = await dropbox.createFolder('Scribe');
            dropbox.saveFolder(folder);
            console.log('Created Dropbox Scribe folder:', folder.name);
          } catch (err) {
            console.error('Failed to create Dropbox Scribe folder:', err);
            // Continue anyway - user can set folder manually in settings
          }
        }

        matched = true;
      }
    }

    if (!matched) {
      console.error('Unknown OAuth state - no matching provider found');
      alert('Authentication failed: session expired. Please try again.');
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    // Clear URL parameters and reload to show connected state
    window.history.replaceState({}, '', window.location.pathname);
    window.location.reload();
  } catch (err) {
    console.error('OAuth callback failed:', err);
    alert(`Connection failed: ${err.message}`);
    window.history.replaceState({}, '', window.location.pathname);
  }
}

// ==========================================================================
// Online/offline status
// ==========================================================================

function setupOnlineStatus() {
  function updateStatus() {
    const online = navigator.onLine;
    elements.offlineIndicator.classList.toggle('hidden', online);
  }

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus();
}

// ==========================================================================
// Service worker
// ==========================================================================

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.log('Service Worker not supported');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registered:', registration.scope);

    // Listen for messages from SW
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data.type === 'share-target') {
        handleSharedContent(e.data.data);
      } else if (e.data.type === 'trigger-sync') {
        // Trigger sync when coming back online
        console.log('Sync triggered by service worker');
      }
    });
  } catch (err) {
    console.error('Service Worker registration failed:', err);
  }
}

// ==========================================================================
// Share target
// ==========================================================================

function checkSharedContent() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('shared')) {
    // Clear the URL
    window.history.replaceState({}, '', window.location.pathname);
    // Content will come through SW message
  }
}

/**
 * Handle bookmarklet capture
 * URL format: ?capture=1&title=...&url=...&text=...
 */
function checkBookmarkletCapture() {
  const params = new URLSearchParams(window.location.search);
  if (!params.get('capture')) {
    return;
  }

  const title = params.get('title') || '';
  const url = params.get('url') || '';
  const text = params.get('text') || '';

  // Clear the URL
  window.history.replaceState({}, '', window.location.pathname);

  // Pre-fill a media recommendation (most common use case for bookmarklet)
  const prefill = {
    title: title,
    url: url,
    notes: text
  };

  elements.formTitle.textContent = 'New media (captured)';
  elements.ideaFormModal.showModal();

  createIdeaForm(elements.ideaForm, IDEA_TYPES.media, prefill, {
    onSave: async (idea) => {
      await handleSaveIdea(idea);
      elements.ideaFormModal.close();
      // Close window if opened by bookmarklet
      if (window.opener) {
        window.close();
      }
    },
    onCancel: () => {
      elements.ideaFormModal.close();
      if (window.opener) {
        window.close();
      }
    }
  });
}

function handleSharedContent(data) {
  console.log('Received shared content:', data);

  // Determine best idea type based on content
  let type = IDEA_TYPES.note;
  if (data.url) {
    type = IDEA_TYPES.media; // URLs are likely media recommendations
  }

  // Pre-fill the form
  elements.formTitle.textContent = `New ${type} (shared)`;
  elements.ideaFormModal.showModal();

  const prefill = {};
  if (type === IDEA_TYPES.media) {
    prefill.title = data.title || '';
    prefill.url = data.url || '';
    prefill.notes = data.text || '';
  } else {
    prefill.content = [data.title, data.text, data.url].filter(Boolean).join('\n\n');
  }

  createIdeaForm(elements.ideaForm, type, prefill, {
    onSave: async (idea) => {
      await handleSaveIdea(idea);
      elements.ideaFormModal.close();
    },
    onCancel: () => {
      elements.ideaFormModal.close();
    }
  });
}

// ==========================================================================
// Start
// ==========================================================================

init().catch((err) => {
  console.error('Failed to initialize app:', err);
});
