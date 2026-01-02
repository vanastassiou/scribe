/**
 * Application configuration
 *
 * Copy this file to config.js and fill in your API credentials.
 */

export const config = {
  // Google OAuth credentials (used for Drive and Calendar)
  // Get these from https://console.cloud.google.com/
  google: {
    clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
    clientSecret: 'YOUR_CLIENT_SECRET',
  },

  // Dropbox App credentials
  // Get these from https://www.dropbox.com/developers/apps
  dropbox: {
    appKey: 'YOUR_APP_KEY',
  },

  // OAuth redirect URI (usually your app's root URL)
  redirectUri: window.location.origin + '/',
};
