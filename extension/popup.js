// Popup script for Corpus extension
// Handles UI interaction and communication with background worker

console.log('Corpus popup loaded');

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  console.log('Popup DOM ready');

  // Phase 9.2 will implement:
  // - Load selected text from chrome.storage.session
  // - Populate form fields
  // - Handle save button click
  // - Send message to background worker

  // Phase 9.5 will implement:
  // - Full page capture trigger
  // - Auto-populate title and URL
});

// Helper function to send messages to background worker
// Service workers can hibernate, so we add timeout protection
async function sendToBackground(message, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Background worker timeout - service worker may have restarted'));
    }, timeout);

    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}
