package main

import (
	"corpus/api/internal/config"
	"corpus/api/internal/server"
)

func main() {
	config.Load()
	server.Start()
	server.WaitForShutdown()
	server.Stop()
}
