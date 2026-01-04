package handler

import (
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"

	"corpus/api/internal/config"
	"corpus/api/internal/db"
	appMiddleware "corpus/api/internal/middleware"
	"corpus/api/internal/models"

	"github.com/go-chi/chi/v5"
)

const (
	defaultPage    = 1
	defaultPerPage = 20
	maxPerPage     = 100
)

// ListTexts handles GET /texts requests.
func ListTexts(w http.ResponseWriter, r *http.Request) {
	reqID := appMiddleware.GetRequestID(r.Context())
	page := parseIntParam(r, "page", defaultPage)
	perPage := parseIntParam(r, "per_page", defaultPerPage)

	slog.Debug("list texts request received",
		"request_id", reqID,
		"page", page,
		"per_page", perPage)

	if page < 1 {
		page = defaultPage
	}
	if perPage < 1 {
		perPage = defaultPerPage
	}
	if perPage > maxPerPage {
		perPage = maxPerPage
	}

	rows, total, err := db.ListTexts(r.Context(), page, perPage)
	if err != nil {
		slog.Error("database error listing texts",
			"request_id", reqID,
			"error", err,
			"page", page,
			"per_page", perPage,
			"operation", "ListTexts")
		respondFailure(w, http.StatusInternalServerError, "database error")
		return
	}

	slog.Debug("texts listed successfully",
		"request_id", reqID,
		"page", page,
		"per_page", perPage,
		"total", total)

	texts := make([]models.TextItem, 0, len(rows))
	for _, row := range rows {
		texts = append(texts, models.TextItem{
			ID:         row.ID,
			SourceURL:  row.SourceURL,
			Author:     row.Author.String,
			Title:      row.Title.String,
			Year:       int(row.Year.Int32),
			Genre:      row.Genre.String,
			ChunkCount: row.ChunkCount,
		})
	}

	totalPages := (total + perPage - 1) / perPage

	respondSuccess(w, http.StatusOK, models.TextListResponse{
		Texts:      texts,
		Total:      total,
		Page:       page,
		PerPage:    perPage,
		TotalPages: totalPages,
	})
}

// DeleteText handles DELETE /texts/{id} requests.
func DeleteText(w http.ResponseWriter, r *http.Request) {
	reqID := appMiddleware.GetRequestID(r.Context())
	idStr := chi.URLParam(r, "id")

	slog.Debug("delete text request received",
		"request_id", reqID,
		"text_id", idStr,
		"path", r.URL.Path)

	// Validate ID format
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		slog.Warn("invalid text ID format",
			"request_id", reqID,
			"text_id", idStr,
			"error", err,
			"remote_addr", r.RemoteAddr)
		respondFailure(w, http.StatusBadRequest, "text ID must be a positive integer")
		return
	}

	// Get source_url for this text ID
	sourceURL, err := db.GetSourceURLByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			slog.Warn("text not found for deletion",
				"request_id", reqID,
				"text_id", id)
			respondFailure(w, http.StatusNotFound, "text not found")
			return
		}
		slog.Error("database error getting source_url",
			"request_id", reqID,
			"text_id", id,
			"error", err,
			"operation", "GetSourceURLByID")
		respondFailure(w, http.StatusInternalServerError, "database error")
		return
	}

	// Delete all chunks for this source
	chunksDeleted, err := db.DeleteTextBySourceURL(r.Context(), sourceURL)
	if err != nil {
		slog.Error("database error deleting text",
			"request_id", reqID,
			"text_id", id,
			"error", err,
			"operation", "DeleteTextBySourceURL")
		respondFailure(w, http.StatusInternalServerError, "database error")
		return
	}

	// Handle race condition: text was deleted between lookup and delete
	if chunksDeleted == 0 {
		slog.Warn("text was deleted between lookup and delete (race condition)",
			"request_id", reqID,
			"text_id", id)
		respondFailure(w, http.StatusNotFound, "text not found")
		return
	}

	// Clean up PDF file if this was an uploaded PDF
	// Non-blocking: warnings logged but don't fail the delete operation
	cleanupPDFFile(reqID, sourceURL)

	slog.Info("text deleted successfully",
		"request_id", reqID,
		"text_id", id,
		"chunks_deleted", chunksDeleted)

	respondSuccess(w, http.StatusOK, models.DeleteTextResponse{
		ID:            id,
		SourceURL:     sourceURL,
		ChunksDeleted: chunksDeleted,
		Message:       "text deleted successfully",
	})
}

// parseIntParam extracts an integer query parameter with a default fallback.
func parseIntParam(r *http.Request, key string, defaultVal int) int {
	val := r.URL.Query().Get(key)
	if val == "" {
		return defaultVal
	}
	parsed, err := strconv.Atoi(val)
	if err != nil {
		return defaultVal
	}
	return parsed
}

// isUploadedPDF checks if a source_url represents an uploaded PDF file.
// Uploaded PDFs have source_url as absolute file paths pointing to ./uploads/*.pdf
// Uses canonical path checking to prevent path traversal attacks.
func isUploadedPDF(sourceURL string) bool {
	// Check if it's a file path (not a URL)
	if strings.HasPrefix(sourceURL, "http://") || strings.HasPrefix(sourceURL, "https://") {
		return false
	}

	// Check if it has PDF extension
	if !strings.HasSuffix(strings.ToLower(sourceURL), ".pdf") {
		return false
	}

	// Canonicalize paths to prevent traversal attacks
	absPath, err := filepath.Abs(sourceURL)
	if err != nil {
		return false
	}

	uploadsAbs, err := filepath.Abs(config.UploadPath)
	if err != nil {
		return false
	}

	// Verify the file is within the uploads directory
	return strings.HasPrefix(absPath, uploadsAbs+string(filepath.Separator))
}

// cleanupPDFFile attempts to delete a PDF file if the source_url represents an uploaded PDF.
// This function is non-blocking: it logs warnings for failures but doesn't return errors.
func cleanupPDFFile(requestID, sourceURL string) {
	if !isUploadedPDF(sourceURL) {
		slog.Debug("source is not an uploaded PDF, skipping file cleanup",
			"request_id", requestID,
			"source_url", sourceURL)
		return
	}

	// Check if file is a symlink (use Lstat instead of Stat to not follow symlinks)
	info, err := os.Lstat(sourceURL)
	if err != nil {
		if os.IsNotExist(err) {
			slog.Warn("PDF file already deleted or not found",
				"request_id", requestID,
				"source_url", sourceURL)
		} else {
			slog.Warn("failed to check PDF file status",
				"request_id", requestID,
				"source_url", sourceURL,
				"error", err)
		}
		return
	}

	// Refuse to delete symlinks to prevent deleting files outside uploads directory
	if info.Mode()&os.ModeSymlink != 0 {
		slog.Warn("refusing to delete symlink",
			"request_id", requestID,
			"source_url", sourceURL)
		return
	}

	// Check for hardlinks - refuse to delete files with multiple links
	// This prevents an attacker from hardlinking an uploaded PDF to an important file
	if stat, ok := info.Sys().(*syscall.Stat_t); ok {
		if stat.Nlink > 1 {
			slog.Warn("refusing to delete file with multiple hardlinks",
				"request_id", requestID,
				"source_url", sourceURL,
				"nlink", stat.Nlink)
			return
		}
	}

	// Re-validate path before deletion (TOCTOU protection)
	// File could have been replaced between initial check and this point
	if !isUploadedPDF(sourceURL) {
		slog.Warn("path validation failed on re-check (possible TOCTOU attack)",
			"request_id", requestID,
			"source_url", sourceURL)
		return
	}

	// Attempt to delete the file
	if err := os.Remove(sourceURL); err != nil {
		slog.Warn("failed to delete PDF file",
			"request_id", requestID,
			"source_url", sourceURL,
			"error", err)
		return
	}

	slog.Info("PDF file deleted successfully",
		"request_id", requestID,
		"source_url", sourceURL)
}
