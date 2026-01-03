package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
)

// ctxKey is a custom type for context keys to avoid collisions.
type ctxKey string

// RequestIDKey is the context key for storing request IDs.
const RequestIDKey ctxKey = "request_id"

// RequestLogger logs HTTP requests with request ID, method, path, status, and duration.
func RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Generate unique request ID
		requestID := uuid.New().String()

		// Store in context for downstream use
		ctx := context.WithValue(r.Context(), RequestIDKey, requestID)
		r = r.WithContext(ctx)

		// Wrap response writer to capture status code
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)

		// Record start time
		start := time.Now()

		// Log incoming request
		slog.Info("request started",
			"request_id", requestID,
			"method", r.Method,
			"path", r.URL.Path,
			"remote_addr", r.RemoteAddr,
			"user_agent", r.UserAgent())

		// Process request
		next.ServeHTTP(ww, r)

		// Calculate duration
		duration := time.Since(start)

		// Log completed request
		slog.Info("request completed",
			"request_id", requestID,
			"method", r.Method,
			"path", r.URL.Path,
			"status", ww.Status(),
			"bytes_written", ww.BytesWritten(),
			"duration_ms", duration.Milliseconds())
	})
}

// GetRequestID retrieves the request ID from the context.
// Returns empty string if no request ID is found.
func GetRequestID(ctx context.Context) string {
	if id, ok := ctx.Value(RequestIDKey).(string); ok {
		return id
	}
	return ""
}
