# Browser Extension Feature - Planning Document

## Goal

Add a browser extension to enable organic corpus building while browsing. Users should be able to save relevant content directly from their browser without manually copying/pasting.

## Requirements

### Core Features
- **Right-click context menu**: Save selected text from any webpage
- **Full page capture**: Button to save entire article with automatic content extraction
- **Metadata capture**: Automatically collect URL, title, timestamp, source domain
- **API integration**: Send captured content to `POST /ingest/html` endpoint
- Tag/categorize texts before saving

### Technical Constraints
- Use **Manifest V3** (Chrome, Firefox, Edge compatible)
- **New `POST /ingest/html` endpoint** for raw HTML/text ingestion (extension captures content directly)
- Follow existing architecture patterns (API → Redis → Workers → DuckDB)
- Store extension code in `/extension` directory at repo root

## Technical Approach

### Architecture
```
Browser Extension (background.js)
    ↓ HTTP POST to localhost:8080/ingest/html
Go API (new endpoint)
    ↓ Queue task
Redis + Celery Workers (process_html task)
    ↓ Extract text (readability), chunk, embed, store
DuckDB
```

### File Structure
```
extension/
```

### Data Format

**Important:** Title and author are **user-provided via extension popup**, not auto-extracted. The worker's HTML extraction is a fallback mechanism only if metadata is not provided.

**Data flow:**
1. Extension captures HTML from page
2. User reviews content in popup and **edits metadata** (title, author, tags)
3. Extension sends user-edited metadata + HTML to `/ingest/html`
4. Worker extracts text from HTML (uses user's title/author if provided)

Extension sends to `/ingest/html` endpoint:
```json
{
  "html": "<html>...</html>",
  "url": "https://example.com/article",
  "metadata": {
    "author": "Jane Doe",           // User-edited in popup
    "title": "Article Title",        // User-edited in popup
    "tags": ["philosophy", "community"]
  }
}
```

**Upsert behavior:** If the same URL is submitted again, existing chunks are deleted and replaced with new content. This allows users to update saved pages.

### Key Technologies
- **Manifest V3**: Modern extension standard
- **Chrome Extension APIs**: `chrome.runtime`, `chrome.contextMenus`, `chrome.tabs`
- **Mozilla Readability**: Article extraction for full page capture
- **Fetch API**: HTTP requests to Go backend

## Success Criteria

✅ User can right-click selected text and save to Corpus
✅ User can save full articles with one click
✅ Extension works in Chrome
✅ Metadata (URL, title, timestamp) automatically captured
✅ Extension appears and functions in `chrome://extensions/`

## Notes

- Keep extension simple initially - complexity can be added iteratively
- Focus on integration with existing system rather than building new features
- The extension is a client, not a replacement for the web frontend