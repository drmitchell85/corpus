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

  // Message handling will be implemented in later phases
  // For now, just acknowledge receipt
  sendResponse({ status: 'received' });

  return true; // Keep channel open for async response
});

// Helper function for API calls (to be used in later phases)
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
