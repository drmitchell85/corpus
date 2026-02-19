// Background service worker for Corpus extension
// Handles context menu registration and message passing

console.log('Corpus background service worker loaded');

// Configuration
const API_BASE_URL = 'http://localhost:8080';

// Key used in chrome.storage.session to pass captured content to the popup
const CAPTURE_STORAGE_KEY = 'corpus_capture';

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Corpus extension installed');

  // Context menu registration will be added in Phase 9.4
  // chrome.contextMenus.create({...});
});

// Message handler for popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.action);

  // Reject messages from outside this extension (e.g., other extensions).
  // NOTE: sender.id matches for ALL extension contexts — popup, options page,
  // and content scripts injected into web pages. It does NOT isolate against
  // a content script relaying an attacker-crafted message. When content scripts
  // are added in Phase 9.4/9.5, validate message.action against an allowlist
  // and enforce payload schema before dispatching to handleIngestHTML.
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
 * POST captured HTML to the Corpus API and clear storage on success.
 *
 * Expected payload shape:
 *   { html: string, url?: string, metadata?: { title: string, author?: string } }
 */
// Must match maxHTMLSize in api/internal/handler/ingest_html.go
const MAX_HTML_BYTES = 10 * 1024 * 1024; // 10 MB

async function handleIngestHTML(payload, sendResponse) {
  const { html, url, metadata } = payload;

  // Guard before fetch: a large POST can outlive the popup's 5s sendToBackground
  // timeout, causing a "timeout" error even though the save succeeds server-side.
  if (!html || html.length > MAX_HTML_BYTES) {
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
    jobId: result.job_id,
    message: result.message || 'Queued for processing',
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
