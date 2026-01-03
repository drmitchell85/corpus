package handler

import (
	"log/slog"
	"net/http"
	"unicode/utf8"

	"corpus/api/internal/db"
	"corpus/api/internal/embed"
	appMiddleware "corpus/api/internal/middleware"
	"corpus/api/internal/models"
)

const (
	defaultSearchLimit = 10
	maxSearchLimit     = 100
	minQueryLength     = 1
	maxQueryLength     = 1000
)

// Search handles GET /search requests.
func Search(w http.ResponseWriter, r *http.Request) {
	reqID := appMiddleware.GetRequestID(r.Context())
	query := r.URL.Query().Get("q")
	limit := parseIntParam(r, "limit", defaultSearchLimit)

	slog.Debug("search request received",
		"request_id", reqID,
		"query_length", len(query),
		"limit", limit)

	if query == "" {
		slog.Warn("search request missing query parameter",
			"request_id", reqID,
			"remote_addr", r.RemoteAddr)
		respondFailure(w, http.StatusBadRequest, "query parameter 'q' is required")
		return
	}

	// Validate query length (character count, not byte count)
	queryLen := utf8.RuneCountInString(query)
	if queryLen < minQueryLength || queryLen > maxQueryLength {
		slog.Warn("search query length out of range",
			"request_id", reqID,
			"query_length", queryLen,
			"min", minQueryLength,
			"max", maxQueryLength,
			"remote_addr", r.RemoteAddr)
		respondFailure(w, http.StatusBadRequest, "query must be between 1 and 1000 characters")
		return
	}

	if limit < 1 {
		limit = defaultSearchLimit
	}
	if limit > maxSearchLimit {
		limit = maxSearchLimit
	}

	// Get embedding from Python service
	embedding, err := embed.GetEmbedding(r.Context(), query)
	if err != nil {
		slog.Error("embedding service error",
			"request_id", reqID,
			"error", err,
			"query_length", len(query),
			"operation", "GetEmbedding")
		respondFailure(w, http.StatusServiceUnavailable, "embedding service unavailable")
		return
	}

	// Perform vector similarity search
	rows, err := db.SearchTexts(r.Context(), embedding, limit)
	if err != nil {
		slog.Error("database search error",
			"request_id", reqID,
			"error", err,
			"query_length", len(query),
			"limit", limit,
			"operation", "SearchTexts")
		respondFailure(w, http.StatusInternalServerError, "search failed")
		return
	}

	results := make([]models.SearchResult, 0, len(rows))
	for _, row := range rows {
		results = append(results, models.SearchResult{
			ID:        row.ID,
			Text:      row.Text,
			Score:     row.Score,
			SourceURL: row.SourceURL,
			Author:    row.Author.String,
			Title:     row.Title.String,
			Year:      int(row.Year.Int32),
			Genre:     row.Genre.String,
		})
	}

	slog.Info("search completed",
		"request_id", reqID,
		"query_length", len(query),
		"result_count", len(results),
		"limit", limit)

	respondSuccess(w, http.StatusOK, models.SearchResponse{
		Query:   query,
		Results: results,
		Total:   len(results),
	})
}
