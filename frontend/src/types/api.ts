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

export interface ErrorResponse {
  status: string;
  message: string;
}

export interface HealthResponse {
  status: string;
}
