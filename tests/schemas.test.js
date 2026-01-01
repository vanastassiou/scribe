/**
 * Tests for schemas.js
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  IDEA_TYPES,
  MEDIA_TYPES,
  MEDIA_STATUS,
  PROJECT_STATUS,
  EFFORT_LEVELS,
  uuid,
  timestamp,
  createMedia,
  createProject,
  createNote,
  createAttachment,
  createIdea,
  validateIdea,
  getTypeInfo,
  getIdeaTitle,
  formatStatus,
  formatDate
} from '../js/schemas.js';

describe('schemas', () => {
  describe('constants', () => {
    it('defines idea types', () => {
      expect(IDEA_TYPES.media).toBe('media');
      expect(IDEA_TYPES.project).toBe('project');
      expect(IDEA_TYPES.note).toBe('note');
    });

    it('defines media types', () => {
      expect(MEDIA_TYPES).toContain('book');
      expect(MEDIA_TYPES).toContain('film');
      expect(MEDIA_TYPES).toContain('podcast');
      expect(MEDIA_TYPES.length).toBe(7);
    });

    it('defines media statuses', () => {
      expect(MEDIA_STATUS).toContain('queued');
      expect(MEDIA_STATUS).toContain('completed');
    });

    it('defines project statuses', () => {
      expect(PROJECT_STATUS).toContain('someday');
      expect(PROJECT_STATUS).toContain('active');
      expect(PROJECT_STATUS).toContain('done');
    });

    it('defines effort levels', () => {
      expect(EFFORT_LEVELS).toContain('trivial');
      expect(EFFORT_LEVELS).toContain('epic');
    });
  });

  describe('uuid', () => {
    it('generates a valid UUID v4', () => {
      const id = uuid();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('generates unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(uuid());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('timestamp', () => {
    it('returns an ISO timestamp', () => {
      const ts = timestamp();
      expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('returns current time', () => {
      const before = Date.now();
      const ts = timestamp();
      const after = Date.now();
      const tsTime = new Date(ts).getTime();
      expect(tsTime).toBeGreaterThanOrEqual(before);
      expect(tsTime).toBeLessThanOrEqual(after);
    });
  });

  describe('createMedia', () => {
    it('creates a media idea with defaults', () => {
      const media = createMedia();
      expect(media.type).toBe('media');
      expect(media.id).toBeDefined();
      expect(media.title).toBe('');
      expect(media.mediaType).toBe('book');
      expect(media.status).toBe('queued');
      expect(media.pendingSync).toBe(true);
      expect(media.tags).toEqual([]);
      expect(media.attachments).toEqual([]);
    });

    it('creates a media idea with provided data', () => {
      const media = createMedia({
        title: 'Dune',
        mediaType: 'book',
        recommender: 'Alice',
        reason: 'Great sci-fi',
        status: 'queued',
        rating: 5
      });
      expect(media.title).toBe('Dune');
      expect(media.recommender).toBe('Alice');
      expect(media.reason).toBe('Great sci-fi');
      expect(media.rating).toBe(5);
    });

    it('preserves tags and attachments', () => {
      const media = createMedia({
        title: 'Test',
        tags: ['sci-fi', 'classic'],
        attachments: [{ id: '123' }]
      });
      expect(media.tags).toEqual(['sci-fi', 'classic']);
      expect(media.attachments).toEqual([{ id: '123' }]);
    });
  });

  describe('createProject', () => {
    it('creates a project idea with defaults', () => {
      const project = createProject();
      expect(project.type).toBe('project');
      expect(project.id).toBeDefined();
      expect(project.title).toBe('');
      expect(project.status).toBe('someday');
      expect(project.interest).toBe(3);
      expect(project.resources).toEqual([]);
      expect(project.collaborators).toEqual([]);
    });

    it('creates a project with provided data', () => {
      const project = createProject({
        title: 'Build app',
        description: 'A new app',
        deadline: '2025-12-31',
        collaborators: ['Bob', 'Carol'],
        interest: 5,
        effort: 'large'
      });
      expect(project.title).toBe('Build app');
      expect(project.deadline).toBe('2025-12-31');
      expect(project.collaborators).toEqual(['Bob', 'Carol']);
      expect(project.interest).toBe(5);
      expect(project.effort).toBe('large');
    });
  });

  describe('createNote', () => {
    it('creates a note with defaults', () => {
      const note = createNote();
      expect(note.type).toBe('note');
      expect(note.id).toBeDefined();
      expect(note.content).toBe('');
    });

    it('creates a note with content', () => {
      const note = createNote({ content: 'Remember this' });
      expect(note.content).toBe('Remember this');
    });
  });

  describe('createAttachment', () => {
    it('creates an attachment record from a file', () => {
      const file = {
        name: 'photo.jpg',
        type: 'image/jpeg',
        size: 12345
      };
      const attachment = createAttachment(file);
      expect(attachment.id).toBeDefined();
      expect(attachment.filename).toBe('photo.jpg');
      expect(attachment.mimeType).toBe('image/jpeg');
      expect(attachment.size).toBe(12345);
      expect(attachment.syncStatus).toBe('local');
    });
  });

  describe('createIdea', () => {
    it('creates media idea', () => {
      const idea = createIdea('media', { title: 'Test' });
      expect(idea.type).toBe('media');
    });

    it('creates project idea', () => {
      const idea = createIdea('project', { title: 'Test' });
      expect(idea.type).toBe('project');
    });

    it('creates note idea', () => {
      const idea = createIdea('note', { content: 'Test' });
      expect(idea.type).toBe('note');
    });

    it('throws on unknown type', () => {
      expect(() => createIdea('unknown')).toThrow('Unknown idea type');
    });
  });

  describe('validateIdea', () => {
    it('validates a valid media idea', () => {
      const media = createMedia({ title: 'Valid Title' });
      const result = validateIdea(media);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('rejects media without title', () => {
      const media = createMedia({ title: '' });
      const result = validateIdea(media);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Media title is required');
    });

    it('rejects media with invalid mediaType', () => {
      const media = createMedia({ title: 'Test' });
      media.mediaType = 'invalid';
      const result = validateIdea(media);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid media type');
    });

    it('validates a valid project idea', () => {
      const project = createProject({ title: 'Valid Project' });
      const result = validateIdea(project);
      expect(result.valid).toBe(true);
    });

    it('rejects project with invalid interest', () => {
      const project = createProject({ title: 'Test' });
      project.interest = 10;
      const result = validateIdea(project);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Interest must be 1-5');
    });

    it('validates a valid note', () => {
      const note = createNote({ content: 'Some content' });
      const result = validateIdea(note);
      expect(result.valid).toBe(true);
    });

    it('rejects note without content', () => {
      const note = createNote({ content: '' });
      const result = validateIdea(note);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Note content is required');
    });

    it('rejects idea without id', () => {
      const idea = createMedia({ title: 'Test' });
      delete idea.id;
      const result = validateIdea(idea);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing id');
    });

    it('rejects idea with invalid type', () => {
      const idea = createMedia({ title: 'Test' });
      idea.type = 'invalid';
      const result = validateIdea(idea);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid type');
    });
  });

  describe('getTypeInfo', () => {
    it('returns info for media type', () => {
      const info = getTypeInfo('media');
      expect(info.icon).toBe('🎬');
      expect(info.label).toBe('Media');
      expect(info.color).toBe('media');
    });

    it('returns info for project type', () => {
      const info = getTypeInfo('project');
      expect(info.icon).toBe('💡');
      expect(info.label).toBe('Project');
    });

    it('returns info for note type', () => {
      const info = getTypeInfo('note');
      expect(info.icon).toBe('📝');
      expect(info.label).toBe('Note');
    });

    it('returns fallback for unknown type', () => {
      const info = getTypeInfo('unknown');
      expect(info.icon).toBe('❓');
      expect(info.label).toBe('Unknown');
    });
  });

  describe('getIdeaTitle', () => {
    it('returns title for media', () => {
      const media = createMedia({ title: 'Dune' });
      expect(getIdeaTitle(media)).toBe('Dune');
    });

    it('returns first line of content for note', () => {
      const note = createNote({ content: 'First line\nSecond line' });
      expect(getIdeaTitle(note)).toBe('First line');
    });

    it('truncates long content', () => {
      const longContent = 'A'.repeat(100);
      const note = createNote({ content: longContent });
      const title = getIdeaTitle(note);
      expect(title.length).toBe(53); // 50 chars + '...'
      expect(title.endsWith('...')).toBe(true);
    });

    it('returns Untitled for empty idea', () => {
      const note = createNote({ content: '' });
      delete note.content;
      expect(getIdeaTitle(note)).toBe('Untitled');
    });
  });

  describe('formatStatus', () => {
    it('replaces hyphens with spaces', () => {
      expect(formatStatus('in-progress')).toBe('in progress');
    });

    it('handles single word status', () => {
      expect(formatStatus('queued')).toBe('queued');
    });
  });

  describe('formatDate', () => {
    it('returns Today for current date', () => {
      const today = new Date().toISOString();
      expect(formatDate(today)).toBe('Today');
    });

    it('returns Yesterday for previous day', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      expect(formatDate(yesterday)).toBe('Yesterday');
    });

    it('returns X days ago for recent dates', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      expect(formatDate(threeDaysAgo)).toBe('3 days ago');
    });

    it('returns formatted date for older dates', () => {
      const oldDate = new Date('2020-01-15').toISOString();
      const result = formatDate(oldDate);
      // Should be a locale date string
      expect(result).toMatch(/\d/);
    });
  });
});
