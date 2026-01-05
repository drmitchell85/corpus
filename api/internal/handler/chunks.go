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
	defaultLimit  = 3
	maxLimit      = 10
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
			ChunkIndex: int(row.ChunkIndex.Int32),
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
		CurrentIndex:   int(context.CurrentChunk.ChunkIndex.Int32),
		SourceURL:      context.CurrentChunk.SourceURL,
		Author:         context.CurrentChunk.Author.String,
		Title:          context.CurrentChunk.Title.String,
		Year:           int(context.CurrentChunk.Year.Int32),
		Genre:          context.CurrentChunk.Genre.String,
	})
}

// GetChunksBefore handles GET /chunks/{id}/before requests.
func GetChunksBefore(w http.ResponseWriter, r *http.Request) {
	reqID := appMiddleware.GetRequestID(r.Context())
	idStr := chi.URLParam(r, "id")
	limit := parseIntParam(r, "limit", defaultLimit)

	slog.Debug("get chunks before request received",
		"request_id", reqID,
		"chunk_id", idStr,
		"limit", limit)

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

	// Validate and clamp limit parameter
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}

	// Get chunks from database
	chunks, err := db.GetChunksBefore(r.Context(), id, limit)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			slog.Warn("chunk not found",
				"request_id", reqID,
				"chunk_id", id)
			respondFailure(w, http.StatusNotFound, "chunk not found")
			return
		}
		slog.Error("database error getting chunks before",
			"request_id", reqID,
			"chunk_id", id,
			"error", err,
			"operation", "GetChunksBefore")
		respondFailure(w, http.StatusInternalServerError, "database error")
		return
	}

	slog.Debug("chunks before retrieved successfully",
		"request_id", reqID,
		"chunk_id", id,
		"limit", limit,
		"count", len(chunks))

	// Convert ChunkRow to ChunkItem
	convertChunkRow := func(row *models.ChunkRow) models.ChunkItem {
		return models.ChunkItem{
			ID:         row.ID,
			Text:       row.Text,
			ChunkIndex: int(row.ChunkIndex.Int32),
			SourceURL:  row.SourceURL,
			Author:     row.Author.String,
			Title:      row.Title.String,
			Year:       int(row.Year.Int32),
			Genre:      row.Genre.String,
		}
	}

	items := make([]models.ChunkItem, 0, len(chunks))
	for i := range chunks {
		items = append(items, convertChunkRow(&chunks[i]))
	}

	respondSuccess(w, http.StatusOK, items)
}

// GetChunksAfter handles GET /chunks/{id}/after requests.
func GetChunksAfter(w http.ResponseWriter, r *http.Request) {
	reqID := appMiddleware.GetRequestID(r.Context())
	idStr := chi.URLParam(r, "id")
	limit := parseIntParam(r, "limit", defaultLimit)

	slog.Debug("get chunks after request received",
		"request_id", reqID,
		"chunk_id", idStr,
		"limit", limit)

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

	// Validate and clamp limit parameter
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}

	// Get chunks from database
	chunks, err := db.GetChunksAfter(r.Context(), id, limit)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			slog.Warn("chunk not found",
				"request_id", reqID,
				"chunk_id", id)
			respondFailure(w, http.StatusNotFound, "chunk not found")
			return
		}
		slog.Error("database error getting chunks after",
			"request_id", reqID,
			"chunk_id", id,
			"error", err,
			"operation", "GetChunksAfter")
		respondFailure(w, http.StatusInternalServerError, "database error")
		return
	}

	slog.Debug("chunks after retrieved successfully",
		"request_id", reqID,
		"chunk_id", id,
		"limit", limit,
		"count", len(chunks))

	// Convert ChunkRow to ChunkItem
	convertChunkRow := func(row *models.ChunkRow) models.ChunkItem {
		return models.ChunkItem{
			ID:         row.ID,
			Text:       row.Text,
			ChunkIndex: int(row.ChunkIndex.Int32),
			SourceURL:  row.SourceURL,
			Author:     row.Author.String,
			Title:      row.Title.String,
			Year:       int(row.Year.Int32),
			Genre:      row.Genre.String,
		}
	}

	items := make([]models.ChunkItem, 0, len(chunks))
	for i := range chunks {
		items = append(items, convertChunkRow(&chunks[i]))
	}

	respondSuccess(w, http.StatusOK, items)
}
