# Scribe Architecture

## Overview

Scribe is a client-side SPA with no backend dependencies. All data is stored locally in IndexedDB and optionally synced to cloud providers.

```
┌─────────────────────────────────────────────────────────┐
│                      Browser                             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │   UI Layer   │  │ Service Worker│  │  OAuth Manager │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  │
│         │                 │                   │          │
│  ┌──────▼─────────────────▼───────────────────▼───────┐  │
│  │                  Data Layer                         │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │  │
│  │  │  IndexedDB  │  │ Sync Engine │  │ Conflict   │  │  │
│  │  │  (primary)  │◄─┤             ├──┤ Resolver   │  │  │
│  │  └─────────────┘  └──────┬──────┘  └────────────┘  │  │
│  └──────────────────────────┼─────────────────────────┘  │
└─────────────────────────────┼────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
   ┌───────────┐       ┌───────────┐       ┌───────────┐
   │  Google   │       │  Google   │       │  Dropbox  │
   │  Drive    │       │ Calendar  │       │           │
   └───────────┘       └───────────┘       └───────────┘
```

## Data flow

### Creating an idea

1. User fills form, clicks submit
2. `idea-form.js` collects data, validates via `schemas.js`
3. `db.js` writes to IndexedDB with `pendingSync: true`
4. `tags.js` cache is refreshed
5. If online and provider connected, `sync.js` pushes to remote
6. On success, `pendingSync` flag is cleared

### Syncing

```
                    ┌─────────────┐
                    │  App Start  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ Load from   │
                    │ IndexedDB   │
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │                         │
        ┌─────▼─────┐             ┌─────▼─────┐
        │  Offline  │             │  Online   │
        └─────┬─────┘             └─────┬─────┘
              │                         │
              │                   ┌─────▼─────┐
              │                   │  Fetch    │
              │                   │  Remote   │
              │                   └─────┬─────┘
              │                         │
              │                   ┌─────▼─────┐
              │                   │  Merge    │
              │                   │  Data     │
              │                   └─────┬─────┘
              │                         │
              │                   ┌─────▼─────┐
              │                   │  Push     │
              │                   │  Changes  │
              │                   └─────┬─────┘
              │                         │
              └────────────┬────────────┘
                           │
                    ┌──────▼──────┐
                    │  Display    │
                    │  Ideas      │
                    └─────────────┘
```

### Conflict resolution

Uses last-write-wins based on `updatedAt` timestamp:

```javascript
if (remoteTime > localTime) {
  // Remote wins
  merged.set(remoteIdea.id, remoteIdea);
} else if (localTime > remoteTime) {
  // Local wins, queue for upload
  toUpload.push(localIdea);
}
```

## Storage

### IndexedDB schema

```
scribe (database)
├── ideas (object store)
│   ├── keyPath: id
│   └── indexes:
│       ├── type
│       ├── status
│       ├── createdAt
│       ├── updatedAt
│       └── pendingSync
├── attachments (object store)
│   ├── keyPath: id
│   └── stores: { id, blob }
├── tags (object store)
│   ├── keyPath: name
│   └── indexes: count
└── sync (object store)
    ├── keyPath: key
    └── stores: { key, value }
```

### Attachment storage

Attachments are stored as blobs in IndexedDB:

```javascript
{
  id: "uuid",
  blob: Blob
}
```

Metadata is stored with the parent idea:

```javascript
attachments: [
  {
    id: "uuid",
    filename: "photo.jpg",
    mimeType: "image/jpeg",
    size: 12345,
    localBlobUrl: "blob:...",
    remoteId: "drive-file-id",
    syncStatus: "synced"
  }
]
```

## Components

### idea-list.js

Renders ideas as expandable list items:

```
┌────────────────────────────────────┐
│ 📚  Book Title           queued   │
│     #reading  #2024               │
└────────────────────────────────────┘
         ▼ (click to expand)
┌────────────────────────────────────┐
│ 📚  Book Title           queued ▲ │
│     #reading  #2024               │
├────────────────────────────────────┤
│ Title: [________________]         │
│ Type:  [Book     ▼]  Status: [▼]  │
│ ...form fields...                 │
│                                   │
│ [Delete]           [Cancel] [Save]│
└────────────────────────────────────┘
```

### tag-input.js

Provides autocomplete from existing tags:

```
┌────────────────────────────────────┐
│ [reading] [2024] [type here...  ] │
├────────────────────────────────────┤
│ reading-list (5)                  │
│ reviews (3)                       │
└────────────────────────────────────┘
```

### file-picker.js

Supports drag-drop, click-to-select, and paste:

```
┌────────────────────────────────────┐
│   Drop files here or click to     │
│         select                    │
│                                   │
│  ┌──────┐ ┌──────┐ ┌──────┐      │
│  │ 📷 × │ │ 📄 × │ │ 📎 × │      │
│  └──────┘ └──────┘ └──────┘      │
└────────────────────────────────────┘
```

## Service Worker

### Caching strategy

| Resource | Strategy |
|----------|----------|
| Static assets | Cache-first with background update |
| API calls | Network-first with offline fallback |

### Events handled

- `install`: Pre-cache static assets
- `activate`: Clean old caches
- `fetch`: Serve from cache/network
- `sync`: Background sync when online

## OAuth

Uses PKCE flow for client-side authentication:

```
1. Generate code_verifier (random string)
2. Generate code_challenge (SHA256 hash of verifier)
3. Redirect to auth URL with challenge
4. Receive auth code via redirect
5. Exchange code + verifier for token
6. Store token in localStorage
```

## Mobile considerations

### Viewport

- Uses `100dvh` for proper mobile height
- Touch targets are minimum 44x44px
- Modals slide up from bottom on mobile

### PWA

- Installable via manifest.json
- Share target for receiving shared content
- Offline indicator shows connection status

## Security

### Data isolation

- OAuth tokens stored in localStorage per provider
- OAuth state stored in sessionStorage (expires)
- PKCE prevents token interception

### Input sanitization

All user input is escaped before rendering:

```javascript
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
```

## Performance

### Lazy loading

- Forms are rendered only when panel is expanded
- Attachment blobs are loaded on demand

### Debouncing

- Search input: 300ms debounce
- Tag filter: 300ms debounce
- Sync push: debounced on rapid changes

### Caching

- Tag list cached for 30 seconds
- Service worker caches all static assets
