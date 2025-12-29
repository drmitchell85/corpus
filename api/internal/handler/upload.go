package handler

import (
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"corpus/api/internal/celery"
	"corpus/api/internal/config"
	"corpus/api/internal/models"

	"github.com/google/uuid"
)

// Upload handles POST /upload requests for PDF files.
func Upload(w http.ResponseWriter, r *http.Request) {
	// Limit request body size
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

	// Parse multipart form (max 10MB in memory, rest goes to temp files)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		slog.Error("failed to parse multipart form",
			"error", err,
			"remote_addr", r.RemoteAddr)
		respondFailure(w, http.StatusBadRequest, "file too large or invalid form data")
		return
	}

	// Get the uploaded file
	file, header, err := r.FormFile("file")
	if err != nil {
		slog.Warn("missing file field in upload request",
			"error", err,
			"remote_addr", r.RemoteAddr)
		respondFailure(w, http.StatusBadRequest, "file field is required")
		return
	}
	defer file.Close()

	// Validate file extension
	if !strings.HasSuffix(strings.ToLower(header.Filename), ".pdf") {
		slog.Warn("non-PDF file upload rejected",
			"filename", header.Filename,
			"remote_addr", r.RemoteAddr)
		respondFailure(w, http.StatusBadRequest, "only PDF files are accepted")
		return
	}

	// Ensure upload directory exists
	if err := os.MkdirAll(config.UploadPath, 0755); err != nil {
		slog.Error("failed to create upload directory",
			"error", err,
			"path", config.UploadPath)
		respondFailure(w, http.StatusInternalServerError, "failed to create upload directory")
		return
	}

	// Generate unique filename to avoid collisions
	uniqueID := uuid.New().String()
	safeFilename := uniqueID + ".pdf"
	destPath := filepath.Join(config.UploadPath, safeFilename)

	// Create destination file
	dest, err := os.Create(destPath)
	if err != nil {
		slog.Error("failed to create destination file",
			"error", err,
			"path", destPath,
			"filename", header.Filename)
		respondFailure(w, http.StatusInternalServerError, "failed to save file")
		return
	}
	defer func() {
		if err := dest.Close(); err != nil {
			slog.Error("failed to close destination file",
				"error", err,
				"path", destPath)
		}
	}()

	// Copy uploaded file to destination
	if _, err := io.Copy(dest, file); err != nil {
		slog.Error("failed to copy uploaded file",
			"error", err,
			"path", destPath,
			"filename", header.Filename)
		if err := os.Remove(destPath); err != nil {
			slog.Warn("failed to clean up uploaded file after copy failure",
				"error", err,
				"path", destPath)
		}
		respondFailure(w, http.StatusInternalServerError, "failed to save file")
		return
	}

	// Parse optional metadata from form fields
	metadata := parseUploadMetadata(r)

	// Convert to absolute path for worker (worker runs from different cwd)
	absPath, err := filepath.Abs(destPath)
	if err != nil {
		slog.Error("failed to resolve absolute path",
			"error", err,
			"path", destPath)
		if err := os.Remove(destPath); err != nil {
			slog.Warn("failed to clean up uploaded file after path resolution failure",
				"error", err,
				"path", destPath)
		}
		respondFailure(w, http.StatusInternalServerError, "failed to resolve file path")
		return
	}

	// Queue job for processing
	result, err := celery.QueuePDFJob(r.Context(), absPath, metadata)
	if err != nil {
		slog.Error("failed to queue PDF job",
			"error", err,
			"path", absPath,
			"filename", header.Filename)
		if err := os.Remove(destPath); err != nil {
			slog.Warn("failed to clean up uploaded file after queue failure",
				"error", err,
				"path", destPath)
		}
		respondFailure(w, http.StatusInternalServerError, "failed to queue job")
		return
	}

	slog.Info("PDF upload job queued",
		"job_id", result.JobID,
		"filename", header.Filename,
		"path", absPath)

	respondSuccess(w, http.StatusAccepted, models.UploadResponse{
		JobID:    result.JobID,
		Status:   "queued",
		Message:  "PDF queued for processing",
		Filename: header.Filename,
	})
}

// parseUploadMetadata extracts optional metadata from form fields.
func parseUploadMetadata(r *http.Request) *models.TaskMetadata {
	author := r.FormValue("author")
	title := r.FormValue("title")
	yearStr := r.FormValue("year")
	genre := r.FormValue("genre")

	// Return nil if no metadata provided
	if author == "" && title == "" && yearStr == "" && genre == "" {
		return nil
	}

	var year int
	if yearStr != "" {
		year, _ = strconv.Atoi(yearStr)
	}

	return &models.TaskMetadata{
		Author: author,
		Title:  title,
		Year:   year,
		Genre:  genre,
	}
}
