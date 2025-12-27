package main

import "corpus/api/internal/server"

func main() {
	server.Start()
	server.WaitForShutdown()
	server.Stop()
}
