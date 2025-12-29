package handler

import (
	"io"
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

// maxUploadSize is the maximum allowed upload size (50MB).
const maxUploadSize = 50 << 20

// Upload handles POST /upload requests for PDF files.
func Upload(w http.ResponseWriter, r *http.Request) {
	// Limit request body size
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

	// Parse multipart form (max 10MB in memory, rest goes to temp files)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		respondFailure(w, http.StatusBadRequest, "file too large or invalid form data")
		return
	}

	// Get the uploaded file
	file, header, err := r.FormFile("file")
	if err != nil {
		respondFailure(w, http.StatusBadRequest, "file field is required")
		return
	}
	defer file.Close()

	// Validate file extension
	if !strings.HasSuffix(strings.ToLower(header.Filename), ".pdf") {
		respondFailure(w, http.StatusBadRequest, "only PDF files are accepted")
		return
	}

	// Ensure upload directory exists
	if err := os.MkdirAll(config.UploadPath, 0755); err != nil {
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
		respondFailure(w, http.StatusInternalServerError, "failed to save file")
		return
	}
	defer dest.Close()

	// Copy uploaded file to destination
	if _, err := io.Copy(dest, file); err != nil {
		os.Remove(destPath) // Clean up on failure
		respondFailure(w, http.StatusInternalServerError, "failed to save file")
		return
	}

	// Parse optional metadata from form fields
	metadata := parseUploadMetadata(r)

	// Convert to absolute path for worker (worker runs from different cwd)
	absPath, err := filepath.Abs(destPath)
	if err != nil {
		os.Remove(destPath)
		respondFailure(w, http.StatusInternalServerError, "failed to resolve file path")
		return
	}

	// Queue job for processing
	result, err := celery.QueuePDFJob(r.Context(), absPath, metadata)
	if err != nil {
		os.Remove(destPath) // Clean up on failure
		respondFailure(w, http.StatusInternalServerError, "failed to queue job")
		return
	}

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
