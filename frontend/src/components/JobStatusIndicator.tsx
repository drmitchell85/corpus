import { useEffect, useState, useRef } from 'react';
import { getJobStatus, ApiError, NetworkError } from '@/api/client';
import type { StatusResponse } from '@/types/api';

export interface JobStatusIndicatorProps {
  jobId: string;
  onComplete?: (result?: Record<string, unknown>) => void;
  onError?: (error: string) => void;
}

type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * JobStatusIndicator - Polls backend for job status and displays progress
 *
 * This component polls GET /ingest/status/:id at regular intervals to track
 * async job progress. It displays appropriate UI states (pending, running,
 * completed, failed) and invokes callbacks when the job finishes.
 */
export function JobStatusIndicator({ jobId, onComplete, onError }: JobStatusIndicatorProps) {
  const [status, setStatus] = useState<JobStatus>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Use refs for callbacks to avoid effect restarts when callbacks change
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    let timeoutId: number | undefined;
    let isMounted = true;
    let pollCount = 0; // Local variable for exponential backoff
    let consecutiveErrors = 0; // Track consecutive API errors for retry logic

    // Retry configuration: 3 total attempts (1 initial + 2 retries)
    const MAX_RETRY_ATTEMPTS = 3;
    const RETRY_BASE_INTERVAL_MS = 2000; // Base interval for exponential backoff (2s)

    // Polling configuration
    const POLL_BACKOFF_BASE = 1.5;
    const POLL_MAX_INTERVAL_MS = 10000; // Cap polling interval at 10s

    const pollStatus = async () => {
      try {
        const response: StatusResponse = await getJobStatus(jobId);

        if (!isMounted) return;

        // Reset error counter on successful API call
        consecutiveErrors = 0;

        // Map backend status strings to our UI states
        const backendStatus = response.status.toLowerCase();

        if (backendStatus === 'success' || backendStatus === 'completed') {
          setStatus('completed');
          onCompleteRef.current?.(response.result);
          return; // Stop polling
        } else if (backendStatus === 'failure' || backendStatus === 'failed') {
          const errorMsg =
            (typeof response.result?.error === 'string' ? response.result.error : null) ||
            'Job failed during processing';
          setStatus('failed');
          setErrorMessage(errorMsg);
          onErrorRef.current?.(errorMsg);
          return; // Stop polling
        } else if (backendStatus === 'started' || backendStatus === 'running') {
          setStatus('running');
        } else {
          // 'pending' or 'queued' states
          setStatus('pending');
        }

        // Continue polling (exponential backoff with max interval)
        pollCount += 1;
        const nextInterval = Math.min(1000 * Math.pow(POLL_BACKOFF_BASE, pollCount), POLL_MAX_INTERVAL_MS);
        timeoutId = window.setTimeout(pollStatus, nextInterval);
      } catch (error) {
        if (!isMounted) return;

        // Don't retry on client errors (404, 400, etc.) - job doesn't exist or is invalid
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          const errorMsg = error.body?.message ?? `Job not found or invalid (${error.status})`;
          setStatus('failed');
          setErrorMessage(errorMsg);
          onErrorRef.current?.(errorMsg);
          return; // Stop polling immediately
        }

        // Increment consecutive error counter for retryable errors
        consecutiveErrors += 1;

        // Retry up to MAX_RETRY_ATTEMPTS before marking as failed
        if (consecutiveErrors < MAX_RETRY_ATTEMPTS) {
          // Log retry attempt in development only
          if (import.meta.env.DEV) {
            console.warn(
              `Job ${jobId}: status check failed (attempt ${consecutiveErrors}/${MAX_RETRY_ATTEMPTS}), retrying...`,
              error
            );
          }

          // Retry with exponential backoff: 2s, 4s, 8s
          const retryInterval = RETRY_BASE_INTERVAL_MS * Math.pow(2, consecutiveErrors - 1);
          timeoutId = window.setTimeout(pollStatus, retryInterval);
          return;
        }

        // After MAX_RETRY_ATTEMPTS, mark as failed with specific error message
        let errorMsg: string;
        if (error instanceof NetworkError) {
          errorMsg = 'Network error: Unable to reach server';
        } else if (error instanceof ApiError) {
          errorMsg = error.body?.message ?? `Server error: ${error.message}`;
        } else if (error instanceof Error) {
          errorMsg = error.message;
        } else {
          errorMsg = 'Failed to check job status';
        }
        const enrichedMsg = `${errorMsg} (after ${MAX_RETRY_ATTEMPTS} retry attempts)`;
        setStatus('failed');
        setErrorMessage(enrichedMsg);
        onErrorRef.current?.(enrichedMsg); // Pass same message to callback
      }
    };

    // Start polling immediately
    pollStatus();

    // Cleanup function
    return () => {
      isMounted = false;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [jobId]); // Only jobId in dependencies

  // Render different UI based on job status
  if (status === 'completed') {
    return (
      <div className="status status--success" role="status" aria-live="polite">
        <p><strong>✓ Processing complete!</strong></p>
        <p className="text-small">
          Your text has been successfully ingested and is now searchable.
        </p>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="status status--error" role="alert" aria-live="assertive">
        <p><strong>✗ Processing failed</strong></p>
        {errorMessage && <p className="text-small">{errorMessage}</p>}
      </div>
    );
  }

  if (status === 'running') {
    return (
      <div className="status status--info" role="status" aria-live="polite">
        <p className="loading">Processing your text</p>
        <p className="text-small">
          Extracting content, chunking text, and generating embeddings...
        </p>
      </div>
    );
  }

  // Default: pending/queued
  return (
    <div className="status status--pending" role="status" aria-live="polite">
      <p className="loading">Job queued</p>
      <p className="text-small">Waiting for worker to pick up the job...</p>
    </div>
  );
}
