/**
 * Tests for ntfy.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sendNotification,
  testNotification,
  sendReminder,
  checkAndSendReminders
} from '../js/ntfy.js';

describe('ntfy', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('sendNotification', () => {
    it('throws if topic is missing', async () => {
      await expect(sendNotification('', 'Title', 'Message'))
        .rejects.toThrow('Topic is required');
    });

    it('sends notification with correct headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch;

      await sendNotification('my-topic', 'Test Title', 'Test message', {
        priority: 'high',
        tags: ['warning']
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toBe('https://ntfy.sh/my-topic');
      expect(options.method).toBe('POST');
      expect(options.headers.Title).toBe('Test Title');
      expect(options.headers.Priority).toBe('high');
      expect(options.headers.Tags).toBe('warning');
      expect(options.body).toBe('Test message');
    });

    it('includes click URL when provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch;

      await sendNotification('topic', 'Title', 'Message', {
        click: 'https://example.com'
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Click).toBe('https://example.com');
    });

    it('throws on failed request', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Server Error'
      });

      await expect(sendNotification('topic', 'Title', 'Message'))
        .rejects.toThrow('Failed to send notification');
    });
  });

  describe('testNotification', () => {
    it('sends a test notification with correct content', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch;

      await testNotification('test-topic');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://ntfy.sh/test-topic');
      expect(options.headers.Title).toBe('Scribe Test');
      expect(options.body).toContain('notifications are working');
    });
  });

  describe('sendReminder', () => {
    it('throws if topic is missing', async () => {
      await expect(sendReminder('', { title: 'Test' }, 3))
        .rejects.toThrow('Topic is required');
    });

    it('throws if idea is missing title', async () => {
      await expect(sendReminder('topic', {}, 3))
        .rejects.toThrow('Idea with title is required');
    });

    it('sends urgent notification for same-day deadline', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch;

      await sendReminder('topic', { title: 'Project X', deadline: '2024-01-15' }, 0);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Title).toContain('Deadline today');
      expect(options.headers.Priority).toBe('urgent');
    });

    it('sends high priority for tomorrow deadline', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch;

      await sendReminder('topic', { title: 'Project X', deadline: '2024-01-15' }, 1);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Title).toContain('Deadline tomorrow');
      expect(options.headers.Priority).toBe('high');
    });

    it('sends default priority for distant deadline', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch;

      await sendReminder('topic', { title: 'Project X', deadline: '2024-01-20' }, 7);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Title).toContain('Upcoming deadline');
      expect(options.headers.Priority).toBe('default');
    });

    it('includes description in message body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch;

      await sendReminder('topic', {
        title: 'Project X',
        description: 'A cool project',
        deadline: '2024-01-15'
      }, 3);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toContain('A cool project');
      expect(options.body).toContain('2024-01-15');
    });
  });

  describe('checkAndSendReminders', () => {
    it('returns early if no topic configured', async () => {
      const result = await checkAndSendReminders('', [], 7);

      expect(result.skipped).toBe('No topic configured');
    });

    it('skips non-project ideas', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch;

      const ideas = [
        { type: 'media', title: 'Movie', deadline: '2024-01-15' },
        { type: 'note', content: 'Note', deadline: '2024-01-15' }
      ];

      const result = await checkAndSendReminders('topic', ideas, 7);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.sent).toBe(0);
    });

    it('skips projects without deadlines', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch;

      const ideas = [{ type: 'project', title: 'No Deadline Project', status: 'active' }];

      const result = await checkAndSendReminders('topic', ideas, 7);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.sent).toBe(0);
    });

    it('skips completed and dropped projects', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch;

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const deadlineStr = tomorrow.toISOString().split('T')[0];

      const ideas = [
        { type: 'project', title: 'Done Project', status: 'done', deadline: deadlineStr },
        { type: 'project', title: 'Dropped Project', status: 'dropped', deadline: deadlineStr }
      ];

      const result = await checkAndSendReminders('topic', ideas, 7);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.sent).toBe(0);
    });

    it('sends reminders for projects within window', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch;

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 3);
      const deadlineStr = tomorrow.toISOString().split('T')[0];

      const ideas = [
        { type: 'project', title: 'Due Soon', status: 'active', deadline: deadlineStr }
      ];

      const result = await checkAndSendReminders('topic', ideas, 7);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.sent).toBe(1);
    });

    it('captures errors for failed reminders', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Error'
      });

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const ideas = [
        {
          type: 'project',
          title: 'Failing Project',
          status: 'active',
          deadline: tomorrow.toISOString().split('T')[0]
        }
      ];

      const result = await checkAndSendReminders('topic', ideas, 7);

      expect(result.sent).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].idea).toBe('Failing Project');
    });
  });
});
