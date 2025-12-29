import { useEffect, useState, useRef } from 'react';
import { getJobStatus } from '@/api/client';
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

    const pollStatus = async () => {
      try {
        const response: StatusResponse = await getJobStatus(jobId);

        if (!isMounted) return;

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
        const nextInterval = Math.min(1000 * Math.pow(1.5, pollCount), 10000);
        timeoutId = window.setTimeout(pollStatus, nextInterval);
      } catch (error) {
        if (!isMounted) return;

        // On API error, show failure state
        const errorMsg = error instanceof Error
          ? error.message
          : 'Failed to check job status';
        setStatus('failed');
        setErrorMessage(errorMsg);
        onErrorRef.current?.(errorMsg);
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
