package handler

import (
	"log/slog"
	"net/http"
	"unicode/utf8"

	"corpus/api/internal/db"
	"corpus/api/internal/embed"
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
	query := r.URL.Query().Get("q")
	if query == "" {
		slog.Warn("search request missing query parameter",
			"remote_addr", r.RemoteAddr)
		respondFailure(w, http.StatusBadRequest, "query parameter 'q' is required")
		return
	}

	// Validate query length (character count, not byte count)
	queryLen := utf8.RuneCountInString(query)
	if queryLen < minQueryLength || queryLen > maxQueryLength {
		slog.Warn("search query length out of range",
			"query_length", queryLen,
			"min", minQueryLength,
			"max", maxQueryLength,
			"remote_addr", r.RemoteAddr)
		respondFailure(w, http.StatusBadRequest, "query must be between 1 and 1000 characters")
		return
	}

	limit := parseIntParam(r, "limit", defaultSearchLimit)
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
			"error", err,
			"query", query,
			"operation", "GetEmbedding")
		respondFailure(w, http.StatusServiceUnavailable, "embedding service unavailable")
		return
	}

	// Perform vector similarity search
	rows, err := db.SearchTexts(r.Context(), embedding, limit)
	if err != nil {
		slog.Error("database search error",
			"error", err,
			"query", query,
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
		"query", query,
		"result_count", len(results),
		"limit", limit)

	respondSuccess(w, http.StatusOK, models.SearchResponse{
		Query:   query,
		Results: results,
		Total:   len(results),
	})
}
