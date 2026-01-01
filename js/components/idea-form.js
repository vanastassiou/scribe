/**
 * Idea form component - generates forms for each idea type
 */

import {
  IDEA_TYPES, MEDIA_TYPES, MEDIA_STATUS, PROJECT_STATUS, EFFORT_LEVELS,
  createIdea, validateIdea, timestamp
} from '../schemas.js';
import { createTagInput } from './tag-input.js';
import { createFilePicker } from './file-picker.js';

/**
 * Generate form HTML for an idea type
 */
function getFormFields(type, idea = null) {
  const common = `
    <div class="form-group" id="tags-container">
      <!-- Tag input injected here -->
    </div>
    <div class="form-group" id="files-container">
      <label class="label">Attachments</label>
      <!-- File picker injected here -->
    </div>
  `;

  switch (type) {
    case IDEA_TYPES.media:
      return `
        <div class="form-group">
          <label class="label" for="title">Title *</label>
          <input type="text" id="title" name="title" class="input" required
            value="${escapeHtml(idea?.title || '')}"
            placeholder="What was recommended?">
        </div>

        <div class="form-row form-row--2">
          <div class="form-group">
            <label class="label" for="mediaType">Type *</label>
            <select id="mediaType" name="mediaType" class="select" required>
              ${MEDIA_TYPES.map((t) => `
                <option value="${t}" ${idea?.mediaType === t ? 'selected' : ''}>
                  ${capitalize(t)}
                </option>
              `).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="label" for="status">Status *</label>
            <select id="status" name="status" class="select" required>
              ${MEDIA_STATUS.map((s) => `
                <option value="${s}" ${idea?.status === s ? 'selected' : ''}>
                  ${capitalize(s.replace('-', ' '))}
                </option>
              `).join('')}
            </select>
          </div>
        </div>

        <div class="form-row form-row--2">
          <div class="form-group">
            <label class="label" for="recommender">Recommended by</label>
            <input type="text" id="recommender" name="recommender" class="input"
              value="${escapeHtml(idea?.recommender || '')}"
              placeholder="Who suggested it?">
          </div>
          <div class="form-group">
            <label class="label" for="rating">Rating</label>
            <div class="rating" id="rating-stars">
              ${[1, 2, 3, 4, 5].map((n) => `
                <button type="button" class="rating__star ${(idea?.rating || 0) >= n ? 'rating__star--active' : ''}"
                  data-value="${n}" aria-label="${n} stars">★</button>
              `).join('')}
            </div>
            <input type="hidden" id="rating" name="rating" value="${idea?.rating || ''}">
          </div>
        </div>

        <div class="form-group">
          <label class="label" for="reason">Why recommended</label>
          <textarea id="reason" name="reason" class="textarea" rows="2"
            placeholder="What makes it worth checking out?">${escapeHtml(idea?.reason || '')}</textarea>
        </div>

        <div class="form-group">
          <label class="label" for="url">Link</label>
          <input type="url" id="url" name="url" class="input"
            value="${escapeHtml(idea?.url || '')}"
            placeholder="https://...">
        </div>

        <div class="form-group">
          <label class="label" for="notes">Notes</label>
          <textarea id="notes" name="notes" class="textarea" rows="3"
            placeholder="Your thoughts...">${escapeHtml(idea?.notes || '')}</textarea>
        </div>

        ${common}
      `;

    case IDEA_TYPES.project:
      return `
        <div class="form-group">
          <label class="label" for="title">Title *</label>
          <input type="text" id="title" name="title" class="input" required
            value="${escapeHtml(idea?.title || '')}"
            placeholder="What's the idea?">
        </div>

        <div class="form-group">
          <label class="label" for="description">Description</label>
          <textarea id="description" name="description" class="textarea" rows="3"
            placeholder="Describe the idea in more detail...">${escapeHtml(idea?.description || '')}</textarea>
        </div>

        <div class="form-row form-row--2">
          <div class="form-group">
            <label class="label" for="status">Status *</label>
            <select id="status" name="status" class="select" required>
              ${PROJECT_STATUS.map((s) => `
                <option value="${s}" ${idea?.status === s ? 'selected' : ''}>
                  ${capitalize(s)}
                </option>
              `).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="label" for="effort">Effort</label>
            <select id="effort" name="effort" class="select">
              <option value="">Not set</option>
              ${EFFORT_LEVELS.map((e) => `
                <option value="${e}" ${idea?.effort === e ? 'selected' : ''}>
                  ${capitalize(e)}
                </option>
              `).join('')}
            </select>
          </div>
        </div>

        <div class="form-row form-row--2">
          <div class="form-group">
            <label class="label" for="interest">Interest level *</label>
            <div class="rating" id="rating-stars">
              ${[1, 2, 3, 4, 5].map((n) => `
                <button type="button" class="rating__star ${(idea?.interest || 3) >= n ? 'rating__star--active' : ''}"
                  data-value="${n}" aria-label="${n} stars">★</button>
              `).join('')}
            </div>
            <input type="hidden" id="interest" name="interest" value="${idea?.interest || 3}">
          </div>
          <div class="form-group">
            <label class="label" for="deadline">Deadline</label>
            <input type="date" id="deadline" name="deadline" class="input"
              value="${idea?.deadline || ''}">
          </div>
        </div>

        <div class="form-group">
          <label class="label" for="resources">Resources needed</label>
          <textarea id="resources" name="resources" class="textarea" rows="2"
            placeholder="One per line...">${(idea?.resources || []).join('\n')}</textarea>
        </div>

        <div class="form-group">
          <label class="label" for="collaborators">Collaborators</label>
          <input type="text" id="collaborators" name="collaborators" class="input"
            value="${(idea?.collaborators || []).join(', ')}"
            placeholder="Comma-separated names...">
        </div>

        ${common}
      `;

    case IDEA_TYPES.note:
      return `
        <div class="form-group">
          <label class="label" for="content">Content *</label>
          <textarea id="content" name="content" class="textarea" rows="6" required
            placeholder="What's on your mind?">${escapeHtml(idea?.content || '')}</textarea>
        </div>

        ${common}
      `;

    default:
      return '<p>Unknown idea type</p>';
  }
}

/**
 * Create an idea form
 * @param {HTMLElement} container - Form container
 * @param {string} type - Idea type
 * @param {Object} idea - Existing idea for editing (optional)
 * @param {Object} options - Configuration options
 * @returns {Object} Form controller
 */
export function createIdeaForm(container, type, idea = null, options = {}) {
  const { onSave = () => {}, onDelete = () => {}, onCancel = () => {} } = options;
  const isEdit = !!idea;

  // Generate form HTML
  container.innerHTML = `
    ${getFormFields(type, idea)}
    <div class="idea-form__actions">
      ${isEdit ? '<button type="button" class="btn btn--danger" data-action="delete">Delete</button>' : ''}
      <button type="button" class="btn btn--secondary" data-action="cancel">Cancel</button>
      <button type="submit" class="btn btn--primary">${isEdit ? 'Save changes' : 'Create'}</button>
    </div>
  `;

  // Initialize tag input
  const tagsContainer = container.querySelector('#tags-container');
  const tagInput = createTagInput(tagsContainer, {
    initialTags: idea?.tags || [],
    placeholder: 'Add tags...'
  });

  // Initialize file picker
  const filesContainer = container.querySelector('#files-container');
  const filePicker = createFilePicker(filesContainer, {
    initialAttachments: idea?.attachments || []
  });

  // Initialize rating/interest stars
  const ratingStars = container.querySelector('#rating-stars');
  if (ratingStars) {
    const hiddenInput = type === IDEA_TYPES.project
      ? container.querySelector('#interest')
      : container.querySelector('#rating');

    ratingStars.addEventListener('click', (e) => {
      const star = e.target.closest('.rating__star');
      if (!star) return;

      const value = parseInt(star.dataset.value, 10);
      hiddenInput.value = value;

      // Update visual state
      ratingStars.querySelectorAll('.rating__star').forEach((s) => {
        s.classList.toggle('rating__star--active', parseInt(s.dataset.value, 10) <= value);
      });
    });
  }

  // Collect form data
  function getFormData() {
    const formData = new FormData(container.closest('form') || container);
    const data = {};

    // Common fields
    data.tags = tagInput.getTags();
    data.attachments = filePicker.getAttachments();

    // Type-specific fields
    switch (type) {
      case IDEA_TYPES.media:
        data.title = formData.get('title')?.trim();
        data.mediaType = formData.get('mediaType');
        data.status = formData.get('status');
        data.recommender = formData.get('recommender')?.trim();
        data.reason = formData.get('reason')?.trim();
        data.url = formData.get('url')?.trim();
        data.notes = formData.get('notes')?.trim();
        data.rating = formData.get('rating') ? parseInt(formData.get('rating'), 10) : null;
        break;

      case IDEA_TYPES.project:
        data.title = formData.get('title')?.trim();
        data.description = formData.get('description')?.trim();
        data.status = formData.get('status');
        data.effort = formData.get('effort') || null;
        data.interest = parseInt(formData.get('interest'), 10) || 3;
        data.deadline = formData.get('deadline') || null;
        data.resources = formData.get('resources')?.split('\n').map((r) => r.trim()).filter(Boolean) || [];
        data.collaborators = formData.get('collaborators')?.split(',').map((c) => c.trim()).filter(Boolean) || [];
        break;

      case IDEA_TYPES.note:
        data.content = formData.get('content')?.trim();
        break;
    }

    return data;
  }

  // Handle form submission
  container.addEventListener('submit', (e) => {
    e.preventDefault();

    const data = getFormData();

    // Create or update idea
    let updatedIdea;
    if (isEdit) {
      updatedIdea = {
        ...idea,
        ...data,
        updatedAt: timestamp(),
        pendingSync: true
      };
    } else {
      updatedIdea = createIdea(type, data);
    }

    // Validate
    const validation = validateIdea(updatedIdea);
    if (!validation.valid) {
      alert(validation.errors.join('\n'));
      return;
    }

    onSave(updatedIdea);
  });

  // Handle button clicks
  container.addEventListener('click', (e) => {
    const action = e.target.dataset?.action;
    if (action === 'cancel') {
      onCancel();
    } else if (action === 'delete') {
      if (confirm('Delete this idea? This cannot be undone.')) {
        onDelete(idea);
      }
    }
  });

  return {
    getFormData,
    setData: (newData) => {
      // Update form fields with new data
      Object.entries(newData).forEach(([key, value]) => {
        const input = container.querySelector(`[name="${key}"]`);
        if (input) {
          input.value = value;
        }
      });
      if (newData.tags) {
        tagInput.setTags(newData.tags);
      }
      if (newData.attachments) {
        filePicker.setAttachments(newData.attachments);
      }
    }
  };
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

/**
 * Capitalize first letter
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
