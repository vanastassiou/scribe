/**
 * Idea panel component - expanded detail view
 * This module provides utility functions for rendering idea details
 */

import { MEDIA_TYPES, EFFORT_LEVELS, getTypeInfo, formatDate } from '../schemas.js';
import { getAttachment } from '../db.js';
import { formatFileSize } from './file-picker.js';

/**
 * Render media type badge
 */
export function renderMediaType(mediaType) {
  const icons = {
    book: '📚',
    film: '🎬',
    show: '📺',
    podcast: '🎙️',
    music: '🎵',
    game: '🎮',
    article: '📰'
  };
  return `<span class="tag tag--media">${icons[mediaType] || '📌'} ${mediaType}</span>`;
}

/**
 * Render effort badge
 */
export function renderEffort(effort) {
  if (!effort) return '';

  const colors = {
    trivial: '#22c55e',
    small: '#84cc16',
    medium: '#f59e0b',
    large: '#f97316',
    epic: '#ef4444'
  };

  return `<span class="tag" style="background: ${colors[effort]}20; color: ${colors[effort]}">${effort}</span>`;
}

/**
 * Render interest/rating stars
 */
export function renderStars(value, max = 5) {
  let stars = '';
  for (let i = 1; i <= max; i++) {
    stars += `<span style="color: ${i <= value ? '#f59e0b' : '#6a6a88'}">★</span>`;
  }
  return stars;
}

/**
 * Render attachment list
 */
export async function renderAttachments(attachments) {
  if (!attachments?.length) return '';

  const items = await Promise.all(attachments.map(async (att) => {
    const isImage = att.mimeType.startsWith('image/');
    let preview = '';

    if (isImage && att.localBlobUrl) {
      preview = `<img src="${att.localBlobUrl}" alt="" style="max-width: 100px; max-height: 100px; object-fit: cover; border-radius: 4px;">`;
    }

    return `
      <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--color-surface-active); border-radius: 4px;">
        ${preview || '<span style="font-size: 24px;">📎</span>'}
        <div>
          <div style="font-weight: 500;">${escapeHtml(att.filename)}</div>
          <div style="font-size: 12px; color: var(--color-text-muted);">${formatFileSize(att.size)}</div>
        </div>
      </div>
    `;
  }));

  return `
    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
      ${items.join('')}
    </div>
  `;
}

/**
 * Render a full idea detail view (for printing or export)
 */
export function renderIdeaDetail(idea) {
  const typeInfo = getTypeInfo(idea.type);

  let content = `
    <div style="padding: 16px; border: 1px solid var(--color-border); border-radius: 8px; margin-bottom: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <span style="font-size: 24px;">${typeInfo.icon}</span>
        <h3 style="margin: 0;">${escapeHtml(idea.title || idea.content?.split('\n')[0] || 'Untitled')}</h3>
      </div>
  `;

  // Type-specific content
  switch (idea.type) {
    case 'media':
      content += `
        <div style="margin-bottom: 8px;">
          ${renderMediaType(idea.mediaType)}
          <span class="status status--${idea.status}">${idea.status}</span>
        </div>
        ${idea.recommender ? `<p><strong>Recommended by:</strong> ${escapeHtml(idea.recommender)}</p>` : ''}
        ${idea.reason ? `<p><strong>Why:</strong> ${escapeHtml(idea.reason)}</p>` : ''}
        ${idea.rating ? `<p><strong>Rating:</strong> ${renderStars(idea.rating)}</p>` : ''}
        ${idea.url ? `<p><strong>Link:</strong> <a href="${escapeHtml(idea.url)}" target="_blank">${escapeHtml(idea.url)}</a></p>` : ''}
        ${idea.notes ? `<p><strong>Notes:</strong> ${escapeHtml(idea.notes)}</p>` : ''}
      `;
      break;

    case 'project':
      content += `
        <div style="margin-bottom: 8px;">
          <span class="status status--${idea.status}">${idea.status}</span>
          ${renderEffort(idea.effort)}
        </div>
        ${idea.description ? `<p>${escapeHtml(idea.description)}</p>` : ''}
        <p><strong>Interest:</strong> ${renderStars(idea.interest)}</p>
        ${idea.deadline ? `<p><strong>Deadline:</strong> ${idea.deadline}</p>` : ''}
        ${idea.resources?.length ? `<p><strong>Resources:</strong> ${idea.resources.map(escapeHtml).join(', ')}</p>` : ''}
        ${idea.collaborators?.length ? `<p><strong>Collaborators:</strong> ${idea.collaborators.map(escapeHtml).join(', ')}</p>` : ''}
      `;
      break;

    case 'note':
      content += `<p style="white-space: pre-wrap;">${escapeHtml(idea.content)}</p>`;
      break;
  }

  // Common fields
  if (idea.tags?.length) {
    content += `<p style="margin-top: 12px;">${idea.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(' ')}</p>`;
  }

  content += `
    <p style="font-size: 12px; color: var(--color-text-dim); margin-top: 12px;">
      Created ${formatDate(idea.createdAt)} · Updated ${formatDate(idea.updatedAt)}
    </p>
  `;

  content += '</div>';
  return content;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
