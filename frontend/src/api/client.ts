import type {
  IngestRequest,
  IngestResponse,
  UploadResponse,
  StatusResponse,
  TextListResponse,
  SearchResponse,
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

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let body: ErrorResponse | undefined;
    try {
      body = await response.json();
    } catch {
      // Response body wasn't JSON
    }
    throw new ApiError(response.status, response.statusText, body);
  }
  return response.json();
}

// ============================================================================
// API Client Functions
// ============================================================================

/**
 * Health check endpoint
 */
export async function checkHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/health`);
  return handleResponse<HealthResponse>(response);
}

/**
 * Ingest a text from a URL (Gutenberg, etc.)
 */
export async function ingestUrl(request: IngestRequest): Promise<IngestResponse> {
  const response = await fetch(`${API_BASE}/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse<IngestResponse>(response);
}

/**
 * Upload a PDF file with metadata
 */
export async function uploadPdf(
  file: File,
  metadata?: { author?: string; title?: string; year?: number; genre?: string }
): Promise<UploadResponse> {
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
}

/**
 * Check the status of an ingest job
 */
export async function getJobStatus(jobId: string): Promise<StatusResponse> {
  const response = await fetch(`${API_BASE}/ingest/status/${encodeURIComponent(jobId)}`);
  return handleResponse<StatusResponse>(response);
}

/**
 * List all ingested texts with pagination
 */
export async function listTexts(
  page: number = 1,
  perPage: number = 20
): Promise<TextListResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    per_page: perPage.toString(),
  });
  const response = await fetch(`${API_BASE}/texts?${params}`);
  return handleResponse<TextListResponse>(response);
}

/**
 * Search for similar passages
 */
export async function searchTexts(
  query: string,
  limit: number = 10
): Promise<SearchResponse> {
  const params = new URLSearchParams({
    q: query,
    limit: limit.toString(),
  });
  const response = await fetch(`${API_BASE}/search?${params}`);
  return handleResponse<SearchResponse>(response);
}
