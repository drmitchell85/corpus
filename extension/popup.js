// Popup script for Corpus extension
// Handles UI interaction and communication with background worker

console.log('Corpus popup loaded');

// Holds the capture data loaded from session storage on popup open.
// This is the source of truth for both the preview and the save payload.
let capturedData = null;

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup DOM ready');

  // Get form elements
  const form = document.getElementById('save-form');
  const saveBtn = document.getElementById('save-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const textPreview = document.getElementById('text-preview');
  const titleInput = document.getElementById('title');
  const authorInput = document.getElementById('author');

  // Load captured content from background on popup open
  try {
    const response = await sendToBackground({ action: 'GET_CAPTURE' });
    if (response.status === 'ok' && response.capture) {
      capturedData = response.capture;
      setPreviewContent(capturedData.text || '');
      if (capturedData.title) titleInput.value = capturedData.title;
    }
    // If no capture, the placeholder text remains visible
  } catch (error) {
    // Background may have restarted — not fatal, placeholder stays
    console.warn('Could not load capture from background:', error.message);
  }

  /**
   * Populate the text preview area with captured content.
   * Removes the placeholder element and sets plain text via textContent (XSS-safe).
   *
   * INVARIANT: Always use textContent here, never innerHTML.
   * The preview content comes from untrusted web pages.
   *
   * @param {string} content - Plain text to display
   */
  function setPreviewContent(content) {
    const placeholder = textPreview.querySelector('.placeholder');
    if (placeholder) {
      placeholder.remove();
    }
    textPreview.textContent = content;
  }

  // Save button handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log('Save button clicked');

    const title = titleInput.value.trim();
    const author = authorInput.value.trim();

    // Validate against capturedData (the data model), not the DOM.
    // DOM state can diverge from data (e.g., setPreviewContent('') removes the
    // placeholder but leaves textContent empty), so we validate the source of truth.
    if (!title) {
      alert('Please enter a title');
      return;
    }
    if (!capturedData) {
      alert('No content captured yet. Use the context menu or click the extension icon on a page.');
      return;
    }
    if (!capturedData.text?.trim()) {
      alert('Preview is empty. Content cannot be blank.');
      return;
    }
    if (!capturedData.html) {
      alert('No captured HTML found. Please re-capture the page.');
      return;
    }

    // Disable button to prevent double-submission
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    let submitted = false;

    try {
      const response = await sendToBackground({
        action: 'INGEST_HTML',
        payload: {
          html: capturedData.html,
          ...(capturedData.url && { url: capturedData.url }),
          metadata: {
            title,
            ...(author && { author }),
          },
        },
      });

      if (response.status === 'success') {
        submitted = true;
        // Phase 9.6b will replace this with in-popup success UI
        alert(`✓ Saved to Corpus`);
        window.close();
      } else {
        throw new Error(response.message || 'Save failed');
      }
    } catch (error) {
      console.error('Save error:', error);
      // Phase 9.6b will replace this with in-popup error UI
      alert(`Error: ${error.message}`);
    } finally {
      // Don't re-enable if we already closed — guards against the finally block
      // running after window.close() when Phase 9.6b adds an in-popup success state.
      if (!submitted) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save to Corpus';
      }
    }
  });

  // Cancel button handler - closes the popup
  cancelBtn.addEventListener('click', () => {
    console.log('Cancel button clicked');
    window.close();
  });

  // Phase 9.5 will implement:
  // - Full page HTML capture via content script → stored in chrome.storage.session
  // - Auto-fill title/URL from page metadata
});

/**
 * Send a message to the background service worker with timeout protection.
 * Service workers can hibernate, causing the port to close; the timeout
 * ensures the popup doesn't hang indefinitely.
 *
 * @param {object} message  - Message to send (must include an `action` field)
 * @param {number} timeout  - Timeout in ms (default: 5000)
 * @returns {Promise<object>} Response from background worker
 * @throws {Error} On timeout or if chrome.runtime.lastError is set
 */
async function sendToBackground(message, timeout = 5000) {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(new Error('Background worker timeout — service worker may have restarted'));
    }, timeout);

    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timer);
      // Consume lastError unconditionally — Chrome logs an "Unchecked runtime.lastError"
      // warning if any code path returns without accessing it, including the timedOut path.
      const lastError = chrome.runtime.lastError;
      if (timedOut) return; // Late response after timeout — ignore
      if (lastError) {
        reject(new Error(lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}
