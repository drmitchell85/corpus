package main

import (
	"log/slog"

	"corpus/api/internal/config"
	"corpus/api/internal/logger"
	"corpus/api/internal/server"
)

func main() {
	// Initialize structured logging first
	logger.Init()

	config.Load()

	// Validate configuration before starting server
	if err := config.Validate(); err != nil {
		slog.Error("configuration validation failed", "error", err)
		panic(err)
	}

	server.Start()
	server.WaitForShutdown()
	server.Stop()
}
