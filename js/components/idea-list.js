/**
 * Idea list component with expandable panels
 */

import { getTypeInfo, getIdeaTitle, formatStatus, formatDate } from '../schemas.js';
import { createIdeaForm } from './idea-form.js';

/**
 * Render a single idea item (collapsed)
 */
function renderIdeaItem(idea) {
  const typeInfo = getTypeInfo(idea.type);
  const title = getIdeaTitle(idea);
  const status = idea.status ? formatStatus(idea.status) : '';

  return `
    <article class="idea-item" data-id="${idea.id}" data-type="${idea.type}">
      <header class="idea-item__header" role="button" aria-expanded="false" tabindex="0">
        <div class="idea-item__icon idea-item__icon--${idea.type}">
          ${typeInfo.icon}
        </div>
        <div class="idea-item__content">
          <h3 class="idea-item__title">${escapeHtml(title)}</h3>
          <div class="idea-item__meta">
            ${status ? `<span class="status status--${idea.status}">${status}</span>` : ''}
            ${idea.tags?.length ? `
              <div class="idea-item__tags">
                ${idea.tags.slice(0, 3).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
                ${idea.tags.length > 3 ? `<span class="tag">+${idea.tags.length - 3}</span>` : ''}
              </div>
            ` : ''}
            <span class="idea-item__date">${formatDate(idea.updatedAt)}</span>
          </div>
        </div>
        <svg class="idea-item__chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </header>
      <div class="idea-item__panel">
        <form class="idea-form">
          <!-- Form injected when expanded -->
        </form>
      </div>
    </article>
  `;
}

/**
 * Create an idea list component
 * @param {HTMLElement} container - Container element
 * @param {Object} options - Configuration options
 * @returns {Object} List controller
 */
export function createIdeaList(container, options = {}) {
  const {
    onSave = () => {},
    onDelete = () => {}
  } = options;

  let ideas = [];
  let expandedId = null;
  let formController = null;

  // Render the list
  function render() {
    if (ideas.length === 0) {
      container.innerHTML = '';
      document.getElementById('empty-state')?.classList.remove('hidden');
      return;
    }

    document.getElementById('empty-state')?.classList.add('hidden');
    container.innerHTML = ideas.map(renderIdeaItem).join('');

    // Re-expand if was expanded
    if (expandedId) {
      const item = container.querySelector(`[data-id="${expandedId}"]`);
      if (item) {
        expandItem(item);
      }
    }
  }

  // Expand an item
  function expandItem(item) {
    const id = item.dataset.id;
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;

    // Collapse previously expanded
    const previouslyExpanded = container.querySelector('.idea-item--expanded');
    if (previouslyExpanded && previouslyExpanded !== item) {
      collapseItem(previouslyExpanded);
    }

    // Expand this item
    item.classList.add('idea-item--expanded');
    item.querySelector('.idea-item__header').setAttribute('aria-expanded', 'true');
    expandedId = id;

    // Inject form
    const formContainer = item.querySelector('.idea-form');
    formController = createIdeaForm(formContainer, idea.type, idea, {
      onSave: (updatedIdea) => {
        onSave(updatedIdea);
        collapseItem(item);
      },
      onDelete: (deletedIdea) => {
        onDelete(deletedIdea);
        expandedId = null;
      },
      onCancel: () => {
        collapseItem(item);
      }
    });
  }

  // Collapse an item
  function collapseItem(item) {
    item.classList.remove('idea-item--expanded');
    item.querySelector('.idea-item__header').setAttribute('aria-expanded', 'false');
    item.querySelector('.idea-form').innerHTML = '';
    formController = null;

    if (item.dataset.id === expandedId) {
      expandedId = null;
    }
  }

  // Toggle item expansion
  function toggleItem(item) {
    if (item.classList.contains('idea-item--expanded')) {
      collapseItem(item);
    } else {
      expandItem(item);
    }
  }

  // Event delegation for item clicks
  container.addEventListener('click', (e) => {
    const header = e.target.closest('.idea-item__header');
    if (header) {
      const item = header.closest('.idea-item');
      toggleItem(item);
    }
  });

  // Keyboard support
  container.addEventListener('keydown', (e) => {
    const header = e.target.closest('.idea-item__header');
    if (!header) return;

    const item = header.closest('.idea-item');
    const items = Array.from(container.querySelectorAll('.idea-item'));
    const currentIndex = items.indexOf(item);

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        toggleItem(item);
        break;

      case 'ArrowDown':
      case 'j':
        e.preventDefault();
        if (currentIndex < items.length - 1) {
          items[currentIndex + 1].querySelector('.idea-item__header').focus();
        }
        break;

      case 'ArrowUp':
      case 'k':
        e.preventDefault();
        if (currentIndex > 0) {
          items[currentIndex - 1].querySelector('.idea-item__header').focus();
        }
        break;

      case 'e':
        e.preventDefault();
        if (!item.classList.contains('idea-item--expanded')) {
          expandItem(item);
        }
        break;

      case 'Escape':
        if (item.classList.contains('idea-item--expanded')) {
          e.preventDefault();
          collapseItem(item);
          header.focus();
        }
        break;
    }
  });

  // Get currently selected/focused item
  function getSelectedItem() {
    // Check if focus is within container
    const focused = document.activeElement?.closest('.idea-item');
    if (focused && container.contains(focused)) {
      return focused;
    }
    // Check for expanded item
    const expanded = container.querySelector('.idea-item--expanded');
    if (expanded) {
      return expanded;
    }
    // Check for item with selected class
    return container.querySelector('.idea-item--selected');
  }

  // Select an item visually and focus it
  function selectItem(item) {
    // Remove selection from others
    container.querySelectorAll('.idea-item--selected').forEach((el) => {
      el.classList.remove('idea-item--selected');
    });
    item.classList.add('idea-item--selected');
    item.querySelector('.idea-item__header').focus();
  }

  // Return controller
  return {
    setIdeas: (newIdeas) => {
      ideas = [...newIdeas];
      render();
    },

    addIdea: (idea) => {
      ideas.unshift(idea);
      render();
    },

    updateIdea: (idea) => {
      const index = ideas.findIndex((i) => i.id === idea.id);
      if (index > -1) {
        ideas[index] = idea;
        render();
      }
    },

    removeIdea: (id) => {
      const index = ideas.findIndex((i) => i.id === id);
      if (index > -1) {
        ideas.splice(index, 1);
        render();
      }
    },

    getIdeas: () => [...ideas],

    collapseAll: () => {
      const expanded = container.querySelector('.idea-item--expanded');
      if (expanded) {
        collapseItem(expanded);
      }
    },

    expandIdea: (id) => {
      const item = container.querySelector(`[data-id="${id}"]`);
      if (item) {
        expandItem(item);
      }
    },

    selectNext: () => {
      const items = Array.from(container.querySelectorAll('.idea-item'));
      if (items.length === 0) return;

      const current = getSelectedItem();
      const currentIndex = current ? items.indexOf(current) : -1;
      const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      selectItem(items[nextIndex]);
    },

    selectPrevious: () => {
      const items = Array.from(container.querySelectorAll('.idea-item'));
      if (items.length === 0) return;

      const current = getSelectedItem();
      const currentIndex = current ? items.indexOf(current) : 0;
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      selectItem(items[prevIndex]);
    },

    toggleSelected: () => {
      const selected = getSelectedItem();
      if (selected) {
        toggleItem(selected);
      } else {
        // Select first item if none selected
        const first = container.querySelector('.idea-item');
        if (first) {
          toggleItem(first);
        }
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
