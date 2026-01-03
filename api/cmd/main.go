package main

import (
	"log"

	"corpus/api/internal/config"
	"corpus/api/internal/server"
)

func main() {
	config.Load()

	// Validate configuration before starting server
	if err := config.Validate(); err != nil {
		log.Fatalf("Configuration validation failed: %v", err)
	}

	server.Start()
	server.WaitForShutdown()
	server.Stop()
}
