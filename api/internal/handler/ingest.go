package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"corpus/api/internal/celery"
	"corpus/api/internal/db"
	appMiddleware "corpus/api/internal/middleware"
	"corpus/api/internal/models"
)

// maxUploadSize is the maximum allowed request body size (50MB).
const maxUploadSize = 50 << 20

// Ingest handles POST /ingest requests.
func Ingest(w http.ResponseWriter, r *http.Request) {
	reqID := appMiddleware.GetRequestID(r.Context())

	// Limit request body size
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

	req, err := parseIngestRequest(r)
	if err != nil {
		// Check if error is due to request body size limit
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			slog.Warn("request body exceeds size limit",
				"request_id", reqID,
				"max_size", maxUploadSize,
				"remote_addr", r.RemoteAddr)
			respondFailure(w, http.StatusRequestEntityTooLarge, "request body too large")
			return
		}
		slog.Error("failed to parse ingest request",
			"request_id", reqID,
			"error", err,
			"remote_addr", r.RemoteAddr)
		respondFailure(w, http.StatusBadRequest, "invalid JSON request body")
		return
	}

	slog.Debug("ingest request received",
		"request_id", reqID,
		"source_url", req.SourceURL,
		"has_metadata", req.Metadata != nil)

	if err := validateIngestRequest(req); err != nil {
		slog.Warn("invalid ingest request",
			"request_id", reqID,
			"error", err,
			"remote_addr", r.RemoteAddr,
			"has_metadata", req.Metadata != nil)
		respondFailure(w, http.StatusBadRequest, err.Error())
		return
	}

	exists, err := db.SourceExists(r.Context(), req.SourceURL)
	if err != nil {
		slog.Error("database error checking source existence",
			"request_id", reqID,
			"error", err,
			"source_url", req.SourceURL,
			"operation", "SourceExists")
		respondFailure(w, http.StatusInternalServerError, "database error")
		return
	}

	if exists {
		slog.Info("duplicate source URL rejected",
			"request_id", reqID,
			"source_url", req.SourceURL)
		respondFailure(w, http.StatusConflict, "source URL already ingested")
		return
	}

	result, err := queueIngestJob(r.Context(), req)
	if err != nil {
		slog.Error("failed to queue ingest job",
			"request_id", reqID,
			"error", err,
			"source_url", req.SourceURL,
			"source_type", "gutenberg")
		respondFailure(w, http.StatusInternalServerError, "failed to queue job")
		return
	}

	slog.Info("ingest job queued",
		"request_id", reqID,
		"job_id", result.JobID,
		"source_url", req.SourceURL,
		"source_type", "gutenberg")

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

// validateIngestRequest checks required fields and formats.
func validateIngestRequest(req *models.IngestRequest) error {
	// Use shared URL validation
	if err := validateSourceURL(req.SourceURL); err != nil {
		return err
	}

	// Use shared metadata validation
	if req.Metadata != nil {
		metadata := &models.TaskMetadata{
			Author: req.Metadata.Author,
			Title:  req.Metadata.Title,
			Year:   req.Metadata.Year,
			Genre:  req.Metadata.Genre,
		}
		if err := validateMetadata(metadata); err != nil {
			return err
		}
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
