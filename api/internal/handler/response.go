package handler

import (
	"encoding/json"
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
func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
