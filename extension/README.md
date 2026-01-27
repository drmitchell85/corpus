# Corpus Browser Extension

Chrome/Edge browser extension for saving web content to your Corpus knowledge base.

## Development Setup

### Load Extension in Chrome

1. Open `chrome://extensions/` in Chrome/Edge
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `/extension` directory from this repository

### Verify Installation

- Extension should appear in extensions toolbar
- Click the extension icon to see the popup (currently shows placeholder message)
- Check `chrome://extensions/` for any errors

## Architecture

### Manifest V3 Components

- **manifest.json** - Extension configuration and permissions
- **background.js** - Service worker (handles API calls and context menu)
- **popup.html/js/css** - Extension popup UI
- **icons/** - Extension icons (16px, 48px, 128px)

### API Integration

- Extension communicates with Corpus API at `http://localhost:8080`
- API base URL configured in `background.js`

## Development Status

### Phase 9.1: Extension Scaffold ✓
- [x] Directory structure created
- [x] Manifest V3 configuration
- [x] Background service worker shell
- [x] Popup HTML/JS/CSS structure
- [x] Placeholder icons (16, 48, 128px)
- [x] Loads in `chrome://extensions/`

### Phase 9.2: Popup UI — Save Form (Planned)
- Text preview area
- Title, author, tags input fields
- Save/cancel buttons
- Corpus aesthetic styling

### Phase 9.3: Context Menu — Selection Capture (Planned)
- "Save to Corpus" context menu for selected text
- Selection extraction and storage
- Popup pre-fill with selected text

### Phase 9.4: Backend — HTML Extraction (Planned)
- Server-side HTML parsing with readability
- `/ingest/html` endpoint

### Phase 9.5: Full Page Capture (Planned)
- Capture entire page HTML
- Auto-populate title/URL metadata

### Phase 9.6: Polish & Error Handling (Planned)
- Loading states
- Success/error messages
- Offline handling

## Testing

1. Make changes to extension files
2. Go to `chrome://extensions/`
3. Click the reload icon for Corpus extension
4. Test functionality

## Debugging

### Inspect Popup Console

1. Right-click the Corpus extension icon in the toolbar
2. Select "Inspect popup" from the context menu
3. DevTools will open showing the popup's console, DOM, and network activity
4. Note: The popup closes when you click away, which also closes DevTools

### Inspect Service Worker Console

1. Navigate to `chrome://extensions/`
2. Find the Corpus extension card
3. Click "Inspect views: service worker" link
4. DevTools will open showing background.js console output and errors
5. Service worker console persists even when worker is inactive

### View chrome.storage Data

1. Open either popup or service worker DevTools
2. Go to the "Application" tab (or "Storage" in some Chrome versions)
3. Expand "Storage" in the left sidebar
4. Select "Session Storage" or "Local Storage" to view extension data
5. Useful for debugging data flow between popup and background worker

### Common Issues

- **Service worker not responding**: Worker may have hibernated. Check if it shows "inactive" on `chrome://extensions/`. Click "Inspect" to wake it.
- **Changes not taking effect**: Always reload the extension after code changes (reload button on extension card).
- **Popup closes immediately**: This is expected when clicking outside. Use "right-click → Inspect popup" to keep it open.
- **Global variables reset**: Service workers don't persist state. Always use `chrome.storage` for data that needs to survive worker hibernation (~30 seconds of inactivity).

## Notes

### Service Worker Lifecycle

Service workers behave differently from the old persistent background pages:

- **Hibernation**: Workers automatically hibernate after ~30 seconds of inactivity to save resources
- **State Loss**: All global variables reset when the worker wakes up from hibernation
- **Event-Driven**: Workers wake on events (messages, alarms, context menu clicks) and process them, then may hibernate again
- **No Persistent State**: NEVER rely on global variables for state that needs to persist

**Storage Guidelines:**
- Use `chrome.storage.session` for temporary data (e.g., selected text waiting for popup to open)
- Use `chrome.storage.local` for persistent extension settings (e.g., custom API URL)
- Session storage clears when browser closes; local storage persists indefinitely

### Permissions

Current permissions will expand in future phases:
- Phase 9.5 will add `tabs` permission for full-page capture (`chrome.tabs.query()`)
- Phase 9.6 will make API URL configurable (may add options page)
