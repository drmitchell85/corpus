package config

import (
	"os"

	"github.com/joho/godotenv"
)

var (
	APIPort         string
	RedisURL        string
	DBPath          string
	EmbedServiceURL string
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
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}
