// Background service worker for Corpus extension
// Handles context menu registration and message passing

console.log('Corpus background service worker loaded');

// Configuration
const API_BASE_URL = 'http://localhost:8080';

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Corpus extension installed');

  // Context menu registration will be added in Phase 9.3
  // chrome.contextMenus.create({...});
});

// Message handler for popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);

  // Use async IIFE pattern to handle async operations properly
  // This keeps the message channel open while the async work completes
  try {
    (async () => {
      try {
        // Message routing will be implemented in later phases
        // For now, echo back the received message
        sendResponse({ status: 'received', echo: message });
      } catch (error) {
        console.error('Message handler error:', error);
        sendResponse({ status: 'error', message: error.message });
      }
    })();
  } catch (error) {
    // Extremely rare: only if IIFE creation itself fails
    console.error('Message handler setup error:', error);
    sendResponse({ status: 'error', message: error.message });
  }

  return true; // Keep channel open for async response
});

/**
 * Make an API call to the Corpus backend
 * @param {string} endpoint - API endpoint path (e.g., '/ingest/html')
 * @param {object} options - Fetch options (method, body, headers, etc.)
 * @returns {Promise<object|null>} - Parsed JSON response, or null for non-JSON responses (e.g., 204 No Content)
 * @throws {Error} - If request fails or response is not OK
 */
async function callCorpusAPI(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    // Check content-type before attempting to parse JSON
    // Handles 204 No Content and non-JSON responses gracefully
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }

    return null;
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}
