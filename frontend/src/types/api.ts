// API Types - mirrors Go backend models in api/internal/models/models.go

// ============================================================================
// Shared Types
// ============================================================================

export interface IngestMetadata {
  author?: string;
  title?: string;
  year?: number;
  genre?: string;
}

// ============================================================================
// API Request Types
// ============================================================================

export interface IngestRequest {
  source_url: string;
  metadata?: IngestMetadata;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface IngestResponse {
  job_id?: string;
  status: string;
  message?: string;
}

export interface UploadResponse {
  job_id?: string;
  status: string;
  message?: string;
  filename?: string;
}

export interface StatusResponse {
  job_id: string;
  status: string;
  result?: Record<string, unknown>;
}

export interface TextItem {
  id: number;
  source_url: string;
  author?: string;
  title?: string;
  year?: number;
  genre?: string;
  chunk_count: number;
}

export interface TextListResponse {
  texts: TextItem[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface SearchResult {
  id: number;
  text: string;
  score: number;
  source_url: string;
  author?: string;
  title?: string;
  year?: number;
  genre?: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
}

/**
 * Response from DELETE /texts/:id endpoint
 *
 * Note: Backend uses int64 for ID, TypeScript uses number (IEEE 754 double).
 * Safe for IDs up to 2^53-1 (Number.MAX_SAFE_INTEGER = 9007199254740991).
 */
export interface DeleteTextResponse {
  id: number;
  source_url: string;
  chunks_deleted: number;
  message: string;
}

export interface ErrorResponse {
  status: string;
  message: string;
}

export interface HealthResponse {
  status: string;
}
