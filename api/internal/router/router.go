package router

import (
	"log/slog"
	"net/http"
	"time"

	"corpus/api/internal/handler"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func New() *chi.Mux {
	r := chi.NewRouter()

	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	r.Get("/health", handleHealth)
	r.Post("/ingest", handler.Ingest)
	r.Post("/upload", handler.Upload)
	r.Get("/ingest/status/{id}", handler.IngestStatus)
	r.Get("/texts", handler.ListTexts)
	r.Get("/search", handler.Search)

	return r
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write([]byte(`{"status":"ok"}`)); err != nil {
		slog.Error("failed to write health check response",
			"error", err)
	}
}
