package handler

import (
	"log/slog"
	"net/http"

	"corpus/api/internal/celery"
	appMiddleware "corpus/api/internal/middleware"
	"corpus/api/internal/models"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// IngestStatus handles GET /ingest/status/{id} requests.
func IngestStatus(w http.ResponseWriter, r *http.Request) {
	reqID := appMiddleware.GetRequestID(r.Context())
	jobID := chi.URLParam(r, "id")

	slog.Debug("status check request received",
		"request_id", reqID,
		"job_id", jobID,
		"path", r.URL.Path)

	if jobID == "" {
		respondFailure(w, http.StatusBadRequest, "job ID is required")
		return
	}

	// Validate job ID is a valid UUID
	if _, err := uuid.Parse(jobID); err != nil {
		slog.Warn("invalid job ID format",
			"request_id", reqID,
			"job_id", jobID,
			"error", err,
			"remote_addr", r.RemoteAddr)
		respondFailure(w, http.StatusBadRequest, "job ID must be a valid UUID")
		return
	}

	status, err := celery.GetJobStatus(r.Context(), jobID)
	if err != nil {
		slog.Error("failed to get job status from redis",
			"request_id", reqID,
			"error", err,
			"job_id", jobID,
			"operation", "GetJobStatus")
		respondFailure(w, http.StatusInternalServerError, "failed to get job status")
		return
	}

	response := models.StatusResponse{
		JobID:  jobID,
		Status: status,
	}

	// Include result details if job is complete
	if status == "SUCCESS" || status == "FAILURE" {
		result, err := celery.GetJobResult(r.Context(), jobID)
		if err != nil {
			slog.Warn("failed to get job result details",
				"request_id", reqID,
				"error", err,
				"job_id", jobID,
				"status", status)
		}
		if err == nil && result != nil {
			response.Result = result
		}
	}

	slog.Info("job status retrieved",
		"request_id", reqID,
		"job_id", jobID,
		"status", status)

	respondSuccess(w, http.StatusOK, response)
}
