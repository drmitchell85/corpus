package logger

import (
	"log/slog"
	"os"
	"strings"
)

// Init initializes the global structured logger with JSON output.
// Call this early in main() before any logging occurs.
func Init() {
	// Create JSON handler for structured logging
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: getLogLevel(),
		// Add source location for debugging (file:line)
		AddSource: false,
	})

	// Set as default logger
	slog.SetDefault(slog.New(handler))
}

// getLogLevel returns the log level from environment or defaults to Info.
func getLogLevel() slog.Level {
	levelStr := strings.ToUpper(os.Getenv("LOG_LEVEL"))
	switch levelStr {
	case "DEBUG":
		return slog.LevelDebug
	case "INFO":
		return slog.LevelInfo
	case "WARN":
		return slog.LevelWarn
	case "ERROR":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
