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
  const saveBtnLabel = document.getElementById('save-btn-label');

  // Tracks whether a save request is in flight. Guards against double-submission
  // from rapid clicks or programmatic form.requestSubmit() calls.
  let isSaving = false;

  // Load captured content from background on popup open.
  // If there is existing capture data (e.g. from the context menu, Phase 9.4), use it.
  // Otherwise auto-capture the current page (Phase 9.5b: toolbar icon click flow).
  try {
    const response = await sendToBackground({ action: 'GET_CAPTURE' });
    if (response.status === 'ok' && response.capture) {
      capturedData = response.capture;
      setPreviewContent(capturedData.text || '');
      if (capturedData.title) titleInput.value = capturedData.title;
    } else {
      await captureCurrentPage();
    }
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

  /**
   * Auto-capture the current tab's HTML when the popup opens without existing capture data.
   * Called when the user clicks the toolbar icon directly (no pre-stored capture from
   * the context menu flow). Sends CAPTURE_PAGE to the background service worker, which
   * injects a one-shot script into the active tab to read outerHTML and page metadata.
   *
   * Shows a loading state in the preview area while injection runs, then populates
   * the form on success. On failure (restricted page, oversized page, no active tab),
   * displays the error message in the preview area so the user understands what happened.
   * The save button is disabled during capture and re-enabled when done.
   */
  async function captureCurrentPage() {
    setPreviewContent('Capturing page\u2026');
    saveBtn.disabled = true;

    try {
      const captureResponse = await sendToBackground({ action: 'CAPTURE_PAGE' }, 15000);
      if (captureResponse.status !== 'ok') {
        // Restricted page, page too large, no active tab found, etc.
        setPreviewContent(captureResponse.message || 'Could not capture page.');
        return;
      }
      // Capture stored in session — fetch it and populate the form.
      const response = await sendToBackground({ action: 'GET_CAPTURE' });
      if (response.status === 'ok' && response.capture) {
        capturedData = response.capture;
        // Show a clear message if the page had no readable text (image-only pages, etc.)
        if (capturedData.text?.trim()) {
          setPreviewContent(capturedData.text);
        } else {
          setPreviewContent('Page captured. No readable text preview available.');
        }
        if (capturedData.title) titleInput.value = capturedData.title;
      } else {
        setPreviewContent('Could not load captured content.');
      }
    } catch (error) {
      // Log the raw Chrome error for debugging; show a user-friendly message in the UI.
      console.warn('Page capture failed:', error.message);
      setPreviewContent('Could not capture page. Try refreshing and clicking the extension icon again.');
    } finally {
      // Guard against trampling save loading state if a save is somehow in flight.
      if (!isSaving) saveBtn.disabled = false;
    }
  }

  /**
   * Toggle the save button's loading state.
   * Centralises all state mutations: disabled flag, CSS class, and label text.
   * @param {boolean} saving
   */
  function setSaving(saving) {
    saveBtn.disabled = saving;
    saveBtn.classList.toggle('loading', saving);
    saveBtnLabel.textContent = saving ? 'Saving\u2026' : 'Save to Corpus';
  }

  // Save button handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Belt-and-suspenders guard: disabled attribute prevents UI clicks, but this
    // flag blocks any programmatic double-submission (e.g. form.requestSubmit()).
    if (isSaving) return;

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

    let submitted = false;
    isSaving = true;
    setSaving(true);

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
        isSaving = false;
        setSaving(false);
      }
    }
  });

  // Cancel button handler - closes the popup
  cancelBtn.addEventListener('click', () => {
    console.log('Cancel button clicked');
    window.close();
  });

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
