/**
 * Tests for oauth.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getToken,
  isAuthenticated,
  logout
} from '../js/oauth.js';

describe('oauth', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('getToken', () => {
    it('returns null when no token stored', () => {
      expect(getToken('google')).toBeNull();
    });

    it('returns token when valid and not expired', () => {
      const tokenData = {
        accessToken: 'test-token',
        refreshToken: null,
        expiry: Date.now() + 3600000 // 1 hour from now
      };
      localStorage.setItem('token-google', JSON.stringify(tokenData));

      expect(getToken('google')).toBe('test-token');
    });

    it('returns null when token is expired', () => {
      const tokenData = {
        accessToken: 'expired-token',
        refreshToken: null,
        expiry: Date.now() - 1000 // Expired
      };
      localStorage.setItem('token-google', JSON.stringify(tokenData));

      expect(getToken('google')).toBeNull();
    });

    it('returns null when token is expiring soon (within 5 minutes)', () => {
      const tokenData = {
        accessToken: 'expiring-token',
        refreshToken: null,
        expiry: Date.now() + 60000 // 1 minute from now
      };
      localStorage.setItem('token-google', JSON.stringify(tokenData));

      expect(getToken('google')).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('returns false when no token', () => {
      expect(isAuthenticated('google')).toBe(false);
    });

    it('returns true when valid token exists', () => {
      const tokenData = {
        accessToken: 'valid-token',
        refreshToken: null,
        expiry: Date.now() + 3600000
      };
      localStorage.setItem('token-google', JSON.stringify(tokenData));

      expect(isAuthenticated('google')).toBe(true);
    });

    it('returns false when token is expired', () => {
      const tokenData = {
        accessToken: 'expired',
        refreshToken: null,
        expiry: Date.now() - 1000
      };
      localStorage.setItem('token-google', JSON.stringify(tokenData));

      expect(isAuthenticated('google')).toBe(false);
    });
  });

  describe('logout', () => {
    it('clears token from localStorage', () => {
      localStorage.setItem('token-google', JSON.stringify({ accessToken: 'test' }));
      sessionStorage.setItem('oauth-google', JSON.stringify({ state: 'test' }));

      logout('google');

      expect(localStorage.getItem('token-google')).toBeNull();
      expect(sessionStorage.getItem('oauth-google')).toBeNull();
    });

    it('handles non-existent tokens gracefully', () => {
      logout('nonexistent');
      // Should not throw
    });
  });
});
