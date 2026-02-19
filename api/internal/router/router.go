package router

import (
	"log/slog"
	"net/http"
	"time"

	"corpus/api/internal/handler"
	appMiddleware "corpus/api/internal/middleware"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func New() *chi.Mux {
	r := chi.NewRouter()

	// CORS for browser extension (local dev only — wildcard origin is intentional)
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	})

	// Use custom request logger with request ID tracking
	r.Use(appMiddleware.RequestLogger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	r.Get("/health", handleHealth)
	r.Post("/ingest", handler.Ingest)
	r.Post("/ingest/html", handler.IngestHTML)
	r.Post("/upload", handler.Upload)
	r.Get("/ingest/status/{id}", handler.IngestStatus)
	r.Get("/texts", handler.ListTexts)
	r.Delete("/texts/{id}", handler.DeleteText)
	r.Get("/search", handler.Search)
	r.Get("/chunks/{id}/context", handler.GetChunkContext)
	r.Get("/chunks/{id}/before", handler.GetChunksBefore)
	r.Get("/chunks/{id}/after", handler.GetChunksAfter)

	return r
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write([]byte(`{"status":"ok"}`)); err != nil {
		slog.Warn("failed to write health check response",
			"error", err)
	}
}
