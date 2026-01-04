package handler

import (
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

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
