package db

import (
	"context"
	"database/sql"
	"sync"

	"corpus/api/internal/config"
	"corpus/api/internal/models"

	_ "github.com/marcboeker/go-duckdb"
)

var (
	conn *sql.DB
	once sync.Once
)

// DB returns the singleton DuckDB connection.
// Opens connection on first call using config.DBPath.
func DB() *sql.DB {
	once.Do(func() {
		var err error
		conn, err = sql.Open("duckdb", config.DBPath+"?access_mode=read_only")
		if err != nil {
			panic("failed to open duckdb: " + err.Error())
		}
	})
	return conn
}

// Close gracefully shuts down the database connection.
func Close() error {
	if conn != nil {
		return conn.Close()
	}
	return nil
}

// SourceExists checks if a source URL has already been ingested.
func SourceExists(ctx context.Context, sourceURL string) (bool, error) {
	var exists bool
	err := DB().QueryRowContext(ctx,
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
	var exists bool
	err := DB().QueryRowContext(ctx,
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
	offset := (page - 1) * perPage

	// Get total count of distinct source_urls
	var total int
	err := DB().QueryRowContext(ctx,
		"SELECT COUNT(DISTINCT source_url) FROM texts",
	).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	// Get paginated results grouped by source_url
	rows, err := DB().QueryContext(ctx, `
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
