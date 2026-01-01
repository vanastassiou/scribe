/**
 * Global tag management for Scribe
 */

import { getAllTags, searchTags } from './db.js';

// Cache of all tags for quick access
let tagCache = [];
let cacheTime = 0;
const CACHE_TTL = 30000; // 30 seconds

/**
 * Refresh tag cache
 */
export async function refreshTagCache() {
  tagCache = await getAllTags();
  cacheTime = Date.now();
  return tagCache;
}

/**
 * Get all tags (from cache if fresh)
 */
export async function getTags() {
  if (Date.now() - cacheTime > CACHE_TTL) {
    await refreshTagCache();
  }
  return tagCache;
}

/**
 * Search tags with prefix matching
 */
export async function findTags(query) {
  if (!query) {
    return getTags();
  }

  // Try cache first
  if (Date.now() - cacheTime <= CACHE_TTL) {
    const lower = query.toLowerCase();
    return tagCache.filter((t) => t.name.toLowerCase().startsWith(lower));
  }

  return searchTags(query);
}

/**
 * Normalize tag name
 */
export function normalizeTag(tag) {
  return tag.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Validate tag name
 */
export function isValidTag(tag) {
  const normalized = normalizeTag(tag);
  return normalized.length > 0 && normalized.length <= 50;
}

/**
 * Parse tags from a comma-separated string
 */
export function parseTags(input) {
  return input
    .split(',')
    .map((t) => normalizeTag(t))
    .filter((t) => isValidTag(t));
}

/**
 * Format tags for display
 */
export function formatTags(tags) {
  return tags.join(', ');
}
