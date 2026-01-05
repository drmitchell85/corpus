import { useState, useCallback, useRef, useEffect } from 'react';
import { getChunkContext, getChunksBefore, getChunksAfter, ApiError, NetworkError } from '@/api';
import type { ChunkContext, ChunkItem } from '@/types/api';

interface UseChunkContextState {
  context: ChunkContext | null;
  isLoading: boolean;
  isLoadingBefore: boolean;
  isLoadingAfter: boolean;
  error: string | null;
}

export interface UseChunkContextReturn extends UseChunkContextState {
  fetchContext: (id: number, window?: number) => Promise<void>;
  loadMoreBefore: (limit?: number) => Promise<void>;
  loadMoreAfter: (limit?: number) => Promise<void>;
}

export function useChunkContext(): UseChunkContextReturn {
  const [state, setState] = useState<UseChunkContextState>({
    context: null,
    isLoading: false,
    isLoadingBefore: false,
    isLoadingAfter: false,
    error: null,
  });

  // Unmount guard to prevent state updates after component unmounts
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true; // Reset to true on every mount (handles StrictMode remounts)
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchContext = useCallback(async (id: number, window: number = 1) => {
    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    try {
      const context = await getChunkContext(id, window);

      // Prevent state update if component unmounted during fetch
      if (!mountedRef.current) return;

      setState({
        context,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      // Prevent state update if component unmounted during fetch
      if (!mountedRef.current) return;

      let message: string;

      if (err instanceof NetworkError) {
        // Network errors: DNS failure, connection refused, offline, timeout
        message = 'Network error: Unable to reach the server. Please check your connection.';
      } else if (err instanceof ApiError) {
        // Server errors: 4xx, 5xx responses with structured error info
        if (err.status === 404) {
          message = 'Chunk not found. It may have been deleted.';
        } else {
          message = err.body?.message ?? `Server error: ${err.message}`;
        }
      } else if (err instanceof Error && err.message.includes('Invalid chunk ID')) {
        // Client-side validation error
        message = err.message;
      } else {
        // Unexpected errors (should be rare with proper error handling)
        // Log to console for debugging - in production, send to error tracking service (Sentry, etc.)
        console.error('Unexpected error in fetchContext:', err);
        message = 'An unexpected error occurred';
      }

      setState({
        context: null,
        isLoading: false,
        isLoadingBefore: false,
        isLoadingAfter: false,
        error: message,
      });
    }
  }, []);

  const loadMoreBefore = useCallback(async (limit: number = 3) => {
    // Use setState to check guards with current state and get chunk ID
    // This avoids stale closure issues with accessing state.context directly
    let shouldProceed = false;
    let earliestChunkId: number | null = null;

    setState((prev) => {
      // Cannot load more if no context loaded yet
      if (!prev.context) {
        return prev;
      }

      // Cannot load more if already loading
      if (prev.isLoadingBefore) {
        return prev;
      }

      // Cannot load more if no more chunks before
      if (!prev.context.has_more_before) {
        return prev;
      }

      // Get the earliest chunk we currently have
      const earliestChunk = prev.context.before_chunks.length > 0
        ? prev.context.before_chunks[0]
        : prev.context.current_chunk;

      // Signal that we should proceed with fetch
      shouldProceed = true;
      earliestChunkId = earliestChunk.id;

      return {
        ...prev,
        isLoadingBefore: true,
      };
    });

    // Early exit if guards failed
    if (!shouldProceed || !earliestChunkId) return;

    try {
      // Fetch chunks that come before the earliest chunk
      const newChunks = await getChunksBefore(earliestChunkId, limit);

      // Prevent state update if component unmounted during fetch
      if (!mountedRef.current) return;

      // Prepend new chunks to existing before_chunks
      setState((prev) => {
        if (!prev.context) return prev;

        return {
          ...prev,
          isLoadingBefore: false,
          context: {
            ...prev.context,
            before_chunks: [...newChunks, ...prev.context.before_chunks],
            // Update has_more_before: if we got fewer chunks than requested, no more
            has_more_before: newChunks.length === limit,
          },
        };
      });
    } catch (err) {
      // Prevent state update if component unmounted during fetch
      if (!mountedRef.current) return;

      // Handle error gracefully - just stop loading, don't clear entire context
      setState((prev) => ({
        ...prev,
        isLoadingBefore: false,
      }));

      // Log error for debugging
      console.error('Error loading more chunks before:', err);
    }
  }, []); // Empty deps - all guards use current state via setState

  const loadMoreAfter = useCallback(async (limit: number = 3) => {
    // Use setState to check guards with current state and get chunk ID
    // This avoids stale closure issues with accessing state.context directly
    let shouldProceed = false;
    let latestChunkId: number | null = null;

    setState((prev) => {
      // Cannot load more if no context loaded yet
      if (!prev.context) {
        return prev;
      }

      // Cannot load more if already loading
      if (prev.isLoadingAfter) {
        return prev;
      }

      // Cannot load more if no more chunks after
      if (!prev.context.has_more_after) {
        return prev;
      }

      // Get the latest chunk we currently have
      const latestChunk = prev.context.after_chunks.length > 0
        ? prev.context.after_chunks[prev.context.after_chunks.length - 1]
        : prev.context.current_chunk;

      // Signal that we should proceed with fetch
      shouldProceed = true;
      latestChunkId = latestChunk.id;

      return {
        ...prev,
        isLoadingAfter: true,
      };
    });

    // Early exit if guards failed
    if (!shouldProceed || !latestChunkId) return;

    try {
      // Fetch chunks that come after the latest chunk
      const newChunks = await getChunksAfter(latestChunkId, limit);

      // Prevent state update if component unmounted during fetch
      if (!mountedRef.current) return;

      // Append new chunks to existing after_chunks
      setState((prev) => {
        if (!prev.context) return prev;

        return {
          ...prev,
          isLoadingAfter: false,
          context: {
            ...prev.context,
            after_chunks: [...prev.context.after_chunks, ...newChunks],
            // Update has_more_after: if we got fewer chunks than requested, no more
            has_more_after: newChunks.length === limit,
          },
        };
      });
    } catch (err) {
      // Prevent state update if component unmounted during fetch
      if (!mountedRef.current) return;

      // Handle error gracefully - just stop loading, don't clear entire context
      setState((prev) => ({
        ...prev,
        isLoadingAfter: false,
      }));

      // Log error for debugging
      console.error('Error loading more chunks after:', err);
    }
  }, []); // Empty deps - all guards use current state via setState

  return {
    ...state,
    fetchContext,
    loadMoreBefore,
    loadMoreAfter,
  };
}
