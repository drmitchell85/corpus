package server

import (
	"context"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"syscall"
	"time"

	"corpus/api/internal/config"
	"corpus/api/internal/router"
)

var srv *http.Server

func Start() {
	srv = &http.Server{
		Addr:         ":" + config.APIPort,
		Handler:      router.New(),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Log startup configuration
	slog.Info("server starting",
		"port", config.APIPort,
		"db_path", config.DBPath,
		"embed_service_url", config.EmbedServiceURL,
		"redis_url", sanitizeRedisURL(config.RedisURL),
		"upload_path", config.UploadPath,
		"read_timeout", srv.ReadTimeout,
		"write_timeout", srv.WriteTimeout,
		"idle_timeout", srv.IdleTimeout)

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			panic(err)
		}
	}()
}

func Stop() {
	slog.Info("shutting down server")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("server shutdown error", "error", err)
		panic(err)
	}
	slog.Info("server stopped gracefully")
}

func WaitForShutdown() {
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
}

// sanitizeRedisURL removes password from Redis URL for logging.
func sanitizeRedisURL(redisURL string) string {
	parsed, err := url.Parse(redisURL)
	if err != nil {
		return "[invalid redis URL]"
	}
	if parsed.User != nil {
		parsed.User = url.UserPassword("***", "***")
	}
	return parsed.String()
}
