package models

import "database/sql"

// ============================================================================
// Shared Types
// ============================================================================

// TaskMetadata holds optional text metadata for Celery tasks.
type TaskMetadata struct {
	Author string `json:"author,omitempty"`
	Title  string `json:"title,omitempty"`
	Year   int    `json:"year,omitempty"`
	Genre  string `json:"genre,omitempty"`
}

// IngestMetadata holds optional text metadata from ingest requests.
type IngestMetadata struct {
	Author string `json:"author,omitempty"`
	Title  string `json:"title,omitempty"`
	Year   int    `json:"year,omitempty"`
	Genre  string `json:"genre,omitempty"`
}

// ============================================================================
// Database Row Types
// ============================================================================

// TextRow represents a row from the texts aggregation query.
type TextRow struct {
	ID         int
	SourceURL  string
	Author     sql.NullString
	Title      sql.NullString
	Year       sql.NullInt32
	Genre      sql.NullString
	ChunkCount int
}

// ============================================================================
// API Request Types
// ============================================================================

// IngestRequest is the JSON body for POST /ingest.
type IngestRequest struct {
	SourceURL string          `json:"source_url"`
	Metadata  *IngestMetadata `json:"metadata,omitempty"`
}

// ============================================================================
// API Response Types
// ============================================================================

// IngestResponse is the JSON response for POST /ingest.
type IngestResponse struct {
	JobID   string `json:"job_id,omitempty"`
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
}

// StatusResponse is the JSON response for GET /ingest/status/:id.
type StatusResponse struct {
	JobID  string         `json:"job_id"`
	Status string         `json:"status"`
	Result map[string]any `json:"result,omitempty"`
}

// TextItem represents a single ingested text in the list.
type TextItem struct {
	ID         int    `json:"id"`
	SourceURL  string `json:"source_url"`
	Author     string `json:"author,omitempty"`
	Title      string `json:"title,omitempty"`
	Year       int    `json:"year,omitempty"`
	Genre      string `json:"genre,omitempty"`
	ChunkCount int    `json:"chunk_count"`
}

// TextListResponse is the JSON response for GET /texts.
type TextListResponse struct {
	Texts      []TextItem `json:"texts"`
	Total      int        `json:"total"`
	Page       int        `json:"page"`
	PerPage    int        `json:"per_page"`
	TotalPages int        `json:"total_pages"`
}
