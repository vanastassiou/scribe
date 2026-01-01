/**
 * File picker component with drag-drop and preview
 */

import { createAttachment } from '../schemas.js';
import { saveAttachment, getAttachment } from '../db.js';

/**
 * Create a file picker component
 * @param {HTMLElement} container - Container element
 * @param {Object} options - Configuration options
 * @returns {Object} File picker controller
 */
export function createFilePicker(container, options = {}) {
  const {
    initialAttachments = [],
    accept = '*/*',
    multiple = true,
    onChange = () => {}
  } = options;

  let attachments = [...initialAttachments];

  // Create DOM structure
  container.innerHTML = `
    <div class="file-picker" role="button" tabindex="0" aria-label="Drop files or click to select">
      <input type="file" class="file-picker__input sr-only" ${accept !== '*/*' ? `accept="${accept}"` : ''} ${multiple ? 'multiple' : ''}>
      <p class="file-picker__text">Drop files here or click to select</p>
      <div class="file-picker__files"></div>
    </div>
  `;

  const picker = container.querySelector('.file-picker');
  const input = container.querySelector('.file-picker__input');
  const filesContainer = container.querySelector('.file-picker__files');

  // Render file previews
  async function renderPreviews() {
    const previews = await Promise.all(attachments.map(async (att) => {
      const isImage = att.mimeType.startsWith('image/');
      let preview = '';

      if (isImage) {
        // Try to get blob URL
        let url = att.localBlobUrl;
        if (!url) {
          const blob = await getAttachment(att.id);
          if (blob) {
            url = URL.createObjectURL(blob);
            att.localBlobUrl = url;
          }
        }

        if (url) {
          preview = `<img src="${url}" alt="${escapeHtml(att.filename)}" class="file-preview__img">`;
        } else {
          preview = `<div class="file-preview__icon">🖼️</div>`;
        }
      } else {
        const icon = getFileIcon(att.mimeType);
        preview = `<div class="file-preview__icon">${icon}</div>`;
      }

      return `
        <div class="file-preview" data-id="${att.id}" title="${escapeHtml(att.filename)}">
          ${preview}
          <button class="file-preview__remove" aria-label="Remove ${escapeHtml(att.filename)}">&times;</button>
        </div>
      `;
    }));

    filesContainer.innerHTML = previews.join('');
  }

  // Process files
  async function processFiles(files) {
    for (const file of files) {
      const attachment = createAttachment(file);

      // Store blob in IndexedDB
      await saveAttachment(attachment.id, file);

      // Create blob URL for preview
      attachment.localBlobUrl = URL.createObjectURL(file);

      attachments.push(attachment);
    }

    await renderPreviews();
    onChange(attachments);
  }

  // Remove attachment
  async function removeAttachment(id) {
    const index = attachments.findIndex((a) => a.id === id);
    if (index > -1) {
      const att = attachments[index];
      if (att.localBlobUrl) {
        URL.revokeObjectURL(att.localBlobUrl);
      }
      attachments.splice(index, 1);
      await renderPreviews();
      onChange(attachments);
    }
  }

  // Click to open file dialog
  picker.addEventListener('click', (e) => {
    if (!e.target.closest('.file-preview__remove')) {
      input.click();
    }
  });

  // Keyboard support
  picker.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });

  // File input change
  input.addEventListener('change', () => {
    if (input.files.length > 0) {
      processFiles(input.files);
      input.value = ''; // Reset for same file selection
    }
  });

  // Drag and drop
  picker.addEventListener('dragover', (e) => {
    e.preventDefault();
    picker.classList.add('file-picker--dragover');
  });

  picker.addEventListener('dragleave', (e) => {
    e.preventDefault();
    picker.classList.remove('file-picker--dragover');
  });

  picker.addEventListener('drop', (e) => {
    e.preventDefault();
    picker.classList.remove('file-picker--dragover');

    if (e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  });

  // Paste support
  document.addEventListener('paste', (e) => {
    // Only handle if picker is focused or visible
    if (!document.activeElement.closest('.file-picker') && !picker.matches(':focus-within')) {
      return;
    }

    const files = Array.from(e.clipboardData.files);
    if (files.length > 0) {
      e.preventDefault();
      processFiles(files);
    }
  });

  // Remove button click
  filesContainer.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.file-preview__remove');
    if (removeBtn) {
      e.stopPropagation();
      const preview = removeBtn.closest('.file-preview');
      removeAttachment(preview.dataset.id);
    }
  });

  // Initial render
  if (attachments.length > 0) {
    renderPreviews();
  }

  // Return controller
  return {
    getAttachments: () => [...attachments],
    setAttachments: async (newAttachments) => {
      // Revoke old blob URLs
      for (const att of attachments) {
        if (att.localBlobUrl) {
          URL.revokeObjectURL(att.localBlobUrl);
        }
      }
      attachments = [...newAttachments];
      await renderPreviews();
    },
    addFiles: processFiles,
    removeAttachment,
    clear: async () => {
      for (const att of attachments) {
        if (att.localBlobUrl) {
          URL.revokeObjectURL(att.localBlobUrl);
        }
      }
      attachments = [];
      await renderPreviews();
      onChange(attachments);
    }
  };
}

/**
 * Get icon for file type
 */
function getFileIcon(mimeType) {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📽️';
  if (mimeType.includes('zip') || mimeType.includes('archive')) return '📦';
  return '📎';
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Format file size
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
