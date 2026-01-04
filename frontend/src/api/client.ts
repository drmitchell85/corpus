import type {
  IngestRequest,
  IngestResponse,
  UploadResponse,
  StatusResponse,
  TextListResponse,
  SearchResponse,
  DeleteTextResponse,
  HealthResponse,
  ErrorResponse,
} from '@/types/api.ts';

const API_BASE = '/api';

// ============================================================================
// Error Handling
// ============================================================================

export class ApiError extends Error {
  status: number;
  statusText: string;
  body?: ErrorResponse;

  constructor(status: number, statusText: string, body?: ErrorResponse) {
    super(body?.message ?? `${status} ${statusText}`);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

export class NetworkError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let body: ErrorResponse | undefined;
    try {
      body = await response.json();
    } catch (err) {
      // Response body wasn't JSON - log in development
      if (import.meta.env.DEV) {
        console.warn('Failed to parse error response as JSON:', err);
      }
    }
    throw new ApiError(response.status, response.statusText, body);
  }

  // Handle 204 No Content explicitly (no body expected)
  if (response.status === 204) {
    // 204 responses should not have a body - return empty object
    // This is safe for the current API which doesn't use 204
    return undefined as T;
  }

  // Parse response body
  const text = await response.text();
  if (!text) {
    // Empty body on non-204 success response - unexpected but handle gracefully
    if (import.meta.env.DEV) {
      console.warn(`Unexpected empty response body for ${response.status} ${response.url}`);
    }
    throw new Error('Empty response body from server');
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    // Response body wasn't valid JSON
    if (import.meta.env.DEV) {
      console.warn('Failed to parse success response as JSON:', err);
    }
    throw new Error('Invalid JSON response from server');
  }
}

// ============================================================================
// API Client Functions
// ============================================================================

/**
 * Health check endpoint
 */
export async function checkHealth(): Promise<HealthResponse> {
  try {
    const response = await fetch(`${API_BASE}/health`);
    return handleResponse<HealthResponse>(response);
  } catch (err) {
    // If handleResponse threw ApiError, re-throw it
    if (err instanceof ApiError) {
      throw err;
    }
    // Otherwise it's a network error (DNS, connection refused, timeout, etc.)
    throw new NetworkError('Network request failed. Check your connection.', err);
  }
}

/**
 * Ingest a text from a URL (Gutenberg, etc.)
 */
export async function ingestUrl(request: IngestRequest): Promise<IngestResponse> {
  try {
    const response = await fetch(`${API_BASE}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    return handleResponse<IngestResponse>(response);
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new NetworkError('Network request failed. Check your connection.', err);
  }
}

/**
 * Upload a PDF file with metadata
 */
export async function uploadPdf(
  file: File,
  metadata?: { author?: string; title?: string; year?: number; genre?: string }
): Promise<UploadResponse> {
  try {
    const formData = new FormData();
    formData.append('file', file);

    if (metadata?.author) formData.append('author', metadata.author);
    if (metadata?.title) formData.append('title', metadata.title);
    if (metadata?.year) formData.append('year', metadata.year.toString());
    if (metadata?.genre) formData.append('genre', metadata.genre);

    const response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse<UploadResponse>(response);
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new NetworkError('Network request failed. Check your connection.', err);
  }
}

/**
 * Check the status of an ingest job
 */
export async function getJobStatus(jobId: string): Promise<StatusResponse> {
  try {
    const response = await fetch(`${API_BASE}/ingest/status/${encodeURIComponent(jobId)}`);
    return handleResponse<StatusResponse>(response);
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new NetworkError('Network request failed. Check your connection.', err);
  }
}

/**
 * List all ingested texts with pagination
 */
export async function listTexts(
  page: number = 1,
  perPage: number = 20
): Promise<TextListResponse> {
  try {
    const params = new URLSearchParams({
      page: page.toString(),
      per_page: perPage.toString(),
    });
    const response = await fetch(`${API_BASE}/texts?${params}`);
    return handleResponse<TextListResponse>(response);
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new NetworkError('Network request failed. Check your connection.', err);
  }
}

/**
 * Search for similar passages
 */
export async function searchTexts(
  query: string,
  limit: number = 10
): Promise<SearchResponse> {
  try {
    const params = new URLSearchParams({
      q: query,
      limit: limit.toString(),
    });
    const response = await fetch(`${API_BASE}/search?${params}`);
    return handleResponse<SearchResponse>(response);
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new NetworkError('Network request failed. Check your connection.', err);
  }
}

/**
 * Delete a text and all its chunks by ID
 *
 * @param id - The text ID (must be a positive integer)
 * @returns Promise resolving to delete confirmation with chunks count
 * @throws {Error} If the ID is not a valid positive integer (client-side validation)
 * @throws {ApiError} If the text is not found (404) or server error (500)
 * @throws {NetworkError} If the network request fails
 */
export async function deleteText(id: number): Promise<DeleteTextResponse> {
  // Validate ID is a safe positive integer
  // Number.isSafeInteger() checks both isInteger and range [-2^53+1, 2^53-1]
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('Invalid text ID: must be a positive integer');
  }

  try {
    const response = await fetch(`${API_BASE}/texts/${id}`, {
      method: 'DELETE',
    });
    return handleResponse<DeleteTextResponse>(response);
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new NetworkError('Network request failed. Check your connection.', err);
  }
}
