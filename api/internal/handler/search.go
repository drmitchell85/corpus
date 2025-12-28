package handler

import (
	"net/http"

	"corpus/api/internal/db"
	"corpus/api/internal/embed"
	"corpus/api/internal/models"
)

const (
	defaultSearchLimit = 10
	maxSearchLimit     = 100
)

// Search handles GET /search requests.
func Search(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		respondFailure(w, http.StatusBadRequest, "query parameter 'q' is required")
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
		respondFailure(w, http.StatusServiceUnavailable, "embedding service unavailable")
		return
	}

	// Perform vector similarity search
	rows, err := db.SearchTexts(r.Context(), embedding, limit)
	if err != nil {
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

	respondSuccess(w, http.StatusOK, models.SearchResponse{
		Query:   query,
		Results: results,
		Total:   len(results),
	})
}
