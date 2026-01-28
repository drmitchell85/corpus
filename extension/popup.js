// Popup script for Corpus extension
// Handles UI interaction and communication with background worker

console.log('Corpus popup loaded');

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  console.log('Popup DOM ready');

  // Get form elements
  const form = document.getElementById('save-form');
  const saveBtn = document.getElementById('save-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const textPreview = document.getElementById('text-preview');
  const titleInput = document.getElementById('title');
  const authorInput = document.getElementById('author');
  const tagsInput = document.getElementById('tags');

  // Phase 9.3c will implement:
  // - Load selected text from chrome.storage.session
  // - Populate form fields with captured content using setPreviewContent()
  // - Send message to background worker on save

  /**
   * Helper function to populate the text preview area
   * Removes placeholder element and sets new content
   *
   * @param {string} content - Text content to display (plain text, not HTML)
   *
   * NOTE: This function is for Phase 9.3c/9.4/9.5 implementation.
   * It ensures the .placeholder element is properly removed before setting content,
   * which is required for validation to work correctly.
   *
   * Usage in Phase 9.3c:
   *   setPreviewContent(extractedText);  // After loading from chrome.storage
   */
  function setPreviewContent(content) {
    // Remove placeholder element if it exists
    const placeholder = textPreview.querySelector('.placeholder');
    if (placeholder) {
      placeholder.remove();
    }

    // Set new content (plain text for display)
    textPreview.textContent = content;
  }

  // Make helper available for future phases (Phase 9.3c will call this)
  window.setPreviewContent = setPreviewContent;

  // Save button handler (Phase 9.3c will connect to background)
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log('Save button clicked');

    // Get form data
    // NOTE: formData.text is for display/validation only.
    // The actual HTML payload sent to API comes from chrome.storage.session (Phase 9.3c).
    // Architecture: Content Script → captures HTML → storage → Background Worker → API
    //               Popup only displays extracted text preview for user confirmation.
    const formData = {
      title: titleInput.value.trim(),
      author: authorInput.value.trim(),
      tags: tagsInput.value.trim(),
      text: textPreview.textContent.trim(),  // Display text for validation
    };

    // Validate required fields BEFORE disabling button
    // This prevents button staying disabled if validation fails
    if (!formData.title) {
      alert('Please enter a title');
      return;
    }

    // Check if placeholder element still exists (more robust than string comparison)
    // IMPORTANT FOR PHASE 9.3c: When loading content, you MUST remove the <p class="placeholder">
    // element from the DOM. Use the setPreviewContent() helper function defined below.
    if (textPreview.querySelector('.placeholder')) {
      alert('No content captured yet. Use the context menu or click the extension icon on a page.');
      return;
    }

    // Check if preview content is empty (user manually cleared it)
    if (!formData.text) {
      alert('Preview is empty. Content cannot be blank.');
      return;
    }

    console.log('Form data:', formData);

    // Validation passed - now disable button to prevent double-submission
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      // Phase 9.3c will implement:
      // - Send to background worker via sendToBackground()
      // - Background worker calls POST /ingest/html
      // - Show success/error feedback

      alert('Save functionality will be implemented in Phase 9.3c');
    } catch (error) {
      console.error('Save error:', error);
      alert(`Error: ${error.message}`);
    } finally {
      // Re-enable button
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save to Corpus';
    }
  });

  // Cancel button handler - closes the popup
  cancelBtn.addEventListener('click', () => {
    console.log('Cancel button clicked');
    window.close();
  });

  // Phase 9.4 will implement:
  // - Load text from chrome.storage.session (context menu selection)
  // - Auto-populate title from page metadata

  // Phase 9.5 will implement:
  // - Full page HTML capture
  // - Extract title/author automatically
  // - Pre-fill form with extracted data
});

/**
 * Helper function to send messages to background worker
 * Service workers can hibernate, so we add timeout protection
 *
 * @param {object} message - Message object to send to background worker
 * @param {number} timeout - Timeout in milliseconds (default: 5000ms)
 * @returns {Promise<object>} - Response from background worker
 * @throws {Error} - If timeout occurs or chrome.runtime.lastError is set
 *
 * NOTE: This function is prepared for Phase 9.3c integration.
 * Currently not called by the save handler (which shows a placeholder alert).
 */
async function sendToBackground(message, timeout = 5000) {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(new Error('Background worker timeout - service worker may have restarted'));
    }, timeout);

    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timer);
      if (timedOut) return; // Timeout already fired, ignore late response
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}
