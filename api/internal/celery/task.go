package celery

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"corpus/api/internal/redis"

	"github.com/google/uuid"
)

const (
	// DefaultQueue is the Celery task queue name.
	DefaultQueue = "celery"

	// TaskName is the full Python path to the process_text task.
	TaskName = "workers.worker.process_text"
)

// TaskMetadata holds optional text metadata.
type TaskMetadata struct {
	Author string `json:"author,omitempty"`
	Title  string `json:"title,omitempty"`
	Year   int    `json:"year,omitempty"`
	Genre  string `json:"genre,omitempty"`
}

// QueueResult contains the result of queueing a task.
type QueueResult struct {
	JobID string
}

// QueueTextJob queues a text processing job for Celery workers.
func QueueTextJob(ctx context.Context, sourceType, sourceURL string, metadata *TaskMetadata) (*QueueResult, error) {
	jobID := generateJobID()

	msg, err := buildMessage(jobID, sourceType, sourceURL, metadata)
	if err != nil {
		return nil, fmt.Errorf("build message: %w", err)
	}

	if err := pushToQueue(ctx, msg); err != nil {
		return nil, fmt.Errorf("push to queue: %w", err)
	}

	return &QueueResult{JobID: jobID}, nil
}

// generateJobID creates a unique job identifier.
func generateJobID() string {
	return uuid.New().String()
}

// buildMessage constructs a Celery-compatible message.
func buildMessage(jobID, sourceType, sourceURL string, metadata *TaskMetadata) ([]byte, error) {
	body := buildBody(jobID, sourceType, sourceURL, metadata)
	headers := buildHeaders(jobID)
	properties := buildProperties(jobID)

	bodyJSON, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	bodyEncoded := base64.StdEncoding.EncodeToString(bodyJSON)

	message := map[string]any{
		"body":             bodyEncoded,
		"content-encoding": "utf-8",
		"content-type":     "application/json",
		"headers":          headers,
		"properties":       properties,
	}

	return json.Marshal(message)
}

// buildBody creates the Celery message body: [args, kwargs, embed].
func buildBody(jobID, sourceType, sourceURL string, metadata *TaskMetadata) []any {
	kwargs := map[string]any{
		"job_id":      jobID,
		"source_type": sourceType,
		"source_url":  sourceURL,
	}

	if metadata != nil {
		kwargs["metadata"] = metadata
	}

	// Celery body format: [positional_args, keyword_args, embed_options]
	return []any{
		[]any{},           // args (empty, we use kwargs)
		kwargs,            // kwargs
		map[string]any{},  // embed options
	}
}

// buildHeaders creates Celery message headers.
func buildHeaders(jobID string) map[string]any {
	hostname, _ := os.Hostname()

	return map[string]any{
		"lang":       "py",
		"task":       TaskName,
		"id":         jobID,
		"root_id":    jobID,
		"parent_id":  nil,
		"group":      nil,
		"meth":       nil,
		"shadow":     nil,
		"eta":        nil,
		"expires":    nil,
		"retries":    0,
		"timelimit":  []any{nil, nil},
		"argsrepr":   "()",
		"kwargsrepr": fmt.Sprintf("{job_id=%s}", jobID),
		"origin":     fmt.Sprintf("go@%s", hostname),
	}
}

// buildProperties creates Celery message properties.
func buildProperties(jobID string) map[string]any {
	return map[string]any{
		"correlation_id": jobID,
		"reply_to":       uuid.New().String(),
		"delivery_mode":  2,
		"delivery_info": map[string]any{
			"exchange":    "",
			"routing_key": DefaultQueue,
		},
		"priority":      0,
		"body_encoding": "base64",
		"delivery_tag":  jobID,
	}
}

// pushToQueue sends the message to the Redis queue.
func pushToQueue(ctx context.Context, message []byte) error {
	return redis.Client().LPush(ctx, DefaultQueue, message).Err()
}

// GetJobStatus retrieves the status of a job from Celery's result backend.
func GetJobStatus(ctx context.Context, jobID string) (string, error) {
	key := fmt.Sprintf("celery-task-meta-%s", jobID)

	result, err := redis.Client().Get(ctx, key).Result()
	if err != nil {
		return "PENDING", nil // No result yet means pending
	}

	var taskResult struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal([]byte(result), &taskResult); err != nil {
		return "", fmt.Errorf("parse result: %w", err)
	}

	return taskResult.Status, nil
}

// GetJobResult retrieves the full result of a completed job.
func GetJobResult(ctx context.Context, jobID string) (map[string]any, error) {
	key := fmt.Sprintf("celery-task-meta-%s", jobID)

	result, err := redis.Client().Get(ctx, key).Result()
	if err != nil {
		return nil, nil // No result yet
	}

	var taskResult map[string]any
	if err := json.Unmarshal([]byte(result), &taskResult); err != nil {
		return nil, fmt.Errorf("parse result: %w", err)
	}

	return taskResult, nil
}

// WaitForResult polls for job completion with timeout.
func WaitForResult(ctx context.Context, jobID string, timeout time.Duration) (map[string]any, error) {
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		result, err := GetJobResult(ctx, jobID)
		if err != nil {
			return nil, err
		}
		if result != nil {
			return result, nil
		}

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(500 * time.Millisecond):
			continue
		}
	}

	return nil, fmt.Errorf("timeout waiting for job %s", jobID)
}
