package handler

import (
	"log/slog"
	"net/http"
	"strconv"

	"corpus/api/internal/db"
	"corpus/api/internal/models"
)

const (
	defaultPage    = 1
	defaultPerPage = 20
	maxPerPage     = 100
)

// ListTexts handles GET /texts requests.
func ListTexts(w http.ResponseWriter, r *http.Request) {
	page := parseIntParam(r, "page", defaultPage)
	perPage := parseIntParam(r, "per_page", defaultPerPage)

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
			"error", err,
			"page", page,
			"per_page", perPage,
			"operation", "ListTexts")
		respondFailure(w, http.StatusInternalServerError, "database error")
		return
	}

	slog.Info("texts listed",
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
