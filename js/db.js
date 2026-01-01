/**
 * IndexedDB wrapper for Scribe
 * Provides offline-first storage for ideas and attachments
 */

const DB_NAME = 'scribe';
const DB_VERSION = 1;

let db = null;

/**
 * Reset database connection (for testing)
 */
export function resetDB() {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Initialize the database
 */
export async function initDB() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error(`Failed to open database: ${request.error}`));
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Ideas store
      if (!database.objectStoreNames.contains('ideas')) {
        const ideasStore = database.createObjectStore('ideas', { keyPath: 'id' });
        ideasStore.createIndex('type', 'type', { unique: false });
        ideasStore.createIndex('status', 'status', { unique: false });
        ideasStore.createIndex('createdAt', 'createdAt', { unique: false });
        ideasStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        ideasStore.createIndex('pendingSync', 'pendingSync', { unique: false });
      }

      // Attachments blob store
      if (!database.objectStoreNames.contains('attachments')) {
        database.createObjectStore('attachments', { keyPath: 'id' });
      }

      // Tags store (for autocomplete)
      if (!database.objectStoreNames.contains('tags')) {
        const tagsStore = database.createObjectStore('tags', { keyPath: 'name' });
        tagsStore.createIndex('count', 'count', { unique: false });
      }

      // Sync metadata
      if (!database.objectStoreNames.contains('sync')) {
        database.createObjectStore('sync', { keyPath: 'key' });
      }
    };
  });
}

/**
 * Get a transaction for the given stores
 */
function getTransaction(storeNames, mode = 'readonly') {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db.transaction(storeNames, mode);
}

/**
 * Wrap IDBRequest in a promise
 */
function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ==========================================================================
// Ideas CRUD
// ==========================================================================

/**
 * Get all ideas
 */
export async function getAllIdeas() {
  await initDB();
  const tx = getTransaction(['ideas']);
  const store = tx.objectStore('ideas');
  const ideas = await promisify(store.getAll());
  // Sort by updatedAt descending
  return ideas.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

/**
 * Get idea by ID
 */
export async function getIdea(id) {
  await initDB();
  const tx = getTransaction(['ideas']);
  const store = tx.objectStore('ideas');
  return promisify(store.get(id));
}

/**
 * Get ideas by type
 */
export async function getIdeasByType(type) {
  await initDB();
  const tx = getTransaction(['ideas']);
  const store = tx.objectStore('ideas');
  const index = store.index('type');
  return promisify(index.getAll(type));
}

/**
 * Get ideas pending sync
 */
export async function getPendingSyncIdeas() {
  await initDB();
  const tx = getTransaction(['ideas']);
  const store = tx.objectStore('ideas');
  const index = store.index('pendingSync');
  return promisify(index.getAll(true));
}

/**
 * Save an idea (create or update)
 */
export async function saveIdea(idea) {
  await initDB();
  const tx = getTransaction(['ideas', 'tags'], 'readwrite');
  const store = tx.objectStore('ideas');

  // Update tags count
  if (idea.tags?.length) {
    const tagsStore = tx.objectStore('tags');
    for (const tagName of idea.tags) {
      const existing = await promisify(tagsStore.get(tagName));
      if (existing) {
        existing.count++;
        await promisify(tagsStore.put(existing));
      } else {
        await promisify(tagsStore.put({ name: tagName, count: 1 }));
      }
    }
  }

  await promisify(store.put(idea));
  return idea;
}

/**
 * Delete an idea
 */
export async function deleteIdea(id) {
  await initDB();
  const tx = getTransaction(['ideas', 'attachments'], 'readwrite');
  const ideasStore = tx.objectStore('ideas');
  const attachmentsStore = tx.objectStore('attachments');

  // Get idea first to delete its attachments
  const idea = await promisify(ideasStore.get(id));
  if (idea?.attachments) {
    for (const attachment of idea.attachments) {
      await promisify(attachmentsStore.delete(attachment.id));
    }
  }

  await promisify(ideasStore.delete(id));
}

/**
 * Mark idea as synced
 */
export async function markSynced(id) {
  await initDB();
  const tx = getTransaction(['ideas'], 'readwrite');
  const store = tx.objectStore('ideas');
  const idea = await promisify(store.get(id));
  if (idea) {
    idea.pendingSync = false;
    await promisify(store.put(idea));
  }
}

/**
 * Bulk save ideas (for sync)
 */
export async function bulkSaveIdeas(ideas) {
  await initDB();
  const tx = getTransaction(['ideas'], 'readwrite');
  const store = tx.objectStore('ideas');

  for (const idea of ideas) {
    await promisify(store.put(idea));
  }
}

// ==========================================================================
// Attachments
// ==========================================================================

/**
 * Save attachment blob
 */
export async function saveAttachment(id, blob) {
  await initDB();
  const tx = getTransaction(['attachments'], 'readwrite');
  const store = tx.objectStore('attachments');
  await promisify(store.put({ id, blob }));
}

/**
 * Get attachment blob
 */
export async function getAttachment(id) {
  await initDB();
  const tx = getTransaction(['attachments']);
  const store = tx.objectStore('attachments');
  const result = await promisify(store.get(id));
  return result?.blob;
}

/**
 * Delete attachment
 */
export async function deleteAttachment(id) {
  await initDB();
  const tx = getTransaction(['attachments'], 'readwrite');
  const store = tx.objectStore('attachments');
  await promisify(store.delete(id));
}

// ==========================================================================
// Tags
// ==========================================================================

/**
 * Get all tags sorted by usage count
 */
export async function getAllTags() {
  await initDB();
  const tx = getTransaction(['tags']);
  const store = tx.objectStore('tags');
  const tags = await promisify(store.getAll());
  return tags.sort((a, b) => b.count - a.count);
}

/**
 * Search tags by prefix
 */
export async function searchTags(prefix) {
  const tags = await getAllTags();
  const lower = prefix.toLowerCase();
  return tags.filter((t) => t.name.toLowerCase().startsWith(lower));
}

// ==========================================================================
// Sync metadata
// ==========================================================================

/**
 * Get sync metadata
 */
export async function getSyncMeta(key) {
  await initDB();
  const tx = getTransaction(['sync']);
  const store = tx.objectStore('sync');
  const result = await promisify(store.get(key));
  return result?.value;
}

/**
 * Set sync metadata
 */
export async function setSyncMeta(key, value) {
  await initDB();
  const tx = getTransaction(['sync'], 'readwrite');
  const store = tx.objectStore('sync');
  await promisify(store.put({ key, value }));
}

// ==========================================================================
// Search
// ==========================================================================

/**
 * Search ideas by text query
 */
export async function searchIdeas(query) {
  const ideas = await getAllIdeas();
  const lower = query.toLowerCase();

  return ideas.filter((idea) => {
    // Search in common fields
    if (idea.tags?.some((t) => t.toLowerCase().includes(lower))) {
      return true;
    }

    // Type-specific fields
    switch (idea.type) {
      case 'media':
        return (
          idea.title?.toLowerCase().includes(lower) ||
          idea.recommender?.toLowerCase().includes(lower) ||
          idea.reason?.toLowerCase().includes(lower) ||
          idea.notes?.toLowerCase().includes(lower)
        );

      case 'project':
        return (
          idea.title?.toLowerCase().includes(lower) ||
          idea.description?.toLowerCase().includes(lower) ||
          idea.collaborators?.some((c) => c.toLowerCase().includes(lower)) ||
          idea.resources?.some((r) => r.toLowerCase().includes(lower))
        );

      case 'note':
        return idea.content?.toLowerCase().includes(lower);

      default:
        return false;
    }
  });
}

/**
 * Filter ideas
 */
export async function filterIdeas({ type, status, tag } = {}) {
  let ideas = await getAllIdeas();

  if (type) {
    ideas = ideas.filter((i) => i.type === type);
  }

  if (status) {
    ideas = ideas.filter((i) => i.status === status);
  }

  if (tag) {
    ideas = ideas.filter((i) => i.tags?.includes(tag));
  }

  return ideas;
}

// ==========================================================================
// Export/Import
// ==========================================================================

/**
 * Export all data as JSON
 */
export async function exportData() {
  const ideas = await getAllIdeas();
  const tags = await getAllTags();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    ideas,
    tags
  };
}

/**
 * Import data from JSON
 */
export async function importData(data) {
  if (!data.ideas) {
    throw new Error('Invalid import data: missing ideas');
  }

  await initDB();
  const tx = getTransaction(['ideas', 'tags'], 'readwrite');
  const ideasStore = tx.objectStore('ideas');
  const tagsStore = tx.objectStore('tags');

  // Clear existing data
  await promisify(ideasStore.clear());
  await promisify(tagsStore.clear());

  // Import ideas
  for (const idea of data.ideas) {
    await promisify(ideasStore.put(idea));
  }

  // Import tags
  if (data.tags) {
    for (const tag of data.tags) {
      await promisify(tagsStore.put(tag));
    }
  }

  return { imported: data.ideas.length };
}
