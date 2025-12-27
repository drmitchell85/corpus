package db

import (
	"context"
	"database/sql"
	"sync"

	"corpus/api/internal/config"

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
