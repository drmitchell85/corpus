// Background service worker for Corpus extension
// Handles context menu registration and message passing

console.log('Corpus background service worker loaded');

// Configuration
const API_BASE_URL = 'http://localhost:8080';

// Key used in chrome.storage.session to pass captured content to the popup
const CAPTURE_STORAGE_KEY = 'corpus_capture';

// Must match maxHTMLSize in api/internal/handler/ingest_html.go
const MAX_HTML_BYTES = 10 * 1024 * 1024; // 10 MB

// Initialize on install/update — register persistent context menu item.
// Context menu items survive service worker hibernation; they only need to
// be (re-)created when the extension is installed or updated.
chrome.runtime.onInstalled.addListener(() => {
  console.log('Corpus extension installed');

  // Remove all existing items first to prevent "duplicate id" lastError on update.
  // Context menu items persist across service worker restarts and extension updates,
  // so onInstalled would create a duplicate without this guard.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'corpus-save-selection',
      title: 'Save to Corpus',
      contexts: ['selection'],
    });
    if (chrome.runtime.lastError) {
      console.error('Failed to create context menu:', chrome.runtime.lastError.message);
    }
  });
});

// Context menu handler — captures selected text and opens the popup.
// The right-click event counts as a user gesture, satisfying the requirement
// for chrome.action.openPopup() (Chrome 127+).
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'corpus-save-selection') return;

  try {
    // Guard: tab is undefined in rare cases (side panel context, some OS configs).
    if (!tab?.id) {
      console.warn('Context menu: no active tab — cannot capture');
      return;
    }

    // Inject a script into the active tab to read the current selection
    // and page metadata. Requires 'scripting' + 'activeTab' permissions
    // (both already in manifest.json). Throws on restricted pages
    // (chrome://, file://) — but the context menu only appears on web pages.
    const frames = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        text: window.getSelection().toString(),
        title: document.title,
        url: location.href,
      }),
    });
    // executeScript returns an array of InjectionResult (one per matched frame).
    // It can return [] if the page is still loading or the frame is gone.
    const result = frames?.[0]?.result ?? null;

    // info.selectionText is truncated to 255 chars by Chrome — use only as
    // fallback when executeScript returns an empty string (e.g., selection
    // changed between right-click and script execution).
    const text = (result?.text || info.selectionText || '').trim();
    const title = result?.title || '';
    const url = result?.url || '';

    if (!text) {
      console.warn('Context menu: empty selection — nothing to capture');
      return;
    }

    // Wrap the plain-text selection in a minimal HTML document so that the
    // readability-lxml worker can extract and chunk it correctly. An <article>
    // with <h1> gives readability enough structure to identify the content block.
    const html = buildSelectionHTML(text, title);

    // Store in session storage — the popup reads this on open via GET_CAPTURE.
    await chrome.storage.session.set({
      [CAPTURE_STORAGE_KEY]: {
        html,
        text,
        title,
        url,
        timestamp: Date.now(),
      },
    });

    // Open the popup so the user can review content and add metadata.
    // Falls back gracefully: if openPopup() fails (older Chrome, background
    // tab, OS restrictions), the capture is stored and the user can open
    // the popup manually via the toolbar icon.
    try {
      await chrome.action.openPopup();
    } catch (e) {
      console.warn('Could not auto-open popup — open it manually to save:', e.message);
    }
  } catch (error) {
    console.error('Context menu capture failed:', error);
  }
});

/**
 * Wrap a plain-text selection in a minimal HTML document.
 *
 * readability-lxml's Document.summary() works best with recognizable article
 * structure. Multi-paragraph selections (separated by double newlines in the
 * original text) are split into individual <p> elements to preserve structure.
 *
 * @param {string} selectedText - Plain text from window.getSelection()
 * @param {string} pageTitle    - Page title for <title> and <h1>
 * @returns {string} Complete HTML document string
 */
function buildSelectionHTML(selectedText, pageTitle) {
  const safeTitle = escapeHtml(pageTitle || 'Selected Text');

  const paragraphs = selectedText
    .split(/\n{2,}/)
    .map(p => p.trim().replace(/\n/g, ' '))
    .filter(p => p.length > 0);

  // Fallback: if all paragraphs were filtered out (e.g., whitespace-only selection),
  // treat the entire text as one paragraph to avoid an empty <article> body that
  // readability-lxml would discard.
  const content = paragraphs.length > 0 ? paragraphs : [selectedText.replace(/\n/g, ' ').trim()];

  const paragraphHtml = content.map(p => `<p>${escapeHtml(p)}</p>`).join('\n');

  return [
    '<!DOCTYPE html>',
    '<html>',
    `<head><title>${safeTitle}</title></head>`,
    '<body>',
    '<article>',
    `<h1>${safeTitle}</h1>`,
    paragraphHtml,
    '</article>',
    '</body>',
    '</html>',
  ].join('\n');
}

/**
 * Escape special HTML characters to prevent selected text from being
 * interpreted as markup when embedded in the generated HTML document.
 *
 * @param {string} str - Plain text to escape
 * @returns {string} HTML-safe string
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Message handler for popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.action);

  // Reject messages from outside this extension (e.g., other extensions).
  // NOTE: sender.id matches for ALL extension contexts — popup, options page,
  // and content scripts injected into web pages. It does NOT isolate against
  // a content script relaying an attacker-crafted message. Phase 9.5 uses
  // executeScript (one-shot dynamic injection), not persistent content scripts,
  // so this risk surface hasn't changed. If persistent content scripts are added
  // later, validate message.action against an allowlist and enforce payload schema.
  if (sender.id !== chrome.runtime.id) {
    console.warn('Rejected message from unknown sender:', sender.id);
    sendResponse({ status: 'error', message: 'Unauthorized sender' });
    return false;
  }

  // Use async IIFE so we can await inside the synchronous listener
  (async () => {
    try {
      switch (message.action) {
        case 'GET_CAPTURE':
          await handleGetCapture(sendResponse);
          break;
        case 'CAPTURE_PAGE':
          await handleCapturePage(sendResponse);
          break;
        case 'INGEST_HTML':
          await handleIngestHTML(message.payload, sendResponse);
          break;
        default:
          console.warn('Unknown message action:', message.action);
          sendResponse({ status: 'error', message: `Unknown action: ${message.action}` });
      }
    } catch (error) {
      console.error('Message handler error:', error);
      sendResponse({ status: 'error', message: error.message });
    }
  })();

  return true; // Keep channel open for async response
});

/**
 * Return the currently captured page data from session storage.
 * Returns null capture if nothing has been captured yet.
 */
async function handleGetCapture(sendResponse) {
  const result = await chrome.storage.session.get(CAPTURE_STORAGE_KEY);
  const capture = result[CAPTURE_STORAGE_KEY] || null;
  sendResponse({ status: 'ok', capture });
}

/**
 * Capture the full HTML of the currently active tab and store it in session storage.
 *
 * Uses chrome.tabs.query() to find the active tab (requires 'tabs' permission),
 * then injects a one-shot script via executeScript to read outerHTML and metadata.
 * The popup reads this on open via GET_CAPTURE and presents it for user review.
 *
 * The 'text' field is a brief innerText excerpt for popup preview only — the worker
 * extracts clean readable text from 'html' server-side via readability-lxml.
 */
async function handleCapturePage(sendResponse) {
  // Find the currently active tab. 'tabs' permission allows chrome.tabs.query()
  // to return full tab metadata (url, title); without it they're redacted. We get
  // URL/title from executeScript anyway, but tabs makes the API contract explicit.
  // lastFocusedWindow tracks whichever browser window the user most recently used,
  // regardless of which window Chrome considers "current" when this async call runs.
  // More reliable than currentWindow for detached popups and multi-monitor setups.
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];

  if (!tab?.id) {
    sendResponse({ status: 'error', message: 'No active tab found' });
    return;
  }

  // Inject a one-shot script to read the full page HTML and metadata.
  // Throws on restricted pages (chrome://, file://, chrome-extension://) —
  // caught by the outer try/catch in the message handler.
  const frames = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      // outerHTML starts with <html> — the DOCTYPE declaration is not part of any
      // DOM element, so it must be prepended manually for a complete document.
      html: '<!DOCTYPE html>\n' + document.documentElement.outerHTML,
      title: document.title,
      url: location.href,
      // Brief excerpt for popup preview; full text extraction happens server-side.
      // innerText can be slow on large pages but is only called once per capture.
      text: document.body?.innerText?.slice(0, 500) || '',
    }),
  });
  // executeScript returns [] if the page is still loading or the frame is gone.
  const result = frames?.[0]?.result ?? null;

  if (!result?.html) {
    sendResponse({ status: 'error', message: 'Could not capture page content' });
    return;
  }

  // Guard against session storage quota (~10 MB per extension). Full-page outerHTML
  // for complex pages (news sites, SPAs with embedded JSON) can easily exceed this.
  // Use Blob.size for accurate byte count (vs str.length which is UTF-16 code units).
  // This gives a user-friendly error instead of a raw "QUOTA_BYTES quota exceeded".
  const htmlBytes = new Blob([result.html]).size;
  if (htmlBytes > MAX_HTML_BYTES) {
    sendResponse({ status: 'error', message: 'Page too large to capture (exceeds 10 MB)' });
    return;
  }

  // Store in session storage — same schema as selection capture (Phase 9.4).
  // The popup reads this on open via GET_CAPTURE; handleIngestHTML sends html to API.
  await chrome.storage.session.set({
    [CAPTURE_STORAGE_KEY]: {
      html: result.html,
      text: result.text,
      title: result.title || '',
      url: result.url || '',
      timestamp: Date.now(),
    },
  });

  sendResponse({ status: 'ok' });
}

/**
 * POST captured HTML to the Corpus API and clear storage on success.
 *
 * Expected payload shape:
 *   { html: string, url?: string, metadata?: { title: string, author?: string } }
 */
async function handleIngestHTML(payload, sendResponse) {
  if (!payload || typeof payload !== 'object') {
    sendResponse({ status: 'error', message: 'Invalid payload' });
    return;
  }
  const { html, url, metadata } = payload;

  // Guard before fetch: a large POST can outlive the popup's 5s sendToBackground
  // timeout, causing a "timeout" error even though the save succeeds server-side.
  // Use Blob.size for byte count (consistent with handleCapturePage's size check).
  if (!html || new Blob([html]).size > MAX_HTML_BYTES) {
    sendResponse({
      status: 'error',
      message: html ? 'HTML content too large (max 10 MB)' : 'HTML content is required',
    });
    return;
  }

  const body = {
    html,
    ...(url && { url }),
    ...(metadata && { metadata }),
  };

  const result = await callCorpusAPI('/ingest/html', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  // Best-effort clear — don't fail the save if storage cleanup errors
  // (save already succeeded server-side; a failed clear is recoverable)
  try {
    await chrome.storage.session.remove(CAPTURE_STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear capture storage:', e.message);
  }

  sendResponse({
    status: 'success',
    jobId: result?.job_id,
    message: result?.message || 'Queued for processing',
  });
}

/**
 * Make an API call to the Corpus backend.
 *
 * @param {string} endpoint - API endpoint path (e.g., '/ingest/html')
 * @param {object} options  - Fetch options (method, body, headers, etc.)
 * @returns {Promise<object|null>} Parsed JSON response, or null for non-JSON (e.g., 204)
 * @throws {Error} If request fails or response is not OK
 */
async function callCorpusAPI(endpoint, options = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    // Try to extract a message from the error body
    let errMessage = `${response.status} ${response.statusText}`;
    try {
      const errBody = await response.json();
      if (errBody.error) errMessage = errBody.error;
    } catch (_) {
      // Body wasn't JSON — use status text
    }
    throw new Error(`API error: ${errMessage}`);
  }

  // Check content-type before attempting to parse JSON
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return await response.json();
  }

  return null;
}
