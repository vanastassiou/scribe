# Scribe

An offline-first idea capture app for saving random ideas, media recommendations, and project notes.

## Features

- Capture three types of ideas:
  - Media recommendations (books, films, shows, podcasts, etc.)
  - Project ideas (with deadlines, collaborators, resources)
  - Quick notes (freeform text)
- Offline-first: works without internet, syncs when connected
- Cross-device sync via Google Drive or Dropbox
- Calendar integration for deadline reminders
- Global tagging system with autocomplete
- File attachments with drag-drop and paste support
- Mobile-first responsive design
- PWA: installable on desktop and mobile
- Keyboard shortcuts for power users

## Quick start

1. Clone this repository
2. Serve the files with any static server:

   ```sh
   # Python
   python -m http.server 8000

   # Node.js
   npx serve

   # PHP
   php -S localhost:8000
   ```

3. Open `http://localhost:8000` in your browser

For production, deploy to GitHub Pages, Netlify, or Vercel.

## Project structure

```
scribe/
├── index.html              # Main HTML file
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker for offline support
├── css/
│   └── style.css           # All styles (mobile-first, dark mode)
└── js/
    ├── app.js              # Main application entry
    ├── db.js               # IndexedDB storage layer
    ├── schemas.js          # Data type definitions
    ├── tags.js             # Tag management
    ├── sync.js             # Sync engine for JSON data
    ├── attachment-sync.js  # Sync engine for file attachments
    ├── oauth.js            # OAuth2 PKCE handler
    ├── ntfy.js             # Push notification reminders
    ├── components/
    │   ├── idea-form.js    # Form for each idea type
    │   ├── idea-list.js    # List with expandable panels
    │   ├── idea-panel.js   # Detail view utilities
    │   ├── tag-input.js    # Tag autocomplete component
    │   ├── file-picker.js  # Drag-drop file uploads
    │   └── settings.js     # Settings panel
    └── providers/
        ├── google-drive.js # Google Drive sync
        ├── google-calendar.js # Calendar integration
        └── dropbox.js      # Dropbox sync
```

## Data types

### Media recommendation

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Title of the media (required) |
| `mediaType` | enum | book, film, show, podcast, music, game, article |
| `recommender` | string | Who suggested it |
| `reason` | string | Why it was recommended |
| `url` | string | Link to the media |
| `status` | enum | queued, in-progress, completed, abandoned |
| `rating` | 1-5 | Your rating after consuming |
| `notes` | string | Your thoughts |
| `tags` | string[] | Tags for organization |
| `attachments` | file[] | Related files |

### Project idea

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Project name (required) |
| `description` | string | What the project is about |
| `resources` | string[] | Things needed to complete it |
| `deadline` | date | When it needs to be done |
| `collaborators` | string[] | People to work with |
| `interest` | 1-5 | How interested you are (required) |
| `effort` | enum | trivial, small, medium, large, epic |
| `status` | enum | someday, next, active, done, dropped |
| `tags` | string[] | Tags for organization |
| `attachments` | file[] | Related files |

### Quick note

| Field | Type | Description |
|-------|------|-------------|
| `content` | string | Note text (required) |
| `tags` | string[] | Tags for organization |
| `attachments` | file[] | Related files |

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `n` | New idea |
| `/` | Focus search |
| `j` / `k` | Navigate list |
| `e` | Expand selected item |
| `Escape` | Collapse / clear search |

## Google Drive setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the Google Drive API
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URI: `https://your-domain.com/` (your app URL)
5. Copy the Client ID
6. Update `js/providers/google-drive.js` with your Client ID

Scopes required:
- `https://www.googleapis.com/auth/drive.file` (access app-created files only)

## Google Calendar setup

1. In the same Google Cloud project, enable the Google Calendar API
2. Add the Calendar scope to your OAuth consent screen
3. Update `js/providers/google-calendar.js` with your Client ID

Scopes required:
- `https://www.googleapis.com/auth/calendar.events`

## Dropbox setup

1. Go to [Dropbox App Console](https://www.dropbox.com/developers/apps)
2. Create a new app:
   - API: Scoped access
   - Access type: App folder
3. Configure permissions: `files.content.write`, `files.content.read`
4. Add your redirect URI
5. Copy the App Key
6. Update `js/providers/dropbox.js` with your App Key

## ntfy.sh reminders

For push notification reminders without account setup:

1. Go to Settings in the app
2. Enter a unique ntfy topic name (e.g., `scribe-yourname-12345`)
3. Subscribe to that topic on your phone using the [ntfy app](https://ntfy.sh/)
4. When you set a deadline, you'll receive a notification

The app checks for upcoming deadlines daily and sends reminders based on your configured timing (1 day, 3 days, or 1 week before).

## Bookmarklet

Quickly capture ideas from any webpage:

1. Go to Settings in the app
2. Drag the "Scribe" bookmarklet to your bookmarks bar
3. When browsing, click the bookmarklet to capture the page

The bookmarklet captures:
- Page title
- Page URL
- Selected text (if any)

A popup opens pre-filled with this information for quick saving.

## Offline behavior

The app works fully offline:

1. All data is stored in IndexedDB
2. Static assets are cached by the service worker
3. Changes made offline are queued for sync
4. When you come back online, changes sync automatically

## Data export/import

Export your data anytime from Settings:

- Export creates a JSON file with all ideas and tags
- Import restores from a previously exported file
- Use this for backups or transferring between devices

## Browser support

- Chrome/Edge 88+
- Firefox 78+
- Safari 14+
- Mobile Safari/Chrome

Requires:
- IndexedDB
- Service Workers
- ES Modules
- CSS Custom Properties

## Development

No build step required. Edit the files and refresh.

For live reload during development:

```sh
npx browser-sync start --server --files "**/*"
```

## Testing

Run the test suite:

```sh
npm install   # First time only
npm test      # Run all tests
```

Run tests in watch mode during development:

```sh
npm run test:watch
```

See [docs/TESTING.md](docs/TESTING.md) for a complete guide on writing tests.

## License

MIT
