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

// maxHTMLSize is the maximum allowed HTML content size (10MB).
// This matches the MAX_HTML_SIZE limit in workers/html_extractor.py
const maxHTMLSize = 10 << 20

// IngestHTML handles POST /ingest/html requests.
func IngestHTML(w http.ResponseWriter, r *http.Request) {
	reqID := appMiddleware.GetRequestID(r.Context())

	// P2-2: Limit request body size to maxHTMLSize (not maxUploadSize)
	r.Body = http.MaxBytesReader(w, r.Body, maxHTMLSize)

	req, err := parseIngestHTMLRequest(r)
	if err != nil {
		// Check if error is due to request body size limit
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			slog.Warn("HTML request body exceeds size limit",
				"request_id", reqID,
				"max_size", maxHTMLSize,
				"remote_addr", r.RemoteAddr)
			respondFailure(w, http.StatusRequestEntityTooLarge, "request body too large")
			return
		}
		slog.Error("failed to parse HTML ingest request",
			"request_id", reqID,
			"error", err,
			"remote_addr", r.RemoteAddr)
		respondFailure(w, http.StatusBadRequest, "invalid JSON request body")
		return
	}

	slog.Debug("HTML ingest request received",
		"request_id", reqID,
		"html_length", len(req.HTML),
		"has_url", req.SourceURL != "",
		"has_metadata", req.Metadata != nil)

	if err := validateIngestHTMLRequest(req); err != nil {
		slog.Warn("invalid HTML ingest request",
			"request_id", reqID,
			"error", err,
			"remote_addr", r.RemoteAddr,
			"html_length", len(req.HTML))
		respondFailure(w, http.StatusBadRequest, err.Error())
		return
	}

	// P2-3: Implement upsert behavior - delete existing chunks if URL exists
	isUpsert := false
	if req.SourceURL != "" {
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
			// Delete existing content to allow update
			deletedCount, err := db.DeleteTextBySourceURL(r.Context(), req.SourceURL)
			if err != nil {
				slog.Error("failed to delete existing content for URL",
					"request_id", reqID,
					"error", err,
					"source_url", req.SourceURL)
				respondFailure(w, http.StatusInternalServerError, "failed to update existing content")
				return
			}

			slog.Info("replacing existing content for URL",
				"request_id", reqID,
				"source_url", req.SourceURL,
				"chunks_deleted", deletedCount)
			isUpsert = true
		}
	}

	result, err := queueHTMLJob(r.Context(), req)
	if err != nil {
		slog.Error("failed to queue HTML job",
			"request_id", reqID,
			"error", err,
			"html_length", len(req.HTML))
		respondFailure(w, http.StatusInternalServerError, "failed to queue job")
		return
	}

	slog.Info("HTML job queued",
		"request_id", reqID,
		"job_id", result.JobID,
		"html_length", len(req.HTML),
		"has_url", req.SourceURL != "",
		"upsert", isUpsert)

	respondSuccess(w, http.StatusAccepted, models.IngestHTMLResponse{
		JobID:   result.JobID,
		Status:  "queued",
		Message: "HTML job queued for processing",
	})
}

// parseIngestHTMLRequest decodes the JSON request body.
func parseIngestHTMLRequest(r *http.Request) (*models.IngestHTMLRequest, error) {
	var req models.IngestHTMLRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return nil, err
	}
	return &req, nil
}

// validateIngestHTMLRequest checks required fields and size limits.
func validateIngestHTMLRequest(req *models.IngestHTMLRequest) error {
	if req.HTML == "" {
		return &validationError{"html is required"}
	}

	// Defense in depth: validate HTML size at API level too
	// (worker also validates, but catching it here provides better UX)
	if len(req.HTML) > maxHTMLSize {
		return &validationError{"html content too large (max 10MB)"}
	}

	// P1-1: Validate source URL if provided (SSRF protection)
	if req.SourceURL != "" {
		if err := validateSourceURL(req.SourceURL); err != nil {
			return err
		}
	}

	// P2-5: Validate metadata field lengths
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

// queueHTMLJob sends the HTML job to Celery.
func queueHTMLJob(ctx context.Context, req *models.IngestHTMLRequest) (*celery.QueueResult, error) {
	var metadata *models.TaskMetadata
	if req.Metadata != nil {
		metadata = &models.TaskMetadata{
			Author: req.Metadata.Author,
			Title:  req.Metadata.Title,
			Year:   req.Metadata.Year,
			Genre:  req.Metadata.Genre,
		}
	}

	return celery.QueueHTMLJob(ctx, req.HTML, req.SourceURL, metadata)
}
