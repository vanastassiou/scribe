/**
 * Tests for attachment-sync.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setAttachmentProvider,
  getAttachmentProvider,
  uploadAttachment,
  downloadAttachment,
  deleteRemoteAttachment,
  syncAttachments,
  AttachmentSyncStatus
} from '../js/attachment-sync.js';
import * as db from '../js/db.js';

// Mock db module
vi.mock('../js/db.js', () => ({
  getAttachment: vi.fn(),
  saveAttachment: vi.fn(),
  updateAttachment: vi.fn(),
  deleteAttachment: vi.fn()
}));

describe('attachment-sync', () => {
  let mockProvider;

  beforeEach(() => {
    vi.resetAllMocks();
    setAttachmentProvider(null);

    mockProvider = {
      name: 'mock-provider',
      uploadAttachment: vi.fn(),
      downloadAttachment: vi.fn(),
      deleteAttachment: vi.fn(),
      listAttachments: vi.fn()
    };
  });

  describe('setAttachmentProvider / getAttachmentProvider', () => {
    it('sets and gets the provider', () => {
      setAttachmentProvider(mockProvider);
      expect(getAttachmentProvider()).toBe(mockProvider);
    });

    it('returns null when no provider set', () => {
      expect(getAttachmentProvider()).toBeNull();
    });
  });

  describe('uploadAttachment', () => {
    it('throws when no provider configured', async () => {
      const attachment = { id: 'att-1', filename: 'test.jpg' };
      const blob = new Blob(['test']);

      await expect(uploadAttachment(attachment, blob))
        .rejects.toThrow('No sync provider configured');
    });

    it('throws when provider has no uploadAttachment method', async () => {
      setAttachmentProvider({ name: 'incomplete' });

      const attachment = { id: 'att-1', filename: 'test.jpg' };
      const blob = new Blob(['test']);

      await expect(uploadAttachment(attachment, blob))
        .rejects.toThrow('Provider does not support attachment upload');
    });

    it('uploads and returns updated attachment', async () => {
      setAttachmentProvider(mockProvider);
      mockProvider.uploadAttachment.mockResolvedValue('remote-123');

      const attachment = {
        id: 'att-1',
        filename: 'test.jpg',
        mimeType: 'image/jpeg',
        syncStatus: AttachmentSyncStatus.LOCAL
      };
      const blob = new Blob(['test']);

      const result = await uploadAttachment(attachment, blob);

      expect(mockProvider.uploadAttachment).toHaveBeenCalledWith(
        'att-1', 'test.jpg', blob, 'image/jpeg'
      );
      expect(result.remoteId).toBe('remote-123');
      expect(result.syncStatus).toBe(AttachmentSyncStatus.SYNCED);
    });

    it('marks attachment as syncing during upload', async () => {
      setAttachmentProvider(mockProvider);
      mockProvider.uploadAttachment.mockResolvedValue('remote-123');

      const attachment = {
        id: 'att-1',
        filename: 'test.jpg',
        syncStatus: AttachmentSyncStatus.LOCAL
      };
      const blob = new Blob(['test']);

      await uploadAttachment(attachment, blob);

      // First call should mark as syncing
      expect(db.updateAttachment).toHaveBeenCalledWith(
        expect.objectContaining({ syncStatus: AttachmentSyncStatus.SYNCING })
      );

      // Second call should mark as synced
      expect(db.updateAttachment).toHaveBeenCalledWith(
        expect.objectContaining({ syncStatus: AttachmentSyncStatus.SYNCED })
      );
    });

    it('marks attachment as error on failure', async () => {
      setAttachmentProvider(mockProvider);
      mockProvider.uploadAttachment.mockRejectedValue(new Error('Upload failed'));

      const attachment = {
        id: 'att-1',
        filename: 'test.jpg',
        syncStatus: AttachmentSyncStatus.LOCAL
      };
      const blob = new Blob(['test']);

      await expect(uploadAttachment(attachment, blob)).rejects.toThrow('Upload failed');

      expect(db.updateAttachment).toHaveBeenLastCalledWith(
        expect.objectContaining({
          syncStatus: AttachmentSyncStatus.ERROR,
          syncError: 'Upload failed'
        })
      );
    });
  });

  describe('downloadAttachment', () => {
    it('throws when no provider configured', async () => {
      const attachment = { id: 'att-1', remoteId: 'remote-123' };

      await expect(downloadAttachment(attachment))
        .rejects.toThrow('No sync provider configured');
    });

    it('throws when attachment has no remoteId', async () => {
      setAttachmentProvider(mockProvider);
      const attachment = { id: 'att-1' };

      await expect(downloadAttachment(attachment))
        .rejects.toThrow('Attachment has no remote ID');
    });

    it('returns cached local copy if available', async () => {
      setAttachmentProvider(mockProvider);
      const cachedBlob = new Blob(['cached']);
      db.getAttachment.mockResolvedValue({ id: 'att-1', blob: cachedBlob });

      const attachment = { id: 'att-1', remoteId: 'remote-123' };
      const result = await downloadAttachment(attachment);

      expect(result).toBe(cachedBlob);
      expect(mockProvider.downloadAttachment).not.toHaveBeenCalled();
    });

    it('downloads from provider if not cached', async () => {
      setAttachmentProvider(mockProvider);
      const remoteBlob = new Blob(['remote']);
      db.getAttachment.mockResolvedValue(null);
      mockProvider.downloadAttachment.mockResolvedValue(remoteBlob);

      const attachment = { id: 'att-1', remoteId: 'remote-123' };
      const result = await downloadAttachment(attachment);

      expect(result).toBe(remoteBlob);
      expect(mockProvider.downloadAttachment).toHaveBeenCalledWith('remote-123');
      expect(db.saveAttachment).toHaveBeenCalledWith('att-1', remoteBlob);
    });
  });

  describe('deleteRemoteAttachment', () => {
    it('does nothing when no provider configured', async () => {
      const attachment = { id: 'att-1', remoteId: 'remote-123' };
      await deleteRemoteAttachment(attachment);
      // Should not throw
    });

    it('does nothing when attachment has no remoteId', async () => {
      setAttachmentProvider(mockProvider);
      const attachment = { id: 'att-1' };
      await deleteRemoteAttachment(attachment);
      expect(mockProvider.deleteAttachment).not.toHaveBeenCalled();
    });

    it('deletes from provider when attachment has remoteId', async () => {
      setAttachmentProvider(mockProvider);
      const attachment = { id: 'att-1', remoteId: 'remote-123' };

      await deleteRemoteAttachment(attachment);

      expect(mockProvider.deleteAttachment).toHaveBeenCalledWith('remote-123');
    });
  });

  describe('syncAttachments', () => {
    it('returns empty result when no provider configured', async () => {
      const result = await syncAttachments([]);

      expect(result).toEqual({ uploaded: 0, downloaded: 0, errors: [] });
    });

    it('uploads local-only attachments', async () => {
      setAttachmentProvider(mockProvider);
      mockProvider.uploadAttachment.mockResolvedValue('remote-new');

      const localBlob = new Blob(['local']);
      db.getAttachment.mockResolvedValue({ id: 'att-1', blob: localBlob });

      const attachments = [
        { id: 'att-1', filename: 'test.jpg', syncStatus: AttachmentSyncStatus.LOCAL }
      ];

      const result = await syncAttachments(attachments);

      expect(result.uploaded).toBe(1);
      expect(mockProvider.uploadAttachment).toHaveBeenCalled();
    });

    it('downloads missing synced attachments', async () => {
      setAttachmentProvider(mockProvider);
      const remoteBlob = new Blob(['remote']);
      mockProvider.downloadAttachment.mockResolvedValue(remoteBlob);
      db.getAttachment.mockResolvedValue(null);

      const attachments = [
        { id: 'att-1', remoteId: 'remote-123', syncStatus: AttachmentSyncStatus.SYNCED }
      ];

      const result = await syncAttachments(attachments);

      expect(result.downloaded).toBe(1);
      expect(mockProvider.downloadAttachment).toHaveBeenCalledWith('remote-123');
    });

    it('collects errors without stopping', async () => {
      setAttachmentProvider(mockProvider);
      mockProvider.uploadAttachment.mockRejectedValue(new Error('Upload failed'));

      const localBlob = new Blob(['local']);
      db.getAttachment.mockResolvedValue({ id: 'att-1', blob: localBlob });

      const attachments = [
        { id: 'att-1', filename: 'fail.jpg', syncStatus: AttachmentSyncStatus.LOCAL }
      ];

      const result = await syncAttachments(attachments);

      expect(result.uploaded).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].attachment).toBe('fail.jpg');
    });
  });

  describe('AttachmentSyncStatus', () => {
    it('has expected values', () => {
      expect(AttachmentSyncStatus.LOCAL).toBe('local');
      expect(AttachmentSyncStatus.SYNCING).toBe('syncing');
      expect(AttachmentSyncStatus.SYNCED).toBe('synced');
      expect(AttachmentSyncStatus.ERROR).toBe('error');
    });
  });
});
