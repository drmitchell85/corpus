package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
)

// errorResponse is the standard structure for error responses.
type errorResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

// respondSuccess writes a successful JSON response.
// Use for 2xx status codes where the response body is the data itself.
func respondSuccess(w http.ResponseWriter, status int, data any) {
	writeJSON(w, status, data)
}

// respondFailure writes an error JSON response with consistent structure.
// Automatically wraps the message in {"status": "error", "message": "..."}.
func respondFailure(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, errorResponse{
		Status:  deriveStatus(status),
		Message: message,
	})
}

// deriveStatus returns an appropriate status string based on HTTP status code.
func deriveStatus(httpStatus int) string {
	switch httpStatus {
	case http.StatusConflict:
		return "duplicate"
	default:
		return "error"
	}
}

// writeJSON handles the low-level JSON encoding and header setting.
// Encodes to buffer first to avoid committing status code before encoding succeeds.
func writeJSON(w http.ResponseWriter, status int, data any) {
	buf := new(bytes.Buffer)
	if err := json.NewEncoder(buf).Encode(data); err != nil {
		slog.Error("failed to encode JSON response",
			"error", err,
			"status", status,
			"data_type", fmt.Sprintf("%T", data))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"status":"error","message":"internal server error"}`))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if _, err := w.Write(buf.Bytes()); err != nil {
		slog.Error("failed to write response body",
			"error", err,
			"status", status)
	}
}
