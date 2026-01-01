/**
 * Schema definitions and validation for Scribe ideas
 */

export const IDEA_TYPES = {
  media: 'media',
  project: 'project',
  note: 'note'
};

export const MEDIA_TYPES = [
  'book',
  'film',
  'show',
  'podcast',
  'music',
  'game',
  'article'
];

export const MEDIA_STATUS = [
  'queued',
  'in-progress',
  'completed',
  'abandoned'
];

export const PROJECT_STATUS = [
  'someday',
  'next',
  'active',
  'done',
  'dropped'
];

export const EFFORT_LEVELS = [
  'trivial',
  'small',
  'medium',
  'large',
  'epic'
];

export const SYNC_STATUS = [
  'local',
  'syncing',
  'synced'
];

/**
 * Generate a UUID v4
 */
export function uuid() {
  return crypto.randomUUID?.() ||
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
}

/**
 * Get current ISO timestamp
 */
export function timestamp() {
  return new Date().toISOString();
}

/**
 * Create a new media recommendation
 */
export function createMedia(data = {}) {
  const now = timestamp();
  return {
    id: uuid(),
    type: IDEA_TYPES.media,
    title: data.title || '',
    mediaType: data.mediaType || MEDIA_TYPES[0],
    recommender: data.recommender || '',
    reason: data.reason || '',
    url: data.url || '',
    status: data.status || MEDIA_STATUS[0],
    rating: data.rating || null,
    notes: data.notes || '',
    tags: data.tags || [],
    attachments: data.attachments || [],
    createdAt: data.createdAt || now,
    updatedAt: now,
    pendingSync: true
  };
}

/**
 * Create a new project idea
 */
export function createProject(data = {}) {
  const now = timestamp();
  return {
    id: uuid(),
    type: IDEA_TYPES.project,
    title: data.title || '',
    description: data.description || '',
    resources: data.resources || [],
    deadline: data.deadline || null,
    collaborators: data.collaborators || [],
    interest: data.interest || 3,
    effort: data.effort || null,
    status: data.status || PROJECT_STATUS[0],
    tags: data.tags || [],
    attachments: data.attachments || [],
    createdAt: data.createdAt || now,
    updatedAt: now,
    pendingSync: true
  };
}

/**
 * Create a new quick note
 */
export function createNote(data = {}) {
  const now = timestamp();
  return {
    id: uuid(),
    type: IDEA_TYPES.note,
    content: data.content || '',
    tags: data.tags || [],
    attachments: data.attachments || [],
    createdAt: data.createdAt || now,
    updatedAt: now,
    pendingSync: true
  };
}

/**
 * Create an attachment record
 */
export function createAttachment(file) {
  return {
    id: uuid(),
    filename: file.name,
    mimeType: file.type,
    size: file.size,
    localBlobUrl: null,
    remoteId: null,
    syncStatus: SYNC_STATUS[0]
  };
}

/**
 * Create idea by type
 */
export function createIdea(type, data = {}) {
  switch (type) {
    case IDEA_TYPES.media:
      return createMedia(data);
    case IDEA_TYPES.project:
      return createProject(data);
    case IDEA_TYPES.note:
      return createNote(data);
    default:
      throw new Error(`Unknown idea type: ${type}`);
  }
}

/**
 * Validate an idea object
 */
export function validateIdea(idea) {
  const errors = [];

  if (!idea.id) {
    errors.push('Missing id');
  }

  if (!idea.type || !Object.values(IDEA_TYPES).includes(idea.type)) {
    errors.push('Invalid type');
  }

  switch (idea.type) {
    case IDEA_TYPES.media:
      if (!idea.title?.trim()) {
        errors.push('Media title is required');
      }
      if (!MEDIA_TYPES.includes(idea.mediaType)) {
        errors.push('Invalid media type');
      }
      if (!MEDIA_STATUS.includes(idea.status)) {
        errors.push('Invalid media status');
      }
      break;

    case IDEA_TYPES.project:
      if (!idea.title?.trim()) {
        errors.push('Project title is required');
      }
      if (!PROJECT_STATUS.includes(idea.status)) {
        errors.push('Invalid project status');
      }
      if (idea.interest < 1 || idea.interest > 5) {
        errors.push('Interest must be 1-5');
      }
      break;

    case IDEA_TYPES.note:
      if (!idea.content?.trim()) {
        errors.push('Note content is required');
      }
      break;
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get display info for idea type
 */
export function getTypeInfo(type) {
  const info = {
    [IDEA_TYPES.media]: {
      icon: '🎬',
      label: 'Media',
      color: 'media'
    },
    [IDEA_TYPES.project]: {
      icon: '💡',
      label: 'Project',
      color: 'project'
    },
    [IDEA_TYPES.note]: {
      icon: '📝',
      label: 'Note',
      color: 'note'
    }
  };
  return info[type] || { icon: '❓', label: 'Unknown', color: '' };
}

/**
 * Get display title for an idea
 */
export function getIdeaTitle(idea) {
  if (idea.title) {
    return idea.title;
  }
  if (idea.content) {
    const firstLine = idea.content.split('\n')[0];
    return firstLine.length > 50 ? firstLine.slice(0, 50) + '...' : firstLine;
  }
  return 'Untitled';
}

/**
 * Format status for display
 */
export function formatStatus(status) {
  return status.replace(/-/g, ' ');
}

/**
 * Format date for display
 */
export function formatDate(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return 'Today';
  }
  if (days === 1) {
    return 'Yesterday';
  }
  if (days < 7) {
    return `${days} days ago`;
  }
  return date.toLocaleDateString();
}
