package models

// TaskMetadata holds optional text metadata.
type TaskMetadata struct {
	Author string `json:"author,omitempty"`
	Title  string `json:"title,omitempty"`
	Year   int    `json:"year,omitempty"`
	Genre  string `json:"genre,omitempty"`
}

// IngestMetadata holds optional text metadata.
type IngestMetadata struct {
	Author string `json:"author,omitempty"`
	Title  string `json:"title,omitempty"`
	Year   int    `json:"year,omitempty"`
	Genre  string `json:"genre,omitempty"`
}

// IngestRequest is the JSON body for POST /ingest.
type IngestRequest struct {
	SourceURL string          `json:"source_url"`
	Metadata  *IngestMetadata `json:"metadata,omitempty"`
}

// IngestResponse is the JSON response for POST /ingest.
type IngestResponse struct {
	JobID   string `json:"job_id,omitempty"`
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
}
