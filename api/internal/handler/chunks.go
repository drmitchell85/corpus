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
	defaultWindow = 1
	maxWindow     = 10
)

// GetChunkContext handles GET /chunks/{id}/context requests.
func GetChunkContext(w http.ResponseWriter, r *http.Request) {
	reqID := appMiddleware.GetRequestID(r.Context())
	idStr := chi.URLParam(r, "id")
	window := parseIntParam(r, "window", defaultWindow)

	slog.Debug("get chunk context request received",
		"request_id", reqID,
		"chunk_id", idStr,
		"window", window)

	// Validate ID format
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		slog.Warn("invalid chunk ID format",
			"request_id", reqID,
			"chunk_id", idStr,
			"error", err,
			"remote_addr", r.RemoteAddr)
		respondFailure(w, http.StatusBadRequest, "chunk ID must be a positive integer")
		return
	}

	// Validate and clamp window parameter
	if window < 0 {
		window = defaultWindow
	}
	if window > maxWindow {
		window = maxWindow
	}

	// Get chunk context from database
	context, err := db.GetChunkContext(r.Context(), id, window)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			slog.Warn("chunk not found",
				"request_id", reqID,
				"chunk_id", id)
			respondFailure(w, http.StatusNotFound, "chunk not found")
			return
		}
		slog.Error("database error getting chunk context",
			"request_id", reqID,
			"chunk_id", id,
			"error", err,
			"operation", "GetChunkContext")
		respondFailure(w, http.StatusInternalServerError, "database error")
		return
	}

	slog.Debug("chunk context retrieved successfully",
		"request_id", reqID,
		"chunk_id", id,
		"window", window,
		"before_count", len(context.BeforeChunks),
		"after_count", len(context.AfterChunks))

	// Convert ChunkRow to ChunkItem
	convertChunkRow := func(row *models.ChunkRow) models.ChunkItem {
		return models.ChunkItem{
			ID:         row.ID,
			Text:       row.Text,
			ChunkIndex: row.ChunkIndex,
			SourceURL:  row.SourceURL,
			Author:     row.Author.String,
			Title:      row.Title.String,
			Year:       int(row.Year.Int32),
			Genre:      row.Genre.String,
		}
	}

	currentChunk := convertChunkRow(context.CurrentChunk)

	beforeChunks := make([]models.ChunkItem, 0, len(context.BeforeChunks))
	for i := range context.BeforeChunks {
		beforeChunks = append(beforeChunks, convertChunkRow(&context.BeforeChunks[i]))
	}

	afterChunks := make([]models.ChunkItem, 0, len(context.AfterChunks))
	for i := range context.AfterChunks {
		afterChunks = append(afterChunks, convertChunkRow(&context.AfterChunks[i]))
	}

	respondSuccess(w, http.StatusOK, models.ChunkContextResponse{
		CurrentChunk:   currentChunk,
		BeforeChunks:   beforeChunks,
		AfterChunks:    afterChunks,
		TotalChunks:    context.TotalChunks,
		HasMoreBefore:  context.HasMoreBefore,
		HasMoreAfter:   context.HasMoreAfter,
		CurrentIndex:   context.CurrentChunk.ChunkIndex,
		SourceURL:      context.CurrentChunk.SourceURL,
		Author:         context.CurrentChunk.Author.String,
		Title:          context.CurrentChunk.Title.String,
		Year:           int(context.CurrentChunk.Year.Int32),
		Genre:          context.CurrentChunk.Genre.String,
	})
}
