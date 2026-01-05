package config

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"time"

	"github.com/joho/godotenv"
)

var (
	APIPort         string
	RedisURL        string
	DBPath          string
	EmbedServiceURL string
	UploadPath      string
)

func Load() {
	// Load .env from project root (two levels up from api/internal/config)
	_ = godotenv.Load("../../.env")
	// Also try from api directory (when running from api/)
	_ = godotenv.Load("../.env")

	APIPort = getEnv("API_PORT", "8080")
	RedisURL = getEnv("REDIS_URL", "redis://localhost:6379/0")
	DBPath = getEnv("DATABASE_PATH", "./corpus.db")
	EmbedServiceURL = getEnv("EMBED_SERVICE_URL", "http://localhost:8001")
	UploadPath = getEnv("UPLOAD_PATH", "./uploads")

	// Canonicalize UploadPath to absolute path once at startup
	// This ensures consistent path resolution regardless of working directory changes
	if absPath, err := filepath.Abs(UploadPath); err == nil {
		UploadPath = absPath
	}
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}

// Validate checks that all configuration is valid and services are reachable.
// Should be called after Load() during application startup.
func Validate() error {
	slog.Info("validating configuration",
		"api_port", APIPort,
		"db_path", DBPath,
		"embed_service_url", EmbedServiceURL,
		"redis_url", sanitizeRedisURL(RedisURL),
		"upload_path", UploadPath)

	// Validate Redis URL format
	parsedURL, err := url.Parse(RedisURL)
	if err != nil {
		return fmt.Errorf("invalid redis URL: %w", err)
	}
	// Ensure redis or rediss scheme
	if parsedURL.Scheme != "redis" && parsedURL.Scheme != "rediss" {
		return fmt.Errorf("redis URL must use redis:// or rediss:// scheme")
	}
	// Ensure host is present
	if parsedURL.Host == "" {
		return fmt.Errorf("redis URL must have a valid host")
	}

	// Validate database path is writable
	dbDir := filepath.Dir(DBPath)
	if dbDir == "" || dbDir == "." {
		dbDir = "."
	}

	// Check if directory exists and is writable
	if err := os.MkdirAll(dbDir, 0755); err != nil {
		return fmt.Errorf("database directory not writable: %w", err)
	}

	// Test write by creating a test file
	testFile := dbDir + "/.write_test"
	if err := os.WriteFile(testFile, []byte("test"), 0644); err != nil {
		return fmt.Errorf("database directory not writable: %w", err)
	}
	if err := os.Remove(testFile); err != nil {
		slog.Warn("failed to remove write test file", "path", testFile, "error", err)
	}

	// Validate upload path is writable
	if err := os.MkdirAll(UploadPath, 0755); err != nil {
		return fmt.Errorf("upload path not writable: %w", err)
	}

	// Test write to upload directory
	uploadTestFile := UploadPath + "/.write_test"
	if err := os.WriteFile(uploadTestFile, []byte("test"), 0644); err != nil {
		return fmt.Errorf("upload path not writable: %w", err)
	}
	if err := os.Remove(uploadTestFile); err != nil {
		slog.Warn("failed to remove write test file", "path", uploadTestFile, "error", err)
	}

	// Check if embedding service is reachable (with timeout)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	healthURL := EmbedServiceURL + "/health"
	req, err := http.NewRequestWithContext(ctx, "GET", healthURL, nil)
	if err != nil {
		slog.Warn("failed to create health check request for embedding service",
			"url", healthURL,
			"error", err)
		return fmt.Errorf("embedding service URL invalid: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		slog.Warn("embedding service not reachable",
			"url", healthURL,
			"error", err)
		// Don't fail on service unreachable - service might start later
		// Just log warning
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		slog.Warn("embedding service health check failed",
			"url", healthURL,
			"status", resp.StatusCode)
	} else {
		slog.Info("embedding service health check passed",
			"url", healthURL)
	}

	slog.Info("configuration validation complete")
	return nil
}

// sanitizeRedisURL removes password from Redis URL for logging.
func sanitizeRedisURL(redisURL string) string {
	parsed, err := url.Parse(redisURL)
	if err != nil {
		return redisURL
	}
	if parsed.User != nil {
		parsed.User = url.User("***")
	}
	return parsed.String()
}
