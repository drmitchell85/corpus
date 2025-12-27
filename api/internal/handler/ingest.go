package handler

import (
	"context"
	"encoding/json"
	"net/http"

	"corpus/api/internal/celery"
	"corpus/api/internal/db"
	"corpus/api/internal/models"
)

// Ingest handles POST /ingest requests.
func Ingest(w http.ResponseWriter, r *http.Request) {
	req, err := parseIngestRequest(r)
	if err != nil {
		respondFailure(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := validateIngestRequest(req); err != nil {
		respondFailure(w, http.StatusBadRequest, err.Error())
		return
	}

	exists, err := db.SourceExists(r.Context(), req.SourceURL)
	if err != nil {
		respondFailure(w, http.StatusInternalServerError, "database error")
		return
	}

	if exists {
		respondFailure(w, http.StatusConflict, "source URL already ingested")
		return
	}

	result, err := queueIngestJob(r.Context(), req)
	if err != nil {
		respondFailure(w, http.StatusInternalServerError, "failed to queue job")
		return
	}

	respondSuccess(w, http.StatusAccepted, models.IngestResponse{
		JobID:   result.JobID,
		Status:  "queued",
		Message: "job queued for processing",
	})
}

// parseIngestRequest decodes the JSON request body.
func parseIngestRequest(r *http.Request) (*models.IngestRequest, error) {
	var req models.IngestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return nil, err
	}
	return &req, nil
}

// validateIngestRequest checks required fields.
func validateIngestRequest(req *models.IngestRequest) error {
	if req.SourceURL == "" {
		return &validationError{"source_url is required"}
	}
	return nil
}

// queueIngestJob sends the job to Celery.
func queueIngestJob(ctx context.Context, req *models.IngestRequest) (*celery.QueueResult, error) {
	var metadata *models.TaskMetadata
	if req.Metadata != nil {
		metadata = &models.TaskMetadata{
			Author: req.Metadata.Author,
			Title:  req.Metadata.Title,
			Year:   req.Metadata.Year,
			Genre:  req.Metadata.Genre,
		}
	}

	return celery.QueueTextJob(ctx, "gutenberg", req.SourceURL, metadata)
}

// validationError is a simple error type for validation failures.
type validationError struct {
	msg string
}

func (e *validationError) Error() string {
	return e.msg
}
