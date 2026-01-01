/**
 * Tag input component with autocomplete
 */

import { findTags, normalizeTag, isValidTag } from '../tags.js';

/**
 * Create a tag input component
 * @param {HTMLElement} container - Container element
 * @param {Object} options - Configuration options
 * @returns {Object} Tag input controller
 */
export function createTagInput(container, options = {}) {
  const {
    initialTags = [],
    placeholder = 'Add tags...',
    onChange = () => {}
  } = options;

  let tags = [...initialTags];
  let suggestions = [];
  let selectedIndex = -1;

  // Create DOM structure
  container.innerHTML = `
    <div class="tag-input" role="listbox" aria-label="Tags">
      <div class="tag-input__tags"></div>
      <input
        type="text"
        class="tag-input__input"
        placeholder="${placeholder}"
        aria-autocomplete="list"
      />
      <div class="tag-input__suggestions hidden"></div>
    </div>
  `;

  const wrapper = container.querySelector('.tag-input');
  const tagsContainer = container.querySelector('.tag-input__tags');
  const input = container.querySelector('.tag-input__input');
  const suggestionsEl = container.querySelector('.tag-input__suggestions');

  // Render tags
  function renderTags() {
    tagsContainer.innerHTML = tags.map((tag) => `
      <span class="tag" data-tag="${tag}">
        ${escapeHtml(tag)}
        <button class="tag__remove" aria-label="Remove ${tag}">&times;</button>
      </span>
    `).join('');
  }

  // Render suggestions
  function renderSuggestions() {
    if (suggestions.length === 0) {
      suggestionsEl.classList.add('hidden');
      return;
    }

    suggestionsEl.innerHTML = suggestions.map((s, i) => `
      <div
        class="tag-input__suggestion ${i === selectedIndex ? 'tag-input__suggestion--active' : ''}"
        data-tag="${s.name}"
        role="option"
        aria-selected="${i === selectedIndex}"
      >
        ${escapeHtml(s.name)}
        <span class="tag-input__suggestion-count">${s.count}</span>
      </div>
    `).join('');

    suggestionsEl.classList.remove('hidden');
  }

  // Add a tag
  function addTag(tag) {
    const normalized = normalizeTag(tag);
    if (!isValidTag(normalized) || tags.includes(normalized)) {
      return false;
    }
    tags.push(normalized);
    renderTags();
    onChange(tags);
    return true;
  }

  // Remove a tag
  function removeTag(tag) {
    const index = tags.indexOf(tag);
    if (index > -1) {
      tags.splice(index, 1);
      renderTags();
      onChange(tags);
    }
  }

  // Handle input
  input.addEventListener('input', async () => {
    const value = input.value.trim();

    if (!value) {
      suggestions = [];
      renderSuggestions();
      return;
    }

    // Fetch suggestions
    const results = await findTags(value);
    suggestions = results
      .filter((s) => !tags.includes(s.name))
      .slice(0, 5);
    selectedIndex = -1;
    renderSuggestions();
  });

  // Handle keyboard navigation
  input.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && suggestions[selectedIndex]) {
          addTag(suggestions[selectedIndex].name);
        } else if (input.value.trim()) {
          addTag(input.value);
        }
        input.value = '';
        suggestions = [];
        renderSuggestions();
        break;

      case 'Backspace':
        if (!input.value && tags.length > 0) {
          removeTag(tags[tags.length - 1]);
        }
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (suggestions.length > 0) {
          selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
          renderSuggestions();
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (suggestions.length > 0) {
          selectedIndex = Math.max(selectedIndex - 1, -1);
          renderSuggestions();
        }
        break;

      case 'Escape':
        suggestions = [];
        selectedIndex = -1;
        renderSuggestions();
        break;

      case ',':
        e.preventDefault();
        if (input.value.trim()) {
          addTag(input.value);
          input.value = '';
          suggestions = [];
          renderSuggestions();
        }
        break;
    }
  });

  // Handle suggestion click
  suggestionsEl.addEventListener('click', (e) => {
    const suggestion = e.target.closest('.tag-input__suggestion');
    if (suggestion) {
      addTag(suggestion.dataset.tag);
      input.value = '';
      suggestions = [];
      renderSuggestions();
      input.focus();
    }
  });

  // Handle tag removal
  tagsContainer.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.tag__remove');
    if (removeBtn) {
      const tag = removeBtn.parentElement.dataset.tag;
      removeTag(tag);
    }
  });

  // Focus input when clicking wrapper
  wrapper.addEventListener('click', (e) => {
    if (e.target === wrapper || e.target === tagsContainer) {
      input.focus();
    }
  });

  // Hide suggestions on blur
  input.addEventListener('blur', () => {
    // Delay to allow click on suggestion
    setTimeout(() => {
      suggestions = [];
      renderSuggestions();
    }, 200);
  });

  // Initial render
  renderTags();

  // Return controller
  return {
    getTags: () => [...tags],
    setTags: (newTags) => {
      tags = [...newTags];
      renderTags();
    },
    addTag,
    removeTag,
    clear: () => {
      tags = [];
      renderTags();
      onChange(tags);
    }
  };
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
