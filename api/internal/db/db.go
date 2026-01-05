package db

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"corpus/api/internal/config"
	"corpus/api/internal/models"

	_ "github.com/marcboeker/go-duckdb"
)

// getConnection opens a new read-only connection to the DuckDB database.
// Caller is responsible for closing the connection.
func getConnection() (*sql.DB, error) {
	return sql.Open("duckdb", config.DBPath+"?access_mode=read_only")
}

// getWriteConnection opens a new read-write connection to the DuckDB database.
// Caller is responsible for closing the connection.
func getWriteConnection() (*sql.DB, error) {
	return sql.Open("duckdb", config.DBPath)
}

// SourceExists checks if a source URL has already been ingested.
func SourceExists(ctx context.Context, sourceURL string) (bool, error) {
	start := time.Now()

	db, err := getConnection()
	if err != nil {
		return false, fmt.Errorf("failed to connect to database: %w", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			slog.Warn("failed to close database connection",
				"error", err,
				"operation", "SourceExists")
		}
	}()

	var exists bool
	err = db.QueryRowContext(ctx,
		"SELECT EXISTS(SELECT 1 FROM texts WHERE source_url = ? LIMIT 1)",
		sourceURL,
	).Scan(&exists)

	if err != nil {
		slog.Error("database query failed",
			"operation", "SourceExists",
			"error", err,
			"duration_ms", time.Since(start).Milliseconds())
		return false, err
	}

	slog.Debug("source existence checked",
		"operation", "SourceExists",
		"exists", exists,
		"duration_ms", time.Since(start).Milliseconds())

	return exists, nil
}

// HashExists checks if a text hash already exists.
func HashExists(ctx context.Context, hash string) (bool, error) {
	start := time.Now()

	db, err := getConnection()
	if err != nil {
		return false, fmt.Errorf("failed to connect to database: %w", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			slog.Warn("failed to close database connection",
				"error", err,
				"operation", "HashExists")
		}
	}()

	var exists bool
	err = db.QueryRowContext(ctx,
		"SELECT EXISTS(SELECT 1 FROM texts WHERE hash = ? LIMIT 1)",
		hash,
	).Scan(&exists)

	if err != nil {
		slog.Error("database query failed",
			"operation", "HashExists",
			"error", err,
			"duration_ms", time.Since(start).Milliseconds())
		return false, err
	}

	slog.Debug("hash existence checked",
		"operation", "HashExists",
		"exists", exists,
		"duration_ms", time.Since(start).Milliseconds())

	return exists, nil
}

// GetSourceURLByID returns the source_url for a given text ID.
// Returns empty string and sql.ErrNoRows if the ID doesn't exist.
func GetSourceURLByID(ctx context.Context, id int64) (string, error) {
	start := time.Now()

	db, err := getConnection()
	if err != nil {
		return "", fmt.Errorf("failed to connect to database: %w", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			slog.Warn("failed to close database connection",
				"error", err,
				"operation", "GetSourceURLByID")
		}
	}()

	var sourceURL string
	err = db.QueryRowContext(ctx,
		"SELECT source_url FROM texts WHERE id = ? LIMIT 1",
		id,
	).Scan(&sourceURL)

	if err != nil {
		if err == sql.ErrNoRows {
			slog.Debug("text ID not found",
				"operation", "GetSourceURLByID",
				"id", id,
				"duration_ms", time.Since(start).Milliseconds())
		} else {
			slog.Error("database query failed",
				"operation", "GetSourceURLByID",
				"id", id,
				"error", err,
				"duration_ms", time.Since(start).Milliseconds())
		}
		return "", err
	}

	slog.Debug("source URL retrieved",
		"operation", "GetSourceURLByID",
		"id", id,
		"duration_ms", time.Since(start).Milliseconds())

	return sourceURL, nil
}

// DeleteTextBySourceURL deletes all text chunks for a given source_url.
// Returns the number of chunks deleted (0 if source_url doesn't exist).
func DeleteTextBySourceURL(ctx context.Context, sourceURL string) (int, error) {
	if sourceURL == "" {
		return 0, fmt.Errorf("source_url cannot be empty")
	}

	start := time.Now()

	db, err := getWriteConnection()
	if err != nil {
		return 0, fmt.Errorf("failed to connect to database: %w", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			slog.Warn("failed to close database connection",
				"error", err,
				"operation", "DeleteTextBySourceURL")
		}
	}()

	result, err := db.ExecContext(ctx,
		"DELETE FROM texts WHERE source_url = ?",
		sourceURL,
	)

	if err != nil {
		slog.Error("delete operation failed",
			"operation", "DeleteTextBySourceURL",
			"source_url", sourceURL,
			"error", err,
			"duration_ms", time.Since(start).Milliseconds())
		return 0, err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		slog.Error("failed to get rows affected",
			"operation", "DeleteTextBySourceURL",
			"source_url", sourceURL,
			"error", err,
			"duration_ms", time.Since(start).Milliseconds())
		return 0, err
	}

	duration := time.Since(start)
	slog.Info("text chunks deleted",
		"operation", "DeleteTextBySourceURL",
		"chunks_deleted", rowsAffected,
		"duration_ms", duration.Milliseconds())

	return int(rowsAffected), nil
}

// ListTexts returns paginated texts grouped by source_url.
func ListTexts(ctx context.Context, page, perPage int) ([]models.TextRow, int, error) {
	start := time.Now()

	db, err := getConnection()
	if err != nil {
		return nil, 0, fmt.Errorf("failed to connect to database: %w", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			slog.Warn("failed to close database connection",
				"error", err,
				"operation", "ListTexts")
		}
	}()

	offset := (page - 1) * perPage

	// Get total count of distinct source_urls
	var total int
	err = db.QueryRowContext(ctx,
		"SELECT COUNT(DISTINCT source_url) FROM texts",
	).Scan(&total)
	if err != nil {
		slog.Error("database query failed",
			"operation", "ListTexts",
			"error", err,
			"duration_ms", time.Since(start).Milliseconds())
		return nil, 0, err
	}

	// Get paginated results grouped by source_url
	rows, err := db.QueryContext(ctx, `
		SELECT
			MIN(id) as id,
			source_url,
			MAX(author) as author,
			MAX(title) as title,
			MAX(year) as year,
			MAX(genre) as genre,
			COUNT(*) as chunk_count
		FROM texts
		GROUP BY source_url
		ORDER BY MIN(id) DESC
		LIMIT ? OFFSET ?
	`, perPage, offset)
	if err != nil {
		slog.Error("database query failed",
			"operation", "ListTexts",
			"error", err,
			"duration_ms", time.Since(start).Milliseconds())
		return nil, 0, err
	}
	defer rows.Close()

	var texts []models.TextRow
	for rows.Next() {
		var t models.TextRow
		if err := rows.Scan(&t.ID, &t.SourceURL, &t.Author, &t.Title, &t.Year, &t.Genre, &t.ChunkCount); err != nil {
			return nil, 0, err
		}
		texts = append(texts, t)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	duration := time.Since(start)
	slog.Info("texts listed",
		"operation", "ListTexts",
		"page", page,
		"per_page", perPage,
		"returned", len(texts),
		"total", total,
		"duration_ms", duration.Milliseconds())

	return texts, total, nil
}

// SearchTexts performs vector similarity search using the query embedding.
func SearchTexts(ctx context.Context, embedding []float32, limit int) ([]models.SearchRow, error) {
	start := time.Now()

	db, err := getConnection()
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			slog.Warn("failed to close database connection",
				"error", err,
				"operation", "SearchTexts")
		}
	}()

	// Build the embedding array literal for DuckDB
	embeddingLiteral := floatsToArrayLiteral(embedding)

	query := fmt.Sprintf(`
		SELECT
			id,
			text,
			list_cosine_similarity(embedding, %s) as score,
			source_url,
			author,
			title,
			year,
			genre
		FROM texts
		ORDER BY score DESC
		LIMIT ?
	`, embeddingLiteral)

	rows, err := db.QueryContext(ctx, query, limit)
	if err != nil {
		slog.Error("database query failed",
			"operation", "SearchTexts",
			"error", err,
			"limit", limit,
			"duration_ms", time.Since(start).Milliseconds())
		return nil, err
	}
	defer rows.Close()

	var results []models.SearchRow
	for rows.Next() {
		var r models.SearchRow
		if err := rows.Scan(&r.ID, &r.Text, &r.Score, &r.SourceURL, &r.Author, &r.Title, &r.Year, &r.Genre); err != nil {
			return nil, err
		}
		results = append(results, r)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	duration := time.Since(start)
	slog.Info("vector search completed",
		"operation", "SearchTexts",
		"limit", limit,
		"results", len(results),
		"embedding_dim", len(embedding),
		"duration_ms", duration.Milliseconds())

	return results, nil
}

// floatsToArrayLiteral converts a float32 slice to a DuckDB array literal.
func floatsToArrayLiteral(floats []float32) string {
	strs := make([]string, len(floats))
	for i, f := range floats {
		strs[i] = fmt.Sprintf("%g", f)
	}
	return "[" + strings.Join(strs, ",") + "]"
}

// ChunkContext holds the result of GetChunkContext.
type ChunkContext struct {
	CurrentChunk  *models.ChunkRow
	BeforeChunks  []models.ChunkRow
	AfterChunks   []models.ChunkRow
	TotalChunks   int
	HasMoreBefore bool
	HasMoreAfter  bool
}

// GetChunkContext retrieves a chunk with surrounding context (before/after chunks).
// The window parameter controls how many chunks to retrieve before and after.
func GetChunkContext(ctx context.Context, id int, window int) (*ChunkContext, error) {
	start := time.Now()

	db, err := getConnection()
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			slog.Warn("failed to close database connection",
				"error", err,
				"operation", "GetChunkContext")
		}
	}()

	// Get the current chunk
	var current models.ChunkRow
	err = db.QueryRowContext(ctx, `
		SELECT id, text, chunk_index, source_url, author, title, year, genre
		FROM texts
		WHERE id = ?
	`, id).Scan(&current.ID, &current.Text, &current.ChunkIndex, &current.SourceURL,
		&current.Author, &current.Title, &current.Year, &current.Genre)

	if err != nil {
		if err == sql.ErrNoRows {
			slog.Debug("chunk not found",
				"operation", "GetChunkContext",
				"id", id,
				"duration_ms", time.Since(start).Milliseconds())
			return nil, sql.ErrNoRows
		}
		slog.Error("database query failed",
			"operation", "GetChunkContext",
			"id", id,
			"error", err,
			"duration_ms", time.Since(start).Milliseconds())
		return nil, err
	}

	// Get total chunk count for this source
	var totalChunks int
	err = db.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM texts
		WHERE source_url = ?
	`, current.SourceURL).Scan(&totalChunks)

	if err != nil {
		slog.Error("database query failed",
			"operation", "GetChunkContext",
			"error", err,
			"duration_ms", time.Since(start).Milliseconds())
		return nil, err
	}

	// Get chunks before (order DESC to get most recent first, then reverse)
	beforeRows, err := db.QueryContext(ctx, `
		SELECT id, text, chunk_index, source_url, author, title, year, genre
		FROM texts
		WHERE source_url = ? AND chunk_index < ?
		ORDER BY chunk_index DESC
		LIMIT ?
	`, current.SourceURL, current.ChunkIndex, window)

	if err != nil {
		slog.Error("database query failed",
			"operation", "GetChunkContext",
			"error", err,
			"duration_ms", time.Since(start).Milliseconds())
		return nil, err
	}
	defer beforeRows.Close()

	var beforeChunks []models.ChunkRow
	for beforeRows.Next() {
		var chunk models.ChunkRow
		if err := beforeRows.Scan(&chunk.ID, &chunk.Text, &chunk.ChunkIndex, &chunk.SourceURL,
			&chunk.Author, &chunk.Title, &chunk.Year, &chunk.Genre); err != nil {
			return nil, err
		}
		beforeChunks = append(beforeChunks, chunk)
	}

	if err := beforeRows.Err(); err != nil {
		return nil, err
	}

	// Reverse beforeChunks to get chronological order
	for i, j := 0, len(beforeChunks)-1; i < j; i, j = i+1, j-1 {
		beforeChunks[i], beforeChunks[j] = beforeChunks[j], beforeChunks[i]
	}

	// Get chunks after
	afterRows, err := db.QueryContext(ctx, `
		SELECT id, text, chunk_index, source_url, author, title, year, genre
		FROM texts
		WHERE source_url = ? AND chunk_index > ?
		ORDER BY chunk_index ASC
		LIMIT ?
	`, current.SourceURL, current.ChunkIndex, window)

	if err != nil {
		slog.Error("database query failed",
			"operation", "GetChunkContext",
			"error", err,
			"duration_ms", time.Since(start).Milliseconds())
		return nil, err
	}
	defer afterRows.Close()

	var afterChunks []models.ChunkRow
	for afterRows.Next() {
		var chunk models.ChunkRow
		if err := afterRows.Scan(&chunk.ID, &chunk.Text, &chunk.ChunkIndex, &chunk.SourceURL,
			&chunk.Author, &chunk.Title, &chunk.Year, &chunk.Genre); err != nil {
			return nil, err
		}
		afterChunks = append(afterChunks, chunk)
	}

	if err := afterRows.Err(); err != nil {
		return nil, err
	}

	// Calculate has_more flags
	hasMoreBefore := current.ChunkIndex > len(beforeChunks)
	hasMoreAfter := current.ChunkIndex+len(afterChunks)+1 < totalChunks

	duration := time.Since(start)
	slog.Info("chunk context retrieved",
		"operation", "GetChunkContext",
		"id", id,
		"window", window,
		"before_count", len(beforeChunks),
		"after_count", len(afterChunks),
		"total_chunks", totalChunks,
		"duration_ms", duration.Milliseconds())

	return &ChunkContext{
		CurrentChunk:  &current,
		BeforeChunks:  beforeChunks,
		AfterChunks:   afterChunks,
		TotalChunks:   totalChunks,
		HasMoreBefore: hasMoreBefore,
		HasMoreAfter:  hasMoreAfter,
	}, nil
}

// GetChunksBefore retrieves chunks that come before the given chunk ID.
// Returns chunks in chronological order (oldest to newest relative to the target chunk).
func GetChunksBefore(ctx context.Context, id int, limit int) ([]models.ChunkRow, error) {
	start := time.Now()

	db, err := getConnection()
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			slog.Warn("failed to close database connection",
				"error", err,
				"operation", "GetChunksBefore")
		}
	}()

	// Get the current chunk to find its source_url and chunk_index
	var current models.ChunkRow
	err = db.QueryRowContext(ctx, `
		SELECT id, text, chunk_index, source_url, author, title, year, genre
		FROM texts
		WHERE id = ?
	`, id).Scan(&current.ID, &current.Text, &current.ChunkIndex, &current.SourceURL,
		&current.Author, &current.Title, &current.Year, &current.Genre)

	if err != nil {
		if err == sql.ErrNoRows {
			slog.Debug("chunk not found",
				"operation", "GetChunksBefore",
				"id", id,
				"duration_ms", time.Since(start).Milliseconds())
			return nil, sql.ErrNoRows
		}
		slog.Error("database query failed",
			"operation", "GetChunksBefore",
			"id", id,
			"error", err,
			"duration_ms", time.Since(start).Milliseconds())
		return nil, err
	}

	// Get chunks before (order DESC to get most recent first, then reverse)
	rows, err := db.QueryContext(ctx, `
		SELECT id, text, chunk_index, source_url, author, title, year, genre
		FROM texts
		WHERE source_url = ? AND chunk_index < ?
		ORDER BY chunk_index DESC
		LIMIT ?
	`, current.SourceURL, current.ChunkIndex, limit)

	if err != nil {
		slog.Error("database query failed",
			"operation", "GetChunksBefore",
			"error", err,
			"duration_ms", time.Since(start).Milliseconds())
		return nil, err
	}
	defer rows.Close()

	var chunks []models.ChunkRow
	for rows.Next() {
		var chunk models.ChunkRow
		if err := rows.Scan(&chunk.ID, &chunk.Text, &chunk.ChunkIndex, &chunk.SourceURL,
			&chunk.Author, &chunk.Title, &chunk.Year, &chunk.Genre); err != nil {
			return nil, err
		}
		chunks = append(chunks, chunk)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Reverse chunks to get chronological order (oldest to newest)
	for i, j := 0, len(chunks)-1; i < j; i, j = i+1, j-1 {
		chunks[i], chunks[j] = chunks[j], chunks[i]
	}

	duration := time.Since(start)
	slog.Info("chunks before retrieved",
		"operation", "GetChunksBefore",
		"id", id,
		"limit", limit,
		"count", len(chunks),
		"duration_ms", duration.Milliseconds())

	return chunks, nil
}

// GetChunksAfter retrieves chunks that come after the given chunk ID.
// Returns chunks in chronological order (from the target chunk onwards).
func GetChunksAfter(ctx context.Context, id int, limit int) ([]models.ChunkRow, error) {
	start := time.Now()

	db, err := getConnection()
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			slog.Warn("failed to close database connection",
				"error", err,
				"operation", "GetChunksAfter")
		}
	}()

	// Get the current chunk to find its source_url and chunk_index
	var current models.ChunkRow
	err = db.QueryRowContext(ctx, `
		SELECT id, text, chunk_index, source_url, author, title, year, genre
		FROM texts
		WHERE id = ?
	`, id).Scan(&current.ID, &current.Text, &current.ChunkIndex, &current.SourceURL,
		&current.Author, &current.Title, &current.Year, &current.Genre)

	if err != nil {
		if err == sql.ErrNoRows {
			slog.Debug("chunk not found",
				"operation", "GetChunksAfter",
				"id", id,
				"duration_ms", time.Since(start).Milliseconds())
			return nil, sql.ErrNoRows
		}
		slog.Error("database query failed",
			"operation", "GetChunksAfter",
			"id", id,
			"error", err,
			"duration_ms", time.Since(start).Milliseconds())
		return nil, err
	}

	// Get chunks after
	rows, err := db.QueryContext(ctx, `
		SELECT id, text, chunk_index, source_url, author, title, year, genre
		FROM texts
		WHERE source_url = ? AND chunk_index > ?
		ORDER BY chunk_index ASC
		LIMIT ?
	`, current.SourceURL, current.ChunkIndex, limit)

	if err != nil {
		slog.Error("database query failed",
			"operation", "GetChunksAfter",
			"error", err,
			"duration_ms", time.Since(start).Milliseconds())
		return nil, err
	}
	defer rows.Close()

	var chunks []models.ChunkRow
	for rows.Next() {
		var chunk models.ChunkRow
		if err := rows.Scan(&chunk.ID, &chunk.Text, &chunk.ChunkIndex, &chunk.SourceURL,
			&chunk.Author, &chunk.Title, &chunk.Year, &chunk.Genre); err != nil {
			return nil, err
		}
		chunks = append(chunks, chunk)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	duration := time.Since(start)
	slog.Info("chunks after retrieved",
		"operation", "GetChunksAfter",
		"id", id,
		"limit", limit,
		"count", len(chunks),
		"duration_ms", duration.Milliseconds())

	return chunks, nil
}
