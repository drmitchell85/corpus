// Options page script for Corpus extension
// Manages API URL configuration stored in chrome.storage.local

const DEFAULT_API_URL = 'http://localhost:8080';

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('settings-form');
  const apiUrlInput = document.getElementById('api-url');
  const resetBtn = document.getElementById('reset-btn');
  const statusMessage = document.getElementById('status-message');

  // Load current setting on page open; fall back to default if storage fails
  try {
    const result = await chrome.storage.local.get('apiBaseUrl');
    apiUrlInput.value = result.apiBaseUrl || DEFAULT_API_URL;
  } catch {
    apiUrlInput.value = DEFAULT_API_URL;
  }

  function showStatus(type, message) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.hidden = false;
  }

  function clearStatus() {
    statusMessage.hidden = true;
    statusMessage.className = 'status-message';
    statusMessage.textContent = '';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearStatus();

    const url = apiUrlInput.value.trim();
    if (!url) {
      showStatus('error', '✗ URL cannot be empty');
      return;
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      showStatus('error', '✗ Invalid URL format');
      return;
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      showStatus('error', '✗ URL must use http:// or https://');
      return;
    }

    // Only localhost and 127.0.0.1 are covered by the extension's host_permissions.
    // Allowing arbitrary hostnames here would cause silent fetch failures in the
    // background worker — better to reject at save time with a clear message.
    if (!['localhost', '127.0.0.1'].includes(parsed.hostname)) {
      showStatus('error', '✗ Only localhost and 127.0.0.1 are supported as hosts');
      return;
    }

    // Store normalized URL (trailing slash stripped) to keep stored value consistent
    // with what getApiBaseUrl() uses after its own .replace(/\/+$/, '').
    const normalized = url.replace(/\/+$/, '');
    await chrome.storage.local.set({ apiBaseUrl: normalized });
    showStatus('success', '✓ Saved');
  });

  resetBtn.addEventListener('click', async () => {
    clearStatus();
    await chrome.storage.local.remove('apiBaseUrl');
    apiUrlInput.value = DEFAULT_API_URL;
    showStatus('success', '✓ Reset to default');
  });
});
