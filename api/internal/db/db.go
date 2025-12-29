package db

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"strings"

	"corpus/api/internal/config"
	"corpus/api/internal/models"

	_ "github.com/marcboeker/go-duckdb"
)

// getConnection opens a new read-only connection to the DuckDB database.
// Caller is responsible for closing the connection.
func getConnection() (*sql.DB, error) {
	return sql.Open("duckdb", config.DBPath+"?access_mode=read_only")
}

// SourceExists checks if a source URL has already been ingested.
func SourceExists(ctx context.Context, sourceURL string) (bool, error) {
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
		return false, err
	}
	return exists, nil
}

// HashExists checks if a text hash already exists.
func HashExists(ctx context.Context, hash string) (bool, error) {
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
		return false, err
	}
	return exists, nil
}

// ListTexts returns paginated texts grouped by source_url.
func ListTexts(ctx context.Context, page, perPage int) ([]models.TextRow, int, error) {
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

	return texts, total, nil
}

// SearchTexts performs vector similarity search using the query embedding.
func SearchTexts(ctx context.Context, embedding []float32, limit int) ([]models.SearchRow, error) {
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
