/**
 * Tests for db.js
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initDB,
  resetDB,
  getAllIdeas,
  getIdea,
  saveIdea,
  deleteIdea,
  markSynced,
  getPendingSyncIdeas,
  getAllTags,
  searchTags,
  searchIdeas,
  filterIdeas,
  getSyncMeta,
  setSyncMeta,
  exportData,
  importData,
  saveAttachment,
  getAttachment,
  deleteAttachment
} from '../js/db.js';
import { createMedia, createProject, createNote } from '../js/schemas.js';

describe('db', () => {
  beforeEach(async () => {
    // Close existing connection
    resetDB();

    // Delete the database
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase('scribe');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve(); // Proceed even if blocked
    });

    // Re-initialize
    await initDB();
  });

  afterEach(() => {
    resetDB();
  });

  describe('initDB', () => {
    it('initializes the database', async () => {
      const db = await initDB();
      expect(db).toBeDefined();
    });

    it('returns the same instance on subsequent calls', async () => {
      const db1 = await initDB();
      const db2 = await initDB();
      expect(db1).toBe(db2);
    });
  });

  describe('ideas CRUD', () => {
    it('saves and retrieves an idea', async () => {
      const media = createMedia({ title: 'Test Book' });
      await saveIdea(media);

      const retrieved = await getIdea(media.id);
      expect(retrieved).toBeDefined();
      expect(retrieved.title).toBe('Test Book');
      expect(retrieved.type).toBe('media');
    });

    it('returns all ideas sorted by updatedAt', async () => {
      const media1 = createMedia({ title: 'First' });
      const media2 = createMedia({ title: 'Second' });

      // Set explicit timestamps to ensure proper ordering
      media1.updatedAt = '2024-01-01T00:00:00.000Z';
      media2.updatedAt = '2024-01-02T00:00:00.000Z';

      await saveIdea(media1);
      await saveIdea(media2);

      const ideas = await getAllIdeas();
      expect(ideas.length).toBe(2);
      // Most recent first
      expect(ideas[0].title).toBe('Second');
      expect(ideas[1].title).toBe('First');
    });

    it('updates an existing idea', async () => {
      const media = createMedia({ title: 'Original' });
      await saveIdea(media);

      media.title = 'Updated';
      await saveIdea(media);

      const ideas = await getAllIdeas();
      expect(ideas.length).toBe(1);
      expect(ideas[0].title).toBe('Updated');
    });

    it('deletes an idea', async () => {
      const media = createMedia({ title: 'To Delete' });
      await saveIdea(media);

      await deleteIdea(media.id);

      const ideas = await getAllIdeas();
      expect(ideas.length).toBe(0);
    });

    it('returns undefined for non-existent idea', async () => {
      const idea = await getIdea('non-existent-id');
      expect(idea).toBeUndefined();
    });
  });

  describe('pendingSync', () => {
    it('marks idea as needing sync on save', async () => {
      const media = createMedia({ title: 'Test' });
      await saveIdea(media);

      // Verify the idea has pendingSync flag set
      const idea = await getIdea(media.id);
      expect(idea.pendingSync).toBe(true);
    });

    it('clears pendingSync flag when marked synced', async () => {
      const media = createMedia({ title: 'Test' });
      await saveIdea(media);

      await markSynced(media.id);

      const pending = await getPendingSyncIdeas();
      expect(pending.length).toBe(0);
    });
  });

  describe('tags', () => {
    it('tracks tags from saved ideas', async () => {
      const media = createMedia({
        title: 'Test',
        tags: ['reading', 'fiction']
      });
      await saveIdea(media);

      const tags = await getAllTags();
      expect(tags.length).toBe(2);
      expect(tags.map((t) => t.name)).toContain('reading');
      expect(tags.map((t) => t.name)).toContain('fiction');
    });

    it('increments tag count on reuse', async () => {
      const media1 = createMedia({ title: 'Test 1', tags: ['reading'] });
      const media2 = createMedia({ title: 'Test 2', tags: ['reading'] });

      await saveIdea(media1);
      await saveIdea(media2);

      const tags = await getAllTags();
      const readingTag = tags.find((t) => t.name === 'reading');
      expect(readingTag.count).toBe(2);
    });

    it('searches tags by prefix', async () => {
      const media = createMedia({
        title: 'Test',
        tags: ['reading', 'reviews', 'fiction']
      });
      await saveIdea(media);

      const results = await searchTags('re');
      expect(results.length).toBe(2);
      expect(results.map((t) => t.name)).toContain('reading');
      expect(results.map((t) => t.name)).toContain('reviews');
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await saveIdea(createMedia({
        title: 'Dune',
        recommender: 'Alice',
        tags: ['sci-fi']
      }));
      await saveIdea(createProject({
        title: 'Build Website',
        description: 'A portfolio site',
        collaborators: ['Bob']
      }));
      await saveIdea(createNote({
        content: 'Remember to call Alice',
        tags: ['reminder']
      }));
    });

    it('searches by title', async () => {
      const results = await searchIdeas('dune');
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Dune');
    });

    it('searches by recommender', async () => {
      const results = await searchIdeas('alice');
      expect(results.length).toBe(2); // Media + Note
    });

    it('searches by tag', async () => {
      const results = await searchIdeas('sci-fi');
      expect(results.length).toBe(1);
    });

    it('searches by note content', async () => {
      const results = await searchIdeas('call');
      expect(results.length).toBe(1);
      expect(results[0].type).toBe('note');
    });

    it('searches by collaborator', async () => {
      const results = await searchIdeas('bob');
      expect(results.length).toBe(1);
      expect(results[0].type).toBe('project');
    });

    it('returns empty for no match', async () => {
      const results = await searchIdeas('nonexistent');
      expect(results.length).toBe(0);
    });
  });

  describe('filter', () => {
    beforeEach(async () => {
      await saveIdea(createMedia({ title: 'Media 1', status: 'queued' }));
      await saveIdea(createMedia({ title: 'Media 2', status: 'completed', tags: ['favorite'] }));
      await saveIdea(createProject({ title: 'Project 1', status: 'active' }));
    });

    it('filters by type', async () => {
      const results = await filterIdeas({ type: 'media' });
      expect(results.length).toBe(2);
      expect(results.every((r) => r.type === 'media')).toBe(true);
    });

    it('filters by status', async () => {
      const results = await filterIdeas({ status: 'queued' });
      expect(results.length).toBe(1);
    });

    it('filters by tag', async () => {
      const results = await filterIdeas({ tag: 'favorite' });
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Media 2');
    });

    it('combines filters', async () => {
      const results = await filterIdeas({ type: 'media', status: 'completed' });
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Media 2');
    });
  });

  describe('sync metadata', () => {
    it('stores and retrieves sync metadata', async () => {
      await setSyncMeta('lastSync', '2024-01-01T00:00:00Z');
      const value = await getSyncMeta('lastSync');
      expect(value).toBe('2024-01-01T00:00:00Z');
    });

    it('returns undefined for missing key', async () => {
      const value = await getSyncMeta('nonexistent');
      expect(value).toBeUndefined();
    });
  });

  describe('attachments', () => {
    it('saves and retrieves attachment blob', async () => {
      const blob = new Blob(['test content'], { type: 'text/plain' });
      await saveAttachment('att-1', blob);

      const retrieved = await getAttachment('att-1');
      // fake-indexeddb may return the blob differently, so check it exists
      expect(retrieved).toBeDefined();
      // If it's a proper Blob, check its size
      if (retrieved instanceof Blob) {
        expect(retrieved.size).toBe(blob.size);
      }
    });

    it('deletes attachment', async () => {
      const blob = new Blob(['test'], { type: 'text/plain' });
      await saveAttachment('att-2', blob);
      await deleteAttachment('att-2');

      const retrieved = await getAttachment('att-2');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('export/import', () => {
    it('exports all data', async () => {
      await saveIdea(createMedia({ title: 'Test', tags: ['tag1'] }));

      const data = await exportData();
      expect(data.version).toBe(1);
      expect(data.exportedAt).toBeDefined();
      expect(data.ideas.length).toBe(1);
      expect(data.tags.length).toBe(1);
    });

    it('imports data', async () => {
      const exportedData = {
        version: 1,
        ideas: [
          createMedia({ title: 'Imported' }),
          createProject({ title: 'Imported Project' })
        ],
        tags: [{ name: 'imported', count: 1 }]
      };

      const result = await importData(exportedData);
      expect(result.imported).toBe(2);

      const ideas = await getAllIdeas();
      expect(ideas.length).toBe(2);
    });

    it('clears existing data on import', async () => {
      await saveIdea(createMedia({ title: 'Existing' }));

      await importData({
        ideas: [createNote({ content: 'New' })],
        tags: []
      });

      const ideas = await getAllIdeas();
      expect(ideas.length).toBe(1);
      expect(ideas[0].content).toBe('New');
    });

    it('throws on invalid import data', async () => {
      await expect(importData({})).rejects.toThrow('Invalid import data');
    });
  });
});
