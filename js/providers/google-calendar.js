/**
 * Google Calendar integration for Scribe
 *
 * Creates calendar events for project deadlines
 *
 * To use this:
 * 1. Enable Google Calendar API in your Google Cloud project
 * 2. Add calendar scope to OAuth consent screen
 * 3. Set CLIENT_ID below
 */

import { getToken, startAuth, isAuthenticated, logout } from '../oauth.js';

// Replace with your OAuth Client ID
const CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
const REDIRECT_URI = window.location.origin + '/';
const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

const API_BASE = 'https://www.googleapis.com/calendar/v3';

/**
 * Check if connected to Google Calendar
 */
export function isConnected() {
  return isAuthenticated('google-calendar');
}

/**
 * Start OAuth flow
 */
export async function connect() {
  await startAuth('google-calendar', CLIENT_ID, SCOPES, REDIRECT_URI);
}

/**
 * Disconnect from Google Calendar
 */
export function disconnect() {
  logout('google-calendar');
}

/**
 * Make authenticated API request
 */
async function apiRequest(path, options = {}) {
  const token = getToken('google-calendar');
  if (!token) {
    throw new Error('Not authenticated with Google Calendar');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'API request failed');
  }

  return response.json();
}

/**
 * Create a calendar event for a project deadline
 * @param {Object} idea - The project idea
 * @param {string} calendarId - Calendar ID (default: 'primary')
 */
export async function createDeadlineEvent(idea, calendarId = 'primary') {
  if (!idea.deadline) {
    throw new Error('Project has no deadline');
  }

  // Parse deadline date
  const deadline = new Date(idea.deadline);

  // Create all-day event
  const event = {
    summary: `Deadline: ${idea.title}`,
    description: buildEventDescription(idea),
    start: {
      date: idea.deadline // YYYY-MM-DD format for all-day event
    },
    end: {
      date: idea.deadline
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 24 * 60 }, // 1 day before
        { method: 'popup', minutes: 60 } // 1 hour before
      ]
    },
    // Store idea ID for reference
    extendedProperties: {
      private: {
        scribeIdeaId: idea.id
      }
    }
  };

  const result = await apiRequest(`/calendars/${calendarId}/events`, {
    method: 'POST',
    body: JSON.stringify(event)
  });

  return result.id;
}

/**
 * Update an existing calendar event
 */
export async function updateDeadlineEvent(eventId, idea, calendarId = 'primary') {
  const event = {
    summary: `Deadline: ${idea.title}`,
    description: buildEventDescription(idea),
    start: {
      date: idea.deadline
    },
    end: {
      date: idea.deadline
    }
  };

  await apiRequest(`/calendars/${calendarId}/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(event)
  });
}

/**
 * Delete a calendar event
 */
export async function deleteDeadlineEvent(eventId, calendarId = 'primary') {
  await apiRequest(`/calendars/${calendarId}/events/${eventId}`, {
    method: 'DELETE'
  });
}

/**
 * Find existing event for an idea
 */
export async function findEventForIdea(ideaId, calendarId = 'primary') {
  const query = `privateExtendedProperty=scribeIdeaId%3D${ideaId}`;
  const result = await apiRequest(`/calendars/${calendarId}/events?${query}`);

  if (result.items?.length > 0) {
    return result.items[0];
  }

  return null;
}

/**
 * Build event description from idea
 */
function buildEventDescription(idea) {
  const lines = [];

  if (idea.description) {
    lines.push(idea.description);
    lines.push('');
  }

  if (idea.collaborators?.length) {
    lines.push(`Collaborators: ${idea.collaborators.join(', ')}`);
  }

  if (idea.resources?.length) {
    lines.push('');
    lines.push('Resources needed:');
    idea.resources.forEach((r) => lines.push(`- ${r}`));
  }

  if (idea.tags?.length) {
    lines.push('');
    lines.push(`Tags: ${idea.tags.join(', ')}`);
  }

  lines.push('');
  lines.push('---');
  lines.push('Created by Scribe');

  return lines.join('\n');
}

/**
 * List user's calendars
 */
export async function listCalendars() {
  const result = await apiRequest('/users/me/calendarList');
  return result.items || [];
}

/**
 * Provider interface
 */
export default {
  name: 'google-calendar',
  isConnected,
  connect,
  disconnect,
  createDeadlineEvent,
  updateDeadlineEvent,
  deleteDeadlineEvent,
  findEventForIdea,
  listCalendars
};
