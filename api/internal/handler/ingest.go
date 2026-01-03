package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/url"

	"corpus/api/internal/celery"
	"corpus/api/internal/db"
	"corpus/api/internal/models"
)

// maxUploadSize is the maximum allowed request body size (50MB).
const maxUploadSize = 50 << 20

// Ingest handles POST /ingest requests.
func Ingest(w http.ResponseWriter, r *http.Request) {
	// Limit request body size
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

	req, err := parseIngestRequest(r)
	if err != nil {
		// Check if error is due to request body size limit
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			slog.Warn("request body exceeds size limit",
				"max_size", maxUploadSize,
				"remote_addr", r.RemoteAddr)
			respondFailure(w, http.StatusRequestEntityTooLarge, "request body too large")
			return
		}
		slog.Error("failed to parse ingest request",
			"error", err,
			"remote_addr", r.RemoteAddr)
		respondFailure(w, http.StatusBadRequest, "invalid JSON request body")
		return
	}

	if err := validateIngestRequest(req); err != nil {
		slog.Warn("invalid ingest request",
			"error", err,
			"remote_addr", r.RemoteAddr,
			"has_metadata", req.Metadata != nil)
		respondFailure(w, http.StatusBadRequest, err.Error())
		return
	}

	exists, err := db.SourceExists(r.Context(), req.SourceURL)
	if err != nil {
		slog.Error("database error checking source existence",
			"error", err,
			"source_url", req.SourceURL,
			"operation", "SourceExists")
		respondFailure(w, http.StatusInternalServerError, "database error")
		return
	}

	if exists {
		slog.Info("duplicate source URL rejected",
			"source_url", req.SourceURL)
		respondFailure(w, http.StatusConflict, "source URL already ingested")
		return
	}

	result, err := queueIngestJob(r.Context(), req)
	if err != nil {
		slog.Error("failed to queue ingest job",
			"error", err,
			"source_url", req.SourceURL,
			"source_type", "gutenberg")
		respondFailure(w, http.StatusInternalServerError, "failed to queue job")
		return
	}

	slog.Info("ingest job queued",
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
	if req.SourceURL == "" {
		return &validationError{"source_url is required"}
	}

	// Validate URL format
	parsedURL, err := url.Parse(req.SourceURL)
	if err != nil {
		return &validationError{"source_url is not a valid URL"}
	}

	// Ensure URL has http or https scheme
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return &validationError{"source_url must use http or https scheme"}
	}

	// Ensure URL has a host
	if parsedURL.Host == "" {
		return &validationError{"source_url must have a valid host"}
	}

	// Block internal/private network addresses (SSRF protection)
	if isInternalHost(parsedURL.Host) {
		return &validationError{"source_url must not reference internal or private network addresses"}
	}

	return nil
}

// isInternalHost checks if a host is internal/private (SSRF protection).
func isInternalHost(host string) bool {
	// Strip port if present
	hostname := host
	if h, _, err := net.SplitHostPort(host); err == nil {
		hostname = h
	}

	// Check for localhost variants
	if hostname == "localhost" || hostname == "" {
		return true
	}

	// Parse IP and check private ranges
	ip := net.ParseIP(hostname)
	if ip == nil {
		// Not an IP address - could be a hostname that resolves to internal IP
		// For now, allow hostnames (DNS resolution happens at request time)
		// A more strict approach would resolve DNS here, but that's blocking
		return false
	}

	// Block loopback (127.0.0.0/8), private (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16),
	// and link-local (169.254.0.0/16) addresses
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast()
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
