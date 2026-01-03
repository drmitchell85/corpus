package embed

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"corpus/api/internal/config"
)

var httpClient = &http.Client{
	Timeout: 30 * time.Second,
}

type embedRequest struct {
	Text string `json:"text"`
}

type embedResponse struct {
	Embedding []float32 `json:"embedding"`
	Dimension int       `json:"dimension"`
}

// GetEmbedding calls the Python embedding service to get a vector for the query.
func GetEmbedding(ctx context.Context, text string) ([]float32, error) {
	start := time.Now()

	reqBody, err := json.Marshal(embedRequest{Text: text})
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	url := config.EmbedServiceURL + "/embed"

	slog.Debug("calling embedding service",
		"url", url,
		"text_length", len(text))

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(reqBody))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		slog.Error("embedding service request failed",
			"url", url,
			"error", err,
			"duration_ms", time.Since(start).Milliseconds())
		return nil, fmt.Errorf("embed service request: %w", err)
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			slog.Warn("failed to close embed service response body",
				"error", err)
		}
	}()

	if resp.StatusCode != http.StatusOK {
		slog.Error("embedding service returned non-OK status",
			"url", url,
			"status", resp.StatusCode,
			"duration_ms", time.Since(start).Milliseconds())
		return nil, fmt.Errorf("embed service returned status %d", resp.StatusCode)
	}

	var result embedResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		slog.Error("failed to decode embedding response",
			"url", url,
			"error", err,
			"duration_ms", time.Since(start).Milliseconds())
		return nil, fmt.Errorf("decode response: %w", err)
	}

	duration := time.Since(start)
	slog.Info("embedding generated",
		"url", url,
		"dimension", result.Dimension,
		"text_length", len(text),
		"duration_ms", duration.Milliseconds())

	return result.Embedding, nil
}
