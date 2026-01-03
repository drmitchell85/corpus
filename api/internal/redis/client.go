package redis

import (
	"context"
	"log/slog"
	"sync"

	"corpus/api/internal/config"

	"github.com/redis/go-redis/v9"
)

var (
	client *redis.Client
	once   sync.Once
)

// Client returns the singleton Redis client.
// Initializes connection on first call using config.RedisURL.
func Client() *redis.Client {
	once.Do(func() {
		client = newClient(config.RedisURL)
	})
	return client
}

// newClient creates a Redis client from a URL.
func newClient(redisURL string) *redis.Client {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		slog.Warn("failed to parse redis URL, using default localhost:6379",
			"error", err,
			"provided_url", redisURL,
			"fallback", "localhost:6379")
		opts = &redis.Options{Addr: "localhost:6379"}
	}
	return redis.NewClient(opts)
}

// Ping checks the Redis connection.
func Ping(ctx context.Context) error {
	return Client().Ping(ctx).Err()
}

// Close gracefully shuts down the Redis connection.
func Close() error {
	if client != nil {
		return client.Close()
	}
	return nil
}
