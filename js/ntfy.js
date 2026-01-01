/**
 * ntfy.sh integration for push notifications
 *
 * ntfy.sh is a simple pub-sub notification service that requires no account.
 * Users subscribe to a topic on their phone and receive push notifications.
 */

const NTFY_BASE_URL = 'https://ntfy.sh';

/**
 * Send a notification to a ntfy topic
 * @param {string} topic - The ntfy topic name
 * @param {string} title - Notification title
 * @param {string} message - Notification body
 * @param {Object} options - Additional options
 * @param {string} options.priority - Priority: min, low, default, high, urgent
 * @param {string[]} options.tags - Emoji tags (e.g., ['warning', 'skull'])
 * @param {string} options.click - URL to open on click
 * @param {number} options.delay - Delay in seconds before sending
 * @returns {Promise<boolean>} Success status
 */
export async function sendNotification(topic, title, message, options = {}) {
  if (!topic) {
    throw new Error('Topic is required');
  }

  const headers = {
    'Title': title || 'Scribe',
    'Priority': options.priority || 'default'
  };

  if (options.tags && options.tags.length > 0) {
    headers['Tags'] = options.tags.join(',');
  }

  if (options.click) {
    headers['Click'] = options.click;
  }

  if (options.delay) {
    headers['Delay'] = `${options.delay}s`;
  }

  const response = await fetch(`${NTFY_BASE_URL}/${encodeURIComponent(topic)}`, {
    method: 'POST',
    headers,
    body: message
  });

  if (!response.ok) {
    throw new Error(`Failed to send notification: ${response.status} ${response.statusText}`);
  }

  return true;
}

/**
 * Send a test notification to verify topic setup
 * @param {string} topic - The ntfy topic name
 * @returns {Promise<boolean>} Success status
 */
export async function testNotification(topic) {
  return sendNotification(
    topic,
    'Scribe Test',
    'If you see this, notifications are working!',
    {
      tags: ['white_check_mark'],
      priority: 'default'
    }
  );
}

/**
 * Send a deadline reminder notification
 * @param {string} topic - The ntfy topic name
 * @param {Object} idea - The project idea with deadline
 * @param {number} daysUntil - Days until deadline
 * @returns {Promise<boolean>} Success status
 */
export async function sendReminder(topic, idea, daysUntil) {
  if (!topic) {
    throw new Error('Topic is required');
  }

  if (!idea || !idea.title) {
    throw new Error('Idea with title is required');
  }

  let title;
  let priority;
  let tags;

  if (daysUntil <= 0) {
    title = `Deadline today: ${idea.title}`;
    priority = 'urgent';
    tags = ['rotating_light', 'calendar'];
  } else if (daysUntil === 1) {
    title = `Deadline tomorrow: ${idea.title}`;
    priority = 'high';
    tags = ['warning', 'calendar'];
  } else if (daysUntil <= 3) {
    title = `Deadline in ${daysUntil} days: ${idea.title}`;
    priority = 'high';
    tags = ['hourglass', 'calendar'];
  } else {
    title = `Upcoming deadline: ${idea.title}`;
    priority = 'default';
    tags = ['calendar'];
  }

  const message = idea.description
    ? `${idea.description}\n\nDeadline: ${idea.deadline}`
    : `Deadline: ${idea.deadline}`;

  return sendNotification(topic, title, message, {
    priority,
    tags,
    click: window.location.origin
  });
}

/**
 * Check deadlines and send reminders for upcoming ones
 * @param {string} topic - The ntfy topic name
 * @param {Object[]} ideas - Array of project ideas
 * @param {number} reminderDays - Days before deadline to send reminder
 * @returns {Promise<Object>} Result with sent count and errors
 */
export async function checkAndSendReminders(topic, ideas, reminderDays = 7) {
  if (!topic) {
    return { sent: 0, errors: [], skipped: 'No topic configured' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = { sent: 0, errors: [] };

  for (const idea of ideas) {
    // Only check project ideas with deadlines
    if (idea.type !== 'project' || !idea.deadline) {
      continue;
    }

    // Skip completed or dropped projects
    if (idea.status === 'done' || idea.status === 'dropped') {
      continue;
    }

    const deadline = new Date(idea.deadline);
    deadline.setHours(0, 0, 0, 0);

    const daysUntil = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));

    // Send reminder if within the reminder window
    if (daysUntil >= 0 && daysUntil <= reminderDays) {
      try {
        await sendReminder(topic, idea, daysUntil);
        result.sent++;
      } catch (err) {
        result.errors.push({ idea: idea.title, error: err.message });
      }
    }
  }

  return result;
}

/**
 * Schedule daily reminder check
 * This should be called on app startup
 * @param {Function} getIdeas - Function that returns all ideas
 * @param {Function} getSettings - Function that returns app settings
 */
export function scheduleReminderCheck(getIdeas, getSettings) {
  // Check reminders on startup
  checkRemindersIfNeeded(getIdeas, getSettings);

  // Check every hour (in case app stays open)
  setInterval(() => {
    checkRemindersIfNeeded(getIdeas, getSettings);
  }, 60 * 60 * 1000);
}

/**
 * Check if we should send reminders (once per day)
 * @param {Function} getIdeas - Function that returns all ideas
 * @param {Function} getSettings - Function that returns app settings
 */
async function checkRemindersIfNeeded(getIdeas, getSettings) {
  const settings = getSettings();

  if (!settings.ntfyTopic) {
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const lastCheck = localStorage.getItem('scribe-last-reminder-check');

  if (lastCheck === today) {
    return; // Already checked today
  }

  try {
    const ideas = await getIdeas();
    const reminderDays = settings.reminderDays || 7;

    await checkAndSendReminders(settings.ntfyTopic, ideas, reminderDays);

    localStorage.setItem('scribe-last-reminder-check', today);
  } catch (err) {
    console.error('Failed to check reminders:', err);
  }
}
